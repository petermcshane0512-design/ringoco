import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/master — data for /admin/master, the one-page founder
 * command view (2026-06-12 per Peter: replaces the ReactFlow "nucleus").
 *
 * Truth sources, deliberately:
 *   - revenue: LIVE Stripe (subscriptions + the promo code each used) —
 *     what the bank sees, never derived from profiles.
 *   - opens/clicks/replies: LIVE Instantly campaign analytics + per-lead
 *     opens. NOT outreach_leads.open_count — that column is polluted
 *     (daily-200-leads importer writes Google review_count into it) and
 *     our own tracking pixel never fires on Instantly-sent mail.
 *   - sends + downstream funnel (report visit → trial → paid): our
 *     outreach_leads table, via head-count queries (row-cap-proof).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

async function countWhere(table: string, build: (q: any) => any): Promise<number> {
  const q = supabase.from(table).select('id', { count: 'exact', head: true })
  const { count } = await build(q)
  return count ?? 0
}

type CampaignRow = {
  name: string
  status: string | number | null
  sent: number
  opens: number
  replies: number
  clicks: number
  bounced: number
}

async function fetchInstantly(): Promise<{
  campaigns: CampaignRow[]
  topOpeners: Array<{ email: string; opens: number; clicks: number; replies: number }>
  error: string | null
}> {
  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return { campaigns: [], topOpeners: [], error: 'INSTANTLY_API_KEY not set' }
  const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  try {
    // All-campaign analytics in one call.
    const ar = await fetch(`${INSTANTLY_BASE}/campaigns/analytics`, { headers })
    if (!ar.ok) return { campaigns: [], topOpeners: [], error: `instantly analytics HTTP ${ar.status}` }
    const aj = await ar.json()
    const rows = (Array.isArray(aj) ? aj : aj.campaigns ?? []) as Array<Record<string, unknown>>
    const campaigns: CampaignRow[] = rows.map((c) => ({
      name: String(c.campaign_name ?? c.name ?? 'campaign'),
      status: (c.campaign_status ?? c.status ?? null) as string | number | null,
      sent: Number(c.emails_sent_count ?? 0),
      opens: Number(c.open_count ?? 0),
      replies: Number(c.reply_count ?? 0),
      clicks: Number(c.link_click_count ?? 0),
      bounced: Number(c.bounced_count ?? 0),
    }))

    // Per-lead opens — paginate leads/list, keep anyone with ≥1 open.
    const openers: Array<{ email: string; opens: number; clicks: number; replies: number }> = []
    let cursor: string | undefined
    for (let page = 0; page < 10; page++) {
      const body: Record<string, unknown> = { limit: 100 }
      if (cursor) body.starting_after = cursor
      const r = await fetch(`${INSTANTLY_BASE}/leads/list`, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!r.ok) break
      const j = await r.json()
      const batch = (j.items || j.data || []) as Array<{ email?: string; email_open_count?: number; email_click_count?: number; email_reply_count?: number }>
      for (const l of batch) {
        const opens = l.email_open_count ?? 0
        if (l.email && opens > 0) {
          openers.push({ email: l.email.toLowerCase(), opens, clicks: l.email_click_count ?? 0, replies: l.email_reply_count ?? 0 })
        }
      }
      cursor = j.next_starting_after as string | undefined
      if (!cursor) break
    }
    openers.sort((a, b) => b.opens - a.opens)
    return { campaigns, topOpeners: openers.slice(0, 20), error: null }
  } catch (e) {
    return { campaigns: [], topOpeners: [], error: (e as Error).message }
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const now = new Date()
  const dayStart = (offsetDays: number) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - offsetDays)
    return d
  }

  // ── REVENUE — live from Stripe ────────────────────────────────────────
  type CustomerRow = {
    email: string | null
    name: string | null
    amount_monthly: number
    interval: string
    status: string
    promo_code: string | null
    started: string | null
  }
  let customers: CustomerRow[] = []
  let stripeError: string | null = null
  try {
    const subs = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      expand: ['data.customer', 'data.discounts.promotion_code'],
    })
    customers = subs.data
      .filter((s) => ['active', 'trialing', 'past_due'].includes(s.status))
      .map((s) => {
        const cust = s.customer as Stripe.Customer | Stripe.DeletedCustomer
        const item = s.items.data[0]
        const unit = (item?.price?.unit_amount ?? 0) / 100
        const interval = item?.price?.recurring?.interval ?? 'month'
        const monthly = interval === 'year' ? unit / 12 : unit
        const disc = (s.discounts?.[0] ?? null) as Stripe.Discount | null
        const promo = disc?.promotion_code
        return {
          email: 'deleted' in cust && cust.deleted ? null : (cust as Stripe.Customer).email ?? null,
          name: 'deleted' in cust && cust.deleted ? null : (cust as Stripe.Customer).name ?? null,
          amount_monthly: Math.round(monthly),
          interval,
          status: s.status,
          promo_code: typeof promo === 'object' && promo ? promo.code : null,
          started: s.start_date ? new Date(s.start_date * 1000).toISOString() : null,
        }
      })
      .sort((a, b) => b.amount_monthly - a.amount_monthly)
  } catch (e) {
    stripeError = (e as Error).message
  }
  const paying = customers.filter((c) => c.status === 'active' || c.status === 'past_due')
  const mrr = paying.reduce((s, c) => s + c.amount_monthly, 0)

  // ── INSTANTLY (opens truth) + DB funnel, concurrently ─────────────────
  const [instantly, pushedTotal, pushedToday, reportVisits, textOptIns, demos, trials, paid] = await Promise.all([
    fetchInstantly(),
    countWhere('outreach_leads', (q) => q.not('pushed_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.gte('pushed_at', dayStart(0).toISOString())),
    countWhere('outreach_leads', (q) => q.not('report_visit_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('text_opt_in_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('demo_booked_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('trial_started_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('paid_at', 'is', null)),
  ])

  const sentTotal = instantly.campaigns.reduce((s, c) => s + c.sent, 0)
  const openTotal = instantly.campaigns.reduce((s, c) => s + c.opens, 0)
  const replyTotal = instantly.campaigns.reduce((s, c) => s + c.replies, 0)
  const clickTotal = instantly.campaigns.reduce((s, c) => s + c.clicks, 0)

  // 14-day push series — exact head-counts per day, cap-proof.
  const days = await Promise.all(
    Array.from({ length: 14 }, async (_, i) => {
      const offset = 13 - i
      const from = dayStart(offset).toISOString()
      const to = dayStart(offset - 1).toISOString()
      const sent = await countWhere('outreach_leads', (q) => q.gte('pushed_at', from).lt('pushed_at', to))
      return { date: from.slice(0, 10), sent }
    }),
  )

  // Join Instantly openers to our table for business/city display.
  const openerEmails = instantly.topOpeners.map((t) => t.email)
  const { data: openerRows } = openerEmails.length
    ? await supabase
        .from('outreach_leads')
        .select('email, business_name, owner_first_name, city, state, trade, report_visit_at, trial_started_at, paid_at, status')
        .in('email', openerEmails)
    : { data: [] as never[] }
  const byEmail = new Map((openerRows ?? []).map((r: { email: string }) => [r.email.toLowerCase(), r]))
  const topOpeners = instantly.topOpeners.map((t) => {
    const m = byEmail.get(t.email) as {
      business_name?: string | null; owner_first_name?: string | null; city?: string | null; state?: string | null
      trade?: string | null; report_visit_at?: string | null; trial_started_at?: string | null; paid_at?: string | null; status?: string | null
    } | undefined
    return {
      email: t.email,
      opens: t.opens,
      clicks: t.clicks,
      replies: t.replies,
      business_name: m?.business_name ?? null,
      owner_first_name: m?.owner_first_name ?? null,
      city: m?.city ?? null,
      state: m?.state ?? null,
      trade: m?.trade ?? null,
      report_visit_at: m?.report_visit_at ?? null,
      trial_started_at: m?.trial_started_at ?? null,
      paid_at: m?.paid_at ?? null,
      status: m?.status ?? null,
    }
  })

  // ── LEADS PULSE ───────────────────────────────────────────────────────
  const [inventoryTotal, inventoryEnforcement, dropsWeek] = await Promise.all([
    countWhere('leads', (q) => q.neq('source', 'aging_hvac')),
    countWhere('leads', (q) => q.eq('source_details->>provider', 'enforcement')),
    countWhere('lead_drops', (q) => q.gte('drop_date', dayStart(7).toISOString())),
  ])

  return NextResponse.json({
    asOf: now.toISOString(),
    revenue: {
      paying_customers: paying.length,
      trialing: customers.filter((c) => c.status === 'trialing').length,
      mrr,
      arr: mrr * 12,
      customers,
      stripe_error: stripeError,
    },
    outreach: {
      pushed_total: pushedTotal,
      pushed_today: pushedToday,
      emails_sent: sentTotal,
      opened_total: openTotal,
      open_rate: sentTotal > 0 ? openTotal / sentTotal : 0,
      replies: replyTotal,
      clicks: clickTotal,
      report_visits: reportVisits,
      text_opt_ins: textOptIns,
      demos_booked: demos,
      trials: trials,
      paid_conversions: paid,
      campaigns: instantly.campaigns,
      instantly_error: instantly.error,
      days,
      top_openers: topOpeners,
    },
    leads: {
      inventory_total: inventoryTotal,
      inventory_enforcement: inventoryEnforcement,
      drops_last_7d: dropsWeek,
    },
  })
}
