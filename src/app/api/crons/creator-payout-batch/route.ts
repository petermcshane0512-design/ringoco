import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Weekly creator payout batch.
 *
 * GET/POST /api/crons/creator-payout-batch
 *
 * Schedule (vercel.json):  Friday 14:00 UTC = 10:00 ET. (See cron entry.)
 *
 * Algorithm:
 *   1. Find every ig_creator_outreach row where payable_friday_cents > 0.
 *   2. For each row, create a creator_payouts audit log entry.
 *   3. Move cents from payable_friday_cents → lifetime_paid_cents.
 *   4. Stamp last_payout_at.
 *
 * Settlement method (today):
 *   CSV export — payouts table is the source of truth, Peter manually ACHs
 *   via Mercury once per Friday using the export. Switching to Stripe
 *   Connect transfers when 50+ creators are active.
 *
 * Auth:
 *   - x-vercel-cron header (auto-added by Vercel scheduler), OR
 *   - x-admin-secret matching ADMIN_API_SECRET (for manual triggers)
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const expected = process.env.ADMIN_API_SECRET
  const got = req.headers.get('x-admin-secret')
  if (!expected) return false
  return got === expected
}

function nextFridayDateString(now = new Date()): string {
  // YYYY-MM-DD in UTC. Today if today is Friday, else next Friday.
  const day = now.getUTCDay() // 0 Sun .. 6 Sat, Fri=5
  const daysAhead = day === 5 ? 0 : (5 - day + 7) % 7
  const d = new Date(now)
  d.setUTCDate(now.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

async function handler(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const batchFriday = nextFridayDateString()

  // Pull every creator who has money to be paid this batch.
  const { data: creators, error: fetchErr } = await supabase
    .from('ig_creator_outreach')
    .select('id, handle, promo_code, payable_friday_cents, lifetime_paid_cents, paid_referrals_count, notes')
    .gt('payable_friday_cents', 0)

  if (fetchErr) {
    console.error('[creator-payout-batch] fetch failed:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!creators || creators.length === 0) {
    return NextResponse.json({ ok: true, batch_friday: batchFriday, payouts: [], total_cents: 0, note: 'no payables this week' })
  }

  type CreatorRow = {
    id: string
    handle: string | null
    promo_code: string | null
    payable_friday_cents: number | null
    lifetime_paid_cents: number | null
    paid_referrals_count: number | null
    notes: string | null
  }

  const payouts: Array<{
    creator_id: string
    handle: string | null
    promo_code: string | null
    amount_cents: number
    ref_count_this_batch: number
  }> = []
  let totalCents = 0
  const nowIso = new Date().toISOString()

  for (const c of creators as CreatorRow[]) {
    const amount = c.payable_friday_cents ?? 0
    if (amount <= 0) continue
    // Each $200 = 1 paid ref. Audit log records the count, not just dollars.
    const refCount = Math.round(amount / 20000) || 1

    // Insert audit row first (so we never lose the record if the update below fails).
    const { error: logErr } = await supabase.from('creator_payouts').insert({
      creator_id: c.id,
      promo_code: c.promo_code,
      amount_cents: amount,
      ref_count: refCount,
      batch_friday: batchFriday,
      paid_at: nowIso,
      payment_method: 'csv_export',
      notes: `Automated Friday batch for handle=@${c.handle ?? '?'} (count this batch ${refCount})`,
    })
    if (logErr) {
      console.error('[creator-payout-batch] audit insert failed for', c.handle, logErr.message)
      continue
    }

    // Move cents from payable → lifetime, zero out payable.
    const { error: updErr } = await supabase
      .from('ig_creator_outreach')
      .update({
        payable_friday_cents: 0,
        lifetime_paid_cents: (c.lifetime_paid_cents ?? 0) + amount,
        last_payout_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', c.id)

    if (updErr) {
      console.error('[creator-payout-batch] update failed for', c.handle, updErr.message)
      continue
    }

    payouts.push({
      creator_id: c.id,
      handle: c.handle,
      promo_code: c.promo_code,
      amount_cents: amount,
      ref_count_this_batch: refCount,
    })
    totalCents += amount
  }

  console.log(`[creator-payout-batch] batch ${batchFriday} fired — ${payouts.length} creators paid, total $${(totalCents / 100).toFixed(2)}`)

  return NextResponse.json({
    ok: true,
    batch_friday: batchFriday,
    creators_paid: payouts.length,
    total_cents: totalCents,
    total_dollars: totalCents / 100,
    payouts,
    note: 'Audit rows written to creator_payouts. CSV export available via /api/admin/creator-payouts/export?batch_friday=' + batchFriday,
  })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
