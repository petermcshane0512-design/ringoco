import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, ADMIN_EMAIL_SET } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/cleanup-test-subs — cancel Peter's own test/duplicate
 * subscriptions, keep ONE (2026-06-12, per Peter "delete the account so
 * only my active one is active").
 *
 * SAFETY:
 *   - Only ever touches subs classified INTERNAL: customer email in
 *     ADMIN_EMAILS, OR promo code starts with PETER. A real customer sub
 *     can never be selected, even by mistake.
 *   - Dry run by DEFAULT. Nothing cancels without ?confirm=1.
 *   - Keeps the sub id passed as ?keep=sub_xxx. Without it, the dry run
 *     proposes a keeper (newest internal sub) but cancels nothing.
 *   - Cancels immediately (not at period end) so the card stops being
 *     charged now. Logs each action.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type SubInfo = {
  id: string
  customer_id: string
  email: string | null
  net_monthly: number
  list_monthly: number
  promo_code: string | null
  status: string
  created: string
}

async function listInternalSubs(): Promise<SubInfo[]> {
  const subs = await stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer', 'data.discounts.promotion_code', 'data.discounts.coupon'],
  })
  const out: SubInfo[] = []
  for (const s of subs.data) {
    if (!['active', 'trialing', 'past_due'].includes(s.status)) continue
    const cust = s.customer as Stripe.Customer | Stripe.DeletedCustomer
    const email = 'deleted' in cust && cust.deleted ? null : (cust as Stripe.Customer).email ?? null
    const item = s.items.data[0]
    const unit = (item?.price?.unit_amount ?? 0) / 100
    const interval = item?.price?.recurring?.interval ?? 'month'
    const listMonthly = interval === 'year' ? unit / 12 : unit
    const disc = (s.discounts?.[0] ?? null) as Stripe.Discount | null
    const promo = disc?.promotion_code
    const promoCode = typeof promo === 'object' && promo ? promo.code : null
    const coupon = (disc as unknown as { coupon?: { percent_off?: number | null; amount_off?: number | null } | null })?.coupon ?? null
    let netMonthly = listMonthly
    if (coupon?.percent_off) netMonthly = listMonthly * (1 - coupon.percent_off / 100)
    else if (coupon?.amount_off) netMonthly = Math.max(0, listMonthly - coupon.amount_off / 100)
    const internal = (!!email && ADMIN_EMAIL_SET.has(email.toLowerCase()))
      || (promoCode ?? '').toUpperCase().startsWith('PETER')
    if (!internal) continue
    out.push({
      id: s.id,
      customer_id: typeof s.customer === 'string' ? s.customer : cust.id,
      email,
      net_monthly: Math.round(netMonthly),
      list_monthly: Math.round(listMonthly),
      promo_code: promoCode,
      status: s.status,
      created: new Date(s.created * 1000).toISOString(),
    })
  }
  // Newest first.
  out.sort((a, b) => b.created.localeCompare(a.created))
  return out
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const confirm = req.nextUrl.searchParams.get('confirm') === '1'
  const keep = req.nextUrl.searchParams.get('keep')

  const internal = await listInternalSubs()
  if (internal.length === 0) {
    return NextResponse.json({ ok: true, message: 'no internal/test subs found', internal: [] })
  }

  // Keeper: the explicitly-passed id, else the newest internal sub.
  const keeperId = keep && internal.some((s) => s.id === keep) ? keep : internal[0].id
  const toCancel = internal.filter((s) => s.id !== keeperId)

  if (!confirm) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      total_internal: internal.length,
      would_keep: internal.find((s) => s.id === keeperId),
      would_cancel: toCancel,
      monthly_card_burn_being_stopped: toCancel.reduce((s, x) => s + x.net_monthly, 0),
      to_execute: 'POST again with ?confirm=1 (optionally &keep=sub_xxx to pick the survivor)',
    })
  }

  const cancelled: Array<{ id: string; ok: boolean; error?: string }> = []
  for (const s of toCancel) {
    try {
      await stripe.subscriptions.cancel(s.id)
      cancelled.push({ id: s.id, ok: true })
      console.log(`[cleanup-test-subs] cancelled ${s.id} (${s.email}, $${s.net_monthly}/mo)`)
    } catch (e) {
      cancelled.push({ id: s.id, ok: false, error: (e as Error).message })
    }
  }

  return NextResponse.json({
    ok: true,
    kept: internal.find((s) => s.id === keeperId),
    cancelled,
    cancelled_count: cancelled.filter((c) => c.ok).length,
    failed_count: cancelled.filter((c) => !c.ok).length,
  })
}
