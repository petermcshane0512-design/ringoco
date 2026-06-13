import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, ADMIN_EMAIL_SET } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import type Stripe from 'stripe'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/master — data for /admin/master, the CEO Nucleus
 * (2026-06-12 redesign per Peter: dense founder command center —
 * "what do I do right now?").
 *
 * Adds to the original metrics payload:
 *   - call_queue: priority-scored prospects (REPLIED=100 pinned, click=80
 *     decaying 5/day, 3+ opens=60 decaying, +20 if active in last 2h).
 *     Joined to outreach_leads for PHONE + business + location, to
 *     prospect_free_leads for real click/visit timestamps, and to
 *     lead_dispositions (dispositioned rows drop out; no_answer
 *     re-surfaces after 24h).
 *   - ledger: every engaged prospect w/ counts + stage, for the
 *     Today/Yesterday/All tabs (filtered client-side by last activity).
 *
 * Truth sources unchanged: Stripe for money, Instantly for opens/clicks/
 *   replies (per-lead via leads/list), our DB for sends + funnel.
 * KNOWN GAP: Instantly leads/list has no per-lead LAST-OPEN timestamp —
 *   last_activity comes from real click/visit times (prospect_free_leads)
 *   and our tracked opens where present; otherwise null, shown as "—".
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

// State → IANA timezone (good-enough founder map; default Chicago).
const STATE_TZ: Record<string, string> = {
  IL: 'America/Chicago', TX: 'America/Chicago', MO: 'America/Chicago', WI: 'America/Chicago',
  MN: 'America/Chicago', LA: 'America/Chicago', OK: 'America/Chicago', KS: 'America/Chicago',
  TN: 'America/Chicago', AL: 'America/Chicago', MS: 'America/Chicago', AR: 'America/Chicago',
  IA: 'America/Chicago', NE: 'America/Chicago',
  NY: 'America/New_York', NJ: 'America/New_York', PA: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', NC: 'America/New_York', SC: 'America/New_York', VA: 'America/New_York',
  MA: 'America/New_York', CT: 'America/New_York', MD: 'America/New_York', OH: 'America/New_York',
  MI: 'America/New_York', IN: 'America/New_York', KY: 'America/New_York', DC: 'America/New_York',
  AZ: 'America/Phoenix',
  CO: 'America/Denver', UT: 'America/Denver', NM: 'America/Denver', MT: 'America/Denver',
  WY: 'America/Denver', ID: 'America/Denver',
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', WA: 'America/Los_Angeles', OR: 'America/Los_Angeles',
}
const STATE_NAMES: Record<string, string> = {
  illinois: 'IL', texas: 'TX', 'new york': 'NY', florida: 'FL', california: 'CA', nevada: 'NV',
  arizona: 'AZ', georgia: 'GA', colorado: 'CO', washington: 'WA', oregon: 'OR', ohio: 'OH',
}
function tzForState(stateRaw: string | null): string {
  const s = (stateRaw || '').trim()
  const abbr = s.length === 2 ? s.toUpperCase() : STATE_NAMES[s.toLowerCase()] ?? ''
  return STATE_TZ[abbr] ?? 'America/Chicago'
}
function localClock(tz: string, now: Date): { time: string; in_window: boolean } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
  const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false })
  const hour = parseInt(hourFmt.format(now), 10)
  return { time: fmt.format(now), in_window: hour >= 8 && hour < 18 }
}

type EngagedLead = { email: string; opens: number; clicks: number; replies: number }
type CampaignRow = { name: string; status: string | number | null; sent: number; opens: number; replies: number; clicks: number; bounced: number }

