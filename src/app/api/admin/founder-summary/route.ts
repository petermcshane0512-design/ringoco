import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { TIER_METADATA, type Tier, isValidTier } from '@/lib/pricing'

/**
 * Admin founder dashboard — aggregate metrics across the whole tenant base.
 *
 * Returns business + per-customer data for the /admin/founder nucleus
 * visualization. Polled every 5 minutes via SWR from the client.
 *
 * Auth: requireAdmin() (x-admin-secret header OR admin Clerk session)
 *
 * Cost note: roughly 6 Supabase queries per call. SWR's 5-min poll means
 * ~288 calls/day per open dashboard tab. Cheap.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Per-call COGS estimate — see CLAUDE.md cost audit. Without Anthropic
// prompt caching ~$0.45/call, with caching ~$0.25. Using midpoint.
const COGS_PER_CALL_USD = 0.30
// Per-customer monthly Twilio number rental.
const TWILIO_NUMBER_RENTAL_USD = 1.15

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  // ── Time windows ────────────────────────────────────────────
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // ── Customers ───────────────────────────────────────────────
  type ProfileRow = {
    user_id: string
    business_name: string | null
    plan_tier: string | null
    is_active: boolean | null
    twilio_number: string | null
    vapi_assistant_id: string | null
    vapi_phone_number_id: string | null
    vapi_import_failed_at: string | null
    vapi_assistant_creation_error: string | null
    forwarding_verified_at: string | null
    created_at: string
    welcomed_at: string | null
    first_call_at: string | null
  }
  // Use select('*') so any optional column whose migration hasn't been
  // run yet (e.g. first_call_at) doesn't crash the whole endpoint with
  // "column profiles.X does not exist". We fall back to null for missing
  // fields downstream — far better than the dashboard going 500.
  const { data: profilesRaw, error: pErr } = await supabase
    .from('profiles')
    .select('*')

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }

  // Cast through unknown — Supabase auto-generated types don't include the
  // vapi_* / forwarding_verified_at / first_call_at columns (they were
  // added in later migrations and types haven't been regenerated).
  const all = (profilesRaw as unknown as ProfileRow[]) || []
  const activeCustomers = all.filter(
    (p) =>
      p.is_active &&
      p.plan_tier &&
      p.plan_tier !== 'cancelled' &&
      p.plan_tier !== 'starter' && // 'starter' is the Clerk-default placeholder; only count paid
      isValidTier(p.plan_tier),
  )

  // ── Calls + leads + bookings ────────────────────────────────
  // Pull cost_usd on the month-scoped query AND today-scoped query so we
  // can compute real spend instead of falling back to the $0.30/call
  // estimate. Per-call cost comes from Vapi's message.cost (bundled
  // STT + LLM + TTS spend). For old rows where cost_usd is null
  // (pre-migration), we still fall back to the estimate so totals don't
  // suddenly collapse.
  const [callsAll, callsToday, callsWeek, leadsMonth, bookingsMonth] = await Promise.all([
    supabase
      .from('call_logs')
      .select('user_id, created_at, cost_usd')
      .gte('created_at', monthStart),
    supabase
      .from('call_logs')
      .select('cost_usd')
      .gte('created_at', todayStart),
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekStart),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart)
      .eq('booking_completed', true),
  ])

  const callsThisMonth = callsAll.data?.length ?? 0
  const callsTodayCount = callsToday.data?.length ?? 0
  const callsWeekCount = callsWeek.count ?? 0
  const leadsCapturedMonth = leadsMonth.count ?? 0
  const bookingsMonthCount = bookingsMonth.count ?? 0

  // Real Vapi-reported spend (with $0.30 fallback for pre-migration rows).
  function rowCost(r: { cost_usd?: number | null }): number {
    return typeof r.cost_usd === 'number' ? r.cost_usd : COGS_PER_CALL_USD
  }
  const costToday = (callsToday.data || []).reduce((s, r) => s + rowCost(r as { cost_usd?: number | null }), 0)
  const costMonthFromActuals = (callsAll.data || []).reduce(
    (s, r) => s + rowCost(r as { cost_usd?: number | null }),
    0,
  )
  // Per-call avg (only over rows that have a real cost_usd)
  const realCostRows = (callsAll.data || []).filter(
    (r) => typeof (r as { cost_usd?: number | null }).cost_usd === 'number',
  )
  const avgCostPerCall =
    realCostRows.length > 0
      ? realCostRows.reduce(
          (s, r) => s + ((r as { cost_usd?: number }).cost_usd ?? 0),
          0,
        ) / realCostRows.length
      : null

  // ── Per-customer call counts (for the customer ring nodes) ──
  const callsByUser = new Map<string, number>()
  for (const c of callsAll.data || []) {
    callsByUser.set(c.user_id, (callsByUser.get(c.user_id) ?? 0) + 1)
  }

  // ── MRR / ARR ───────────────────────────────────────────────
  let mrr = 0
  for (const p of activeCustomers) {
    const meta = TIER_METADATA[p.plan_tier as Tier]
    if (meta) mrr += meta.monthly
  }
  const arr = mrr * 12

  // ── COGS (real where we have it, estimate where we don't) ──
  // cogsCallUsage uses actual Vapi cost from cost_usd when present.
  // For old rows (pre-migration) and any rows where Vapi didn't report
  // cost, fall back to the $0.30/call estimate. Once all rows have
  // cost_usd populated, this becomes 100% truth-source.
  const cogsCallUsage = costMonthFromActuals
  const cogsTwilioRental = activeCustomers.length * TWILIO_NUMBER_RENTAL_USD
  const cogsTotal = cogsCallUsage + cogsTwilioRental
  const grossProfit = mrr - cogsTotal
  const grossMarginPct = mrr > 0 ? Math.round((grossProfit / mrr) * 100) : null

  // ── Per-customer health ─────────────────────────────────────
  const customers = activeCustomers.map((p) => {
    const callsCount = callsByUser.get(p.user_id) ?? 0
    const tierMeta = TIER_METADATA[p.plan_tier as Tier]
    const provisionHealthy = !!(p.twilio_number && p.vapi_assistant_id && p.vapi_phone_number_id)
    const forwardingHealthy = !!p.forwarding_verified_at
    const provisionError = p.vapi_assistant_creation_error || p.vapi_import_failed_at

    let health: 'green' | 'yellow' | 'red' = 'green'
    if (!provisionHealthy || provisionError) health = 'red'
    else if (!forwardingHealthy) health = 'yellow'
    else if (callsCount === 0 && p.first_call_at == null) {
      // Active 7+ days and never received a call — yellow flag
      const ageMs = Date.now() - new Date(p.created_at).getTime()
      if (ageMs > 7 * 24 * 60 * 60 * 1000) health = 'yellow'
    }

    return {
      user_id: p.user_id,
      business_name: p.business_name || '(no name)',
      tier: p.plan_tier,
      tier_label: tierMeta?.name ?? p.plan_tier,
      mrr: tierMeta?.monthly ?? 0,
      calls_this_month: callsCount,
      twilio_number: p.twilio_number,
      first_call_at: p.first_call_at,
      created_at: p.created_at,
      health,
      health_note: !provisionHealthy
        ? 'Provisioning incomplete'
        : provisionError
        ? `Provisioning error: ${String(provisionError).slice(0, 80)}`
        : !forwardingHealthy
        ? 'Forwarding not verified'
        : callsCount === 0
        ? 'No calls yet'
        : null,
    }
  })

  // Sort customers: red first, yellow next, green by MRR desc
  const healthOrder = { red: 0, yellow: 1, green: 2 }
  customers.sort((a, b) => {
    const ho = healthOrder[a.health] - healthOrder[b.health]
    if (ho !== 0) return ho
    return b.mrr - a.mrr
  })

  // ── Tier breakdown ──────────────────────────────────────────
  const tierBreakdown: Record<string, number> = { receptionist: 0, officemgr: 0, concierge: 0 }
  for (const c of customers) {
    if (c.tier && (c.tier in tierBreakdown)) tierBreakdown[c.tier]++
  }

  return NextResponse.json({
    asOf: now.toISOString(),
    business: {
      activeCustomers: activeCustomers.length,
      totalProfiles: all.length,
      mrr,
      arr,
      tierBreakdown,
    },
    activity: {
      callsThisMonth,
      callsToday: callsTodayCount,
      callsLast7Days: callsWeekCount,
      leadsCapturedMonth,
      bookingsMonth: bookingsMonthCount,
      bookingRate:
        leadsCapturedMonth > 0
          ? Math.round((bookingsMonthCount / leadsCapturedMonth) * 100)
          : null,
    },
    economics: {
      cogsCallUsage: Math.round(cogsCallUsage * 100) / 100,
      cogsTwilioRental: Math.round(cogsTwilioRental * 100) / 100,
      cogsTotal: Math.round(cogsTotal * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossMarginPct,
      idiotIndex: cogsTotal > 0 ? Math.round((mrr / cogsTotal) * 10) / 10 : null,
      // New live-spend fields
      costToday: Math.round(costToday * 100) / 100,
      avgCostPerCall: avgCostPerCall != null ? Math.round(avgCostPerCall * 1000) / 1000 : null,
      realCostCoverage: callsThisMonth > 0
        ? Math.round((realCostRows.length / callsThisMonth) * 100)
        : null,
    },
    customers,
  })
}
