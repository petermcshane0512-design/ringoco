import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, ADMIN_EMAIL_SET } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const maxDuration = 45

/**
 * GET /api/admin/connectors — the financial/health strip under the call
 * board (2026-06-13 per Peter). Money + green status across every connector:
 * Apify (real $ usage), BatchData (our spend log — no balance API), Instantly
 * (send usage), Supabase + Vercel health, Stripe ARR + REAL signed-up
 * clients. Each source independent + resilient — one failure never blanks
 * the rest. Admin-gated.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const monthAgo = new Date(Date.now() - 30 * 86400000)

  // ── APIFY — real $ usage this cycle ───────────────────────────────────
  let apify: { used: number | null; cap: number | null; plan: string | null; error?: string } = { used: null, cap: null, plan: null }
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${process.env.APIFY_API_TOKEN}`)
    if (r.ok) {
      const j = await r.json()
      apify = {
        used: Number(j.data?.current?.monthlyUsageUsd ?? 0),
        cap: Number(j.data?.limits?.maxMonthlyUsageUsd ?? 0),
        plan: null,
      }
    } else apify.error = `HTTP ${r.status}`
  } catch (e) { apify.error = (e as Error).message }

  // ── BATCHDATA — our spend log (no balance API) ────────────────────────
  let batchdata: { spent_today: number; spent_30d: number; daily_cap: number; error?: string } = { spent_today: 0, spent_30d: 0, daily_cap: Number(process.env.BATCHDATA_DAILY_CAP_USD ?? 10) }
  try {
    const { data: today } = await supabase.from('batchdata_spend_log').select('cost_cents').gte('spent_at', dayStart.toISOString())
    const { data: m } = await supabase.from('batchdata_spend_log').select('cost_cents').gte('spent_at', monthAgo.toISOString())
    batchdata.spent_today = (today ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0) / 100
    batchdata.spent_30d = (m ?? []).reduce((s, r) => s + (r.cost_cents ?? 0), 0) / 100
  } catch (e) { batchdata.error = (e as Error).message }

  // ── INSTANTLY — send usage (subscription, no $ balance) ───────────────
  let instantly: { sent_today: number | null; daily_limit: number | null; status: number | string | null; error?: string } = { sent_today: null, daily_limit: null, status: null }
  try {
    const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
    const headers = { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` }
    const cr = await fetch(`https://api.instantly.ai/api/v2/campaigns/${CAMPAIGN}`, { headers })
    if (cr.ok) {
      const c = await cr.json()
      instantly.status = c.status
      instantly.daily_limit = c.daily_limit ?? c.campaign_schedule?.daily_limit ?? null
    }
    const today = new Date().toISOString().slice(0, 10)
    const dr = await fetch(`https://api.instantly.ai/api/v2/campaigns/analytics/daily?start_date=${today}&end_date=${today}`, { headers })
    if (dr.ok) {
      const dj = await dr.json()
      const rows = (Array.isArray(dj) ? dj : dj.data ?? []) as Array<Record<string, unknown>>
      instantly.sent_today = rows.reduce((s, r) => s + Number(r.sent ?? 0), 0)
    }
  } catch (e) { instantly.error = (e as Error).message }

  // ── SUPABASE / VERCEL health ──────────────────────────────────────────
  let supabaseGreen = false
  try {
    const { error } = await supabase.from('leads').select('id', { count: 'exact', head: true }).limit(1)
    supabaseGreen = !error
  } catch { supabaseGreen = false }
  // This endpoint executing at all = Vercel is serving.
  const vercelGreen = true

  // ── STRIPE — ARR + REAL signed-up clients (exclude founder/test) ──────
  let arr = 0
  let clients: Array<{ email: string | null; name: string | null; monthly: number; status: string; since: string | null }> = []
  let stripeError: string | null = null
  try {
    const subs = await stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer', 'data.discounts.promotion_code', 'data.discounts.coupon'] })
    for (const s of subs.data) {
      if (!['active', 'past_due'].includes(s.status)) continue
      const cust = s.customer as Stripe.Customer | Stripe.DeletedCustomer
      const email = 'deleted' in cust && cust.deleted ? null : (cust as Stripe.Customer).email ?? null
      const item = s.items.data[0]
      const unit = (item?.price?.unit_amount ?? 0) / 100
      const interval = item?.price?.recurring?.interval ?? 'month'
      const list = interval === 'year' ? unit / 12 : unit
      const disc = (s.discounts?.[0] ?? null) as Stripe.Discount | null
      const promo = disc?.promotion_code
      const promoCode = typeof promo === 'object' && promo ? promo.code : null
      const coupon = (disc as unknown as { coupon?: { percent_off?: number | null; amount_off?: number | null } | null })?.coupon ?? null
      let net = list
      if (coupon?.percent_off) net = list * (1 - coupon.percent_off / 100)
      else if (coupon?.amount_off) net = Math.max(0, list - coupon.amount_off / 100)
      const internal = (!!email && ADMIN_EMAIL_SET.has(email.toLowerCase())) || (promoCode ?? '').toUpperCase().startsWith('PETER')
      if (internal || net <= 0) continue   // REAL paying clients only
      arr += Math.round(net) * 12
      clients.push({ email, name: 'deleted' in cust && cust.deleted ? null : (cust as Stripe.Customer).name ?? null, monthly: Math.round(net), status: s.status, since: s.start_date ? new Date(s.start_date * 1000).toISOString() : null })
    }
    clients.sort((a, b) => b.monthly - a.monthly)
  } catch (e) { stripeError = (e as Error).message }

  return NextResponse.json({
    asOf: new Date().toISOString(),
    arr,
    clients,
    stripe_error: stripeError,
    connectors: {
      apify,
      batchdata,
      instantly,
      supabase: { green: supabaseGreen },
      vercel: { green: vercelGreen },
    },
  })
}