async function fetchInstantly(): Promise<{ campaigns: CampaignRow[]; engaged: EngagedLead[]; sentToday: number | null; openedToday: number | null; error: string | null }> {
  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return { campaigns: [], engaged: [], sentToday: null, openedToday: null, error: 'INSTANTLY_API_KEY not set' }
  const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  // Today's ACTUAL emails sent (UTC) — the dashboard used to show "pushed"
  // (contractors loaded), which read as a far lower number than real sends.
  let sentToday: number | null = null
  let openedToday: number | null = null
  try {
    const today = new Date().toISOString().slice(0, 10)
    const dr = await fetch(`${INSTANTLY_BASE}/campaigns/analytics/daily?start_date=${today}&end_date=${today}`, { headers })
    if (dr.ok) {
      const dj = await dr.json()
      const drows = (Array.isArray(dj) ? dj : dj.data ?? dj.days ?? []) as Array<Record<string, unknown>>
      sentToday = drows.reduce((s, r) => s + Number(r.sent ?? r.emails_sent_count ?? r.sent_count ?? 0), 0)
      openedToday = drows.reduce((s, r) => s + Number(r.opened ?? r.open_count ?? 0), 0)
    }
  } catch { /* non-fatal */ }
  try {
    const ar = await fetch(`${INSTANTLY_BASE}/campaigns/analytics`, { headers })
    if (!ar.ok) return { campaigns: [], engaged: [], sentToday, openedToday, error: `instantly analytics HTTP ${ar.status}` }
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

    // Per-lead engagement — anyone with ≥1 open/click/reply.
    const engaged: EngagedLead[] = []
    let cursor: string | undefined
    for (let page = 0; page < 12; page++) {
      const body: Record<string, unknown> = { limit: 100 }
      if (cursor) body.starting_after = cursor
      const r = await fetch(`${INSTANTLY_BASE}/leads/list`, { method: 'POST', headers, body: JSON.stringify(body) })
      if (!r.ok) break
      const j = await r.json()
      const batch = (j.items || j.data || []) as Array<{ email?: string; email_open_count?: number; email_click_count?: number; email_reply_count?: number }>
      for (const l of batch) {
        const opens = l.email_open_count ?? 0
        const clicks = l.email_click_count ?? 0
        const replies = l.email_reply_count ?? 0
        if (l.email && (opens > 0 || clicks > 0 || replies > 0)) {
          engaged.push({ email: l.email.toLowerCase(), opens, clicks, replies })
        }
      }
      cursor = j.next_starting_after as string | undefined
      if (!cursor) break
    }
    return { campaigns, engaged, sentToday, openedToday, error: null }
  } catch (e) {
    return { campaigns: [], engaged: [], sentToday, openedToday, error: (e as Error).message }
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

  // ── REVENUE — live Stripe, net of coupons, internal split ────────────
  type CustomerRow = {
    email: string | null
    name: string | null
    list_monthly: number
    net_monthly: number
    interval: string
    status: string
    promo_code: string | null
    started: string | null
    internal: boolean
  }
  let customers: CustomerRow[] = []
  let stripeError: string | null = null
  try {
    const subs = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      expand: ['data.customer', 'data.discounts.promotion_code', 'data.discounts.coupon'],
    })
    customers = subs.data
      .filter((s) => ['active', 'trialing', 'past_due'].includes(s.status))
      .map((s) => {
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
        return {
          email,
          name: 'deleted' in cust && cust.deleted ? null : (cust as Stripe.Customer).name ?? null,
          list_monthly: Math.round(listMonthly),
          net_monthly: Math.round(netMonthly),
          interval,
          status: s.status,
          promo_code: promoCode,
          started: s.start_date ? new Date(s.start_date * 1000).toISOString() : null,
          internal,
        }
      })
      .sort((a, b) => Number(a.internal) - Number(b.internal) || b.net_monthly - a.net_monthly)
  } catch (e) {
    stripeError = (e as Error).message
  }
  const external = customers.filter((c) => !c.internal)
  const paying = external.filter((c) => (c.status === 'active' || c.status === 'past_due') && c.net_monthly > 0)
  const mrr = paying.reduce((s, c) => s + c.net_monthly, 0)
  const internalSubs = customers.filter((c) => c.internal)
  const internalBurn = internalSubs.reduce((s, c) => s + c.net_monthly, 0)

  // ── INSTANTLY + DB funnel, concurrently ──────────────────────────────
  const [instantly, pushedTotal, pushedToday, freeLeadVisits, textOptIns, demos, trials, paid] = await Promise.all([
    fetchInstantly(),
    countWhere('outreach_leads', (q) => q.not('pushed_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.gte('pushed_at', dayStart(0).toISOString())),
    countWhere('prospect_free_leads', (q) => q.gt('visit_count', 0)),
    countWhere('outreach_leads', (q) => q.not('text_opt_in_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('demo_booked_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('trial_started_at', 'is', null)),
    countWhere('outreach_leads', (q) => q.not('paid_at', 'is', null)),
  ])

  const sentTotal = instantly.campaigns.reduce((s, c) => s + c.sent, 0)
  const openTotal = instantly.campaigns.reduce((s, c) => s + c.opens, 0)
  const replyTotal = instantly.campaigns.reduce((s, c) => s + c.replies, 0)
  const clickTotal = instantly.campaigns.reduce((s, c) => s + c.clicks, 0)

  // 14-day push series.
  const days = await Promise.all(
    Array.from({ length: 14 }, async (_, i) => {
      const offset = 13 - i
      const from = dayStart(offset).toISOString()
      const to = dayStart(offset - 1).toISOString()
      const sent = await countWhere('outreach_leads', (q) => q.gte('pushed_at', from).lt('pushed_at', to))
      return { date: from.slice(0, 10), sent }
    }),
  )

  // ── CALL QUEUE + LEDGER joins ────────────────────────────────────────
  // 2026-06-12 per Peter — the HOTTEST signal is a free-lead CLICK (they saw
  // the cited homeowner and came back). Instantly reports link clicks as 0,
  // so the queue used to be BLIND to clickers — a 4x-visit prospect never
  // surfaced. We now source the queue from BOTH Instantly engagement AND
  // prospect_free_leads visits, union the two, and score a free-lead click
  // ABOVE any email open.
  const PFL_TEST_BURST_FROM = '2026-06-12T21:33:25.000Z'  // one-off: exclude my 50-row stress test
  const PFL_TEST_BURST_TO = '2026-06-12T21:34:40.000Z'
  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !/@[\d.]+$/.test(e)

  type PflRow = { email: string; visit_count: number | null; last_visited_at: string | null; claimed_at: string | null }
  const [clickersRes, dispRes] = await Promise.all([
    supabase.from('prospect_free_leads')
      .select('email, visit_count, last_visited_at, claimed_at')
      .gt('visit_count', 0)
      .order('last_visited_at', { ascending: false })
      .limit(500),
    // lead_dispositions may not exist pre-migration — tolerate.
    supabase.from('lead_dispositions')
      .select('email, action, created_at')
      .order('created_at', { ascending: false })
      .limit(2000)
      .then((r) => r)
      .then((r) => ('error' in r && r.error ? { data: [] as never[] } : r)),
  ])
  const pflByEmail = new Map<string, PflRow>()
  for (const r of ((clickersRes.data ?? []) as PflRow[])) {
    const email = (r.email || '').toLowerCase()
    if (!validEmail(email)) continue
    // Exclude PURE stress-test pollution: a SINGLE visit stamped inside my
    // test burst. Rows with 2+ visits are real humans who came back (even if
    // my one test hit happens to be their latest touch — e.g. masonrysystem,
    // 4 visits), so they stay.
    const t = r.last_visited_at ?? ''
    const inBurst = t >= PFL_TEST_BURST_FROM && t <= PFL_TEST_BURST_TO
    if (inBurst && (r.visit_count ?? 0) <= 1) continue
    pflByEmail.set(email, r)
  }

  // 2026-06-12 per Peter — robots (Webador/Wix support desks, mailer-daemon,
  // no-reply) auto-"reply" to cold mail and were scoring 100, outranking
  // real humans in the call queue. Filter system/autoresponder addresses so
  // only people you can actually call surface.
  const isRobot = (email: string) =>
    /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce|notification|abuse|noc|hostmaster)\b/i.test(email)
    || /@(webador|wix|squarespace|godaddy|wordpress|weebly|ueniweb)\b/i.test(email)

  // Union: everyone with Instantly engagement OR a real free-lead click.
  const unionEmails = Array.from(new Set([
    ...instantly.engaged.map((e) => e.email),
    ...pflByEmail.keys(),
  ])).filter((e) => validEmail(e) && !isRobot(e))
  const engagedByEmail = new Map(instantly.engaged.map((e) => [e.email, e]))

  type OlRow = { email: string; business_name: string | null; owner_first_name: string | null; owner_phone: string | null; city: string | null; state: string | null; trade: string | null; pushed_at: string | null; first_opened_at: string | null; last_opened_at: string | null; report_visit_at: string | null; trial_started_at: string | null; paid_at: string | null; status: string | null }
  const olRes = unionEmails.length
    ? await supabase.from('outreach_leads')
        .select('email, business_name, owner_first_name, owner_phone, city, state, trade, pushed_at, first_opened_at, last_opened_at, report_visit_at, trial_started_at, paid_at, status')
        .in('email', unionEmails)
    : { data: [] as never[] }
  const olByEmail = new Map(((olRes.data ?? []) as OlRow[]).map((r) => [r.email.toLowerCase(), r]))
  type DispRow = { email: string; action: string; created_at: string }
  const latestDisp = new Map<string, DispRow>()
  for (const d of ((dispRes.data ?? []) as DispRow[])) {
    if (!latestDisp.has(d.email.toLowerCase())) latestDisp.set(d.email.toLowerCase(), d)
  }

  const DAY_MS = 86_400_000
  const rows = unionEmails.map((email) => {
    const e = engagedByEmail.get(email) ?? { email, opens: 0, clicks: 0, replies: 0 }
    const ol = olByEmail.get(email)
    const pfl = pflByEmail.get(email)
    const freeLeadVisits = pfl?.visit_count ?? 0   // real page clicks (the hot signal)
    const clicks = Math.max(e.clicks, freeLeadVisits)
    const lastActivity = [pfl?.last_visited_at, ol?.last_opened_at, ol?.report_visit_at]
      .filter(Boolean).sort().pop() ?? null
    const daysSince = lastActivity ? (now.getTime() - new Date(lastActivity).getTime()) / DAY_MS : null

    // Priority score — a free-lead CLICK outranks any email open.
    let score = 0
    if (e.replies > 0) score = 100
    else if (freeLeadVisits > 0) {
      // Saw their cited homeowner. 85 base + 8/extra visit (came back!),
      // capped at 95 so a hard REPLY (100) still pins above. Decays daily.
      score = Math.max(15, Math.min(95, 85 + 8 * Math.min(freeLeadVisits - 1, 4)) - 5 * Math.floor(daysSince ?? 0))
    } else if (clicks > 0) score = Math.max(10, 80 - 5 * Math.floor(daysSince ?? 0))
    else if (e.opens >= 3) score = Math.max(5, 60 - 5 * Math.floor(daysSince ?? 0))
    else if (e.opens > 0) score = 20
    if (lastActivity && now.getTime() - new Date(lastActivity).getTime() < 2 * 3_600_000) score += 20

    const tz = tzForState(ol?.state ?? null)
    const clock = localClock(tz, now)
    const stage = ol?.paid_at ? 'PAID' : ol?.trial_started_at ? 'TRIAL' : e.replies > 0 ? 'REPLIED'
      : freeLeadVisits > 0 ? 'CLICKED LEAD' : clicks > 0 ? 'CLICKED' : 'OPENED'

    const disp = latestDisp.get(e.email)
    // Dispositioned rows leave the queue; no_answer re-surfaces after 24h.
    const dispositioned = !!disp && !(disp.action === 'no_answer' && now.getTime() - new Date(disp.created_at).getTime() > DAY_MS)

    return {
      email: e.email,
      business: ol?.business_name ?? null,
      contact: ol?.owner_first_name ?? null,   // stubbed where unknown
      phone: ol?.owner_phone ?? null,
      city: ol?.city ?? null,
      state: ol?.state ?? null,
      local_time: clock.time,
      in_call_window: clock.in_window,
      opens: e.opens,
      clicks,
      replies: e.replies,
      last_activity: lastActivity,
      first_contacted: ol?.pushed_at ?? null,
      stage,
      score,
      dispositioned,
      disposition: disp ? disp.action : null,
    }
  })

  const call_queue = rows
    .filter((r) => !r.dispositioned && r.score >= 40 && r.stage !== 'PAID')
    .sort((a, b) => b.score - a.score || (b.last_activity ?? '').localeCompare(a.last_activity ?? ''))
    .slice(0, 50)
  const ledger = rows.sort((a, b) => b.score - a.score)

  // 2026-06-13 per Peter — a straight call-down list of EVERY contractor who
  // opened, ranked by open count, so he can dial top-to-bottom. Includes the
  // low-score openers the call_queue (score>=40) hides. Each carries phone +
  // disposition so a dialed row drops off. NOTE: open_count is cumulative
  // (all-time, not today) and bot/proxy-inflated — a 40+-open row is usually a
  // corporate mail gateway, not a hot human. Real interest still = CLICKERS.
  const openers = rows
    .filter((r) => r.opens > 0 && !r.dispositioned && r.stage !== 'PAID')
    .sort((a, b) => b.opens - a.opens || (b.last_activity ?? '').localeCompare(a.last_activity ?? ''))

  // ── LEADS PULSE ──────────────────────────────────────────────────────
  const [inventoryTotal, inventoryEnforcement, dropsWeek] = await Promise.all([
    countWhere('leads', (q) => q.neq('source', 'aging_hvac')),
    countWhere('leads', (q) => q.eq('source_details->>provider', 'enforcement')),
    countWhere('lead_drops', (q) => q.gte('drop_date', dayStart(7).toISOString())),
  ])

  return NextResponse.json({
    asOf: now.toISOString(),
    call_queue,
    openers,
    ledger,
    revenue: {
      paying_customers: paying.length,
      trialing: external.filter((c) => c.status === 'trialing').length,
      mrr,
      arr: mrr * 12,
      customers,
      internal_subs: internalSubs.length,
      internal_burn_monthly: Math.round(internalBurn),
      stripe_error: stripeError,
    },
    outreach: {
      pushed_total: pushedTotal,
      pushed_today: pushedToday,
      sent_today: instantly.sentToday,
      opened_today: instantly.openedToday,
      emails_sent: sentTotal,
      opened_total: openTotal,
      open_rate: sentTotal > 0 ? openTotal / sentTotal : 0,
      replies: replyTotal,
      clicks: clickTotal,
      report_visits: freeLeadVisits,
      text_opt_ins: textOptIns,
      demos_booked: demos,
      trials: trials,
      paid_conversions: paid,
      campaigns: instantly.campaigns,
      instantly_error: instantly.error,
      days,
    },
    leads: {
      inventory_total: inventoryTotal,
      inventory_enforcement: inventoryEnforcement,
      drops_last_7d: dropsWeek,
    },
  })
}
