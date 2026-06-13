import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/activation-watchdog — 2026-06-13 build.
 *
 * Path-to-100-by-Sept-1 critical safety net. The most expensive failure
 * mode of this business is a paid customer who signs up, sees zero leads
 * in their dashboard for 30+ minutes, and refunds before Peter can call.
 * The post-checkout `after()` chain in the Stripe webhook fires
 * discover-for-tenant + fireLeadEngineForUser fire-and-forget — if either
 * step throws or returns no leads, NOTHING surfaces today; the customer
 * silently sits on an empty dashboard until they hit cancel.
 *
 * This cron runs every 5 minutes and finds:
 *   - profiles paid in the last 4 hours
 *   - that have zero rows in lead_drops
 *   - whose first_paid_charge_at is > 25 min ago (giving the day-1 chain
 *     enough time to actually finish — discover-for-tenant + BatchData
 *     can take 60-90 sec, lead-engine drop another 20)
 *   - that we haven't already alerted on (gated by
 *     activation_watchdog_alerted_at column)
 *
 * For each hit, SMS Peter with the contractor's name + email + phone + a
 * one-tap dashboard impersonate link so he can call them WITHIN the
 * refund window (3-day Stripe), apologize, and either fix delivery or
 * refund + onboard manually.
 *
 * Hormozi: speed-to-recovery is what saves the lost customer. If Peter
 * calls within 30 min of the silent failure, retention to month 2
 * actually goes UP (the "they cared enough to call me personally"
 * effect) vs. customers whose day-1 delivery just worked.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

type PaidProfile = {
  user_id: string
  email: string | null
  business_name: string | null
  owner_first_name: string | null
  owner_phone: string | null
  first_paid_charge_at: string | null
  activation_watchdog_alerted_at: string | null
  service_zips: string[] | null
  business_address: string | null
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'

  const now = Date.now()
  const minPaidAtIso = new Date(now - 4 * 3600 * 1000).toISOString()      // paid in last 4h
  const maxPaidAtIso = new Date(now - 25 * 60 * 1000).toISOString()       // but > 25min ago

  const { data: candidates, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, email, business_name, owner_first_name, owner_phone, first_paid_charge_at, activation_watchdog_alerted_at, service_zips, business_address')
    .gte('first_paid_charge_at', minPaidAtIso)
    .lte('first_paid_charge_at', maxPaidAtIso)
    .is('activation_watchdog_alerted_at', null)
    .limit(50)

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, alerted: 0, message: 'no recent paid customers in watch window' })
  }

  const userIds = (candidates as PaidProfile[]).map((p) => p.user_id)
  const { data: drops } = await supabase
    .from('lead_drops')
    .select('user_id')
    .in('user_id', userIds)

  const usersWithDrops = new Set((drops || []).map((d) => (d as { user_id: string }).user_id))

  const failing = (candidates as PaidProfile[]).filter((p) => !usersWithDrops.has(p.user_id))

  if (failing.length === 0) {
    return NextResponse.json({ ok: true, scanned: candidates.length, alerted: 0, message: 'all recent paid customers have leads' })
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      scanned: candidates.length,
      would_alert: failing.length,
      sample: failing.slice(0, 5).map((p) => ({
        user_id: p.user_id,
        email: p.email,
        business_name: p.business_name,
        paid_at: p.first_paid_charge_at,
      })),
    })
  }

  const founderPhone = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
  let alerted = 0
  const errors: string[] = []

  for (const p of failing) {
    try {
      const minsSincePaid = Math.round((now - new Date(p.first_paid_charge_at!).getTime()) / 60000)
      const phoneClean = p.owner_phone?.replace(/[^\d+]/g, '') || ''
      const zip = Array.isArray(p.service_zips) ? p.service_zips[0] : ''
      const sms =
        `🚨 ACTIVATION FAILURE — paid ${minsSincePaid}m ago, ZERO leads delivered\n\n` +
        `${p.business_name || '(unknown shop)'}${p.owner_first_name ? ` (${p.owner_first_name})` : ''}\n` +
        `${zip || '—'} · ${p.business_address || '—'}\n` +
        `Email: ${p.email || '—'}\n` +
        `Phone: ${phoneClean || '—'}\n\n` +
        `CALL THEM NOW — apologize, fix delivery, or refund before they hit cancel.\n` +
        `Dashboard: https://www.bellavego.com/admin/impersonate?user_id=${p.user_id}`

      if (fromNumber) {
        await twilioClient.messages.create({
          body: sms,
          from: fromNumber,
          to: founderPhone,
        })
      }

      await supabase
        .from('profiles')
        .update({ activation_watchdog_alerted_at: new Date().toISOString() })
        .eq('user_id', p.user_id)

      alerted++
    } catch (e) {
      errors.push(`${p.email}: ${(e as Error).message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: candidates.length,
    alerted,
    errors: errors.length > 0 ? errors : undefined,
  })
}
