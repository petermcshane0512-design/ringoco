import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { provisionNumberForUser } from '@/lib/provisionNumber'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const MAX_ATTEMPTS = 5
// Exponential backoff: 5min, 15min, 1h, 6h, 24h
const BACKOFF_MS = [5, 15, 60, 360, 1440].map(m => m * 60 * 1000)

/**
 * Provision-retry cron — runs every 30 minutes.
 *
 * Picks up rows in provisioning_failures (status='pending') whose next_retry_at
 * has passed and re-runs provisionNumberForUser. On success: marks resolved.
 * On failure: increments attempts, schedules next retry. After MAX_ATTEMPTS,
 * escalates to manual_review and SMS Peter again with full context.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = { attempted: 0, resolved: 0, retrying: 0, escalated: 0 }

  const { data: failures } = await supabase
    .from('provisioning_failures')
    .select('*')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .limit(50)

  for (const f of failures ?? []) {
    stats.attempted++

    let result: { ok: true; phoneNumber: string } | { ok: false; error: string }
    try {
      const r = await provisionNumberForUser(f.user_id)
      result = r.ok ? { ok: true, phoneNumber: r.phoneNumber } : { ok: false, error: r.error }
    } catch (e) {
      result = { ok: false, error: (e as Error).message }
    }

    if (result.ok) {
      await supabase
        .from('provisioning_failures')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', f.id)
      stats.resolved++

      // Send the welcome SMS that was skipped during the original webhook failure
      try {
        const { data: contractor } = await supabase
          .from('profiles')
          .select('owner_phone, business_name, welcomed_at')
          .eq('user_id', f.user_id)
          .maybeSingle()

        if (contractor?.owner_phone && !contractor.welcomed_at) {
          await twilioClient.messages.create({
            body: `Welcome to BellAveGo, ${contractor.business_name || 'partner'}! Your AI receptionist is now live at ${result.phoneNumber}. Next step: set up call forwarding so missed calls ring through. Walkthrough: https://www.bellavego.com/dashboard/forwarding — Peter`,
            from: result.phoneNumber,
            to: contractor.owner_phone,
          })
          await supabase.from('profiles').update({ welcomed_at: new Date().toISOString() }).eq('user_id', f.user_id)
        }
      } catch (e) {
        console.error('post-retry welcome SMS failed:', e)
      }
      continue
    }

    // Failure — bump attempts + schedule next retry, or escalate.
    const nextAttempts = (f.attempts ?? 1) + 1
    if (nextAttempts > MAX_ATTEMPTS) {
      await supabase
        .from('provisioning_failures')
        .update({
          status: 'manual_review',
          last_error: result.error,
          attempts: nextAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq('id', f.id)
      stats.escalated++

      // Tell Peter — this one needs hands-on
      try {
        await twilioClient.messages.create({
          body:
            `🆘 Provisioning STILL failing after ${MAX_ATTEMPTS} retries — ${f.business_name || f.user_id}\n\n` +
            `Last error: ${result.error}\n\n` +
            `Customer is paid but stuck. Manual override needed: https://www.bellavego.com/admin/provisioning`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
        })
      } catch (e) {
        console.error('escalation SMS failed:', e)
      }
    } else {
      const backoff = BACKOFF_MS[Math.min(nextAttempts - 1, BACKOFF_MS.length - 1)]
      await supabase
        .from('provisioning_failures')
        .update({
          attempts: nextAttempts,
          last_error: result.error,
          next_retry_at: new Date(Date.now() + backoff).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', f.id)
      stats.retrying++
    }
  }

  // ── Welcome-SMS recovery ─────────────────────────────────────────
  // Catches the silent failure where provisioning SUCCEEDED but the welcome
  // SMS in the Stripe webhook failed (Twilio outage at that exact moment).
  // Without this, a paying customer never learns their AI is live.
  //
  // Targets: active customers with a provisioned Twilio number whose
  //   welcomed_at is still null and whose row is >5 min old (gives the
  //   original webhook a chance to land first) but <24 hours old (after
  //   that, we escalate to Peter).
  type WelcomeStats = { sent: number; errors: number; escalated: number }
  const wStats: WelcomeStats = { sent: 0, errors: 0, escalated: 0 }
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const dayAgo    = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: stuckWelcomes } = await supabase
    .from('profiles')
    .select('user_id, owner_phone, business_name, twilio_number, created_at, welcome_escalated_at')
    .eq('is_active', true)
    .is('welcomed_at', null)
    .not('twilio_number', 'is', null)
    .not('owner_phone', 'is', null)
    .lt('created_at', fiveMinAgo)
    .limit(50)

  for (const p of stuckWelcomes ?? []) {
    const isOlderThanDay = new Date(p.created_at).getTime() < new Date(dayAgo).getTime()

    try {
      await twilioClient.messages.create({
        body: `Welcome to BellAveGo, ${p.business_name || 'partner'}! Your AI receptionist is live at ${p.twilio_number}. Next step: set up call forwarding so missed calls ring through. Walkthrough: https://www.bellavego.com/dashboard/forwarding — Peter`,
        from: p.twilio_number,
        to: p.owner_phone,
      })
      await supabase.from('profiles').update({ welcomed_at: new Date().toISOString() }).eq('user_id', p.user_id)
      wStats.sent++
    } catch (e) {
      wStats.errors++
      // After 24h of failures, ping Peter once — Twilio is clearly broken
      // for this number or the contractor's carrier is rejecting. Manual touch.
      const profileWithEscalation = p as typeof p & { welcome_escalated_at?: string | null }
      if (isOlderThanDay && !profileWithEscalation.welcome_escalated_at) {
        try {
          await twilioClient.messages.create({
            body:
              `⏰ Welcome SMS stuck > 24h — ${p.business_name || p.user_id}\n\n` +
              `Number: ${p.twilio_number} → ${p.owner_phone}\n` +
              `Last error: ${(e as Error).message}\n\n` +
              `They paid, got a number, but never got the welcome. Reach out personally. https://www.bellavego.com/admin/queue`,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
          })
          await supabase
            .from('profiles')
            .update({ welcome_escalated_at: new Date().toISOString() })
            .eq('user_id', p.user_id)
          wStats.escalated++
        } catch (escErr) {
          console.error('welcome escalation SMS failed:', escErr)
        }
      }
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'provision-retry',
    notes: JSON.stringify({ ...stats, welcome: wStats }),
  })

  return NextResponse.json({ ok: true, ...stats, welcome: wStats })
}
