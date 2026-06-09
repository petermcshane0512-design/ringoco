import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/leads-summary
 *
 * 2026-06-09 LEADS-ONLY PIVOT.
 *
 * Feeds the new /dashboard root page:
 *   - this_week_count: leads delivered Mon-Sun current week
 *   - this_week_value_cents: sum estimated_cost from source_details
 *   - outreach_sent / outreach_replied: from outreach_lead_status table (TBD)
 *   - hot_replies: leads marked replied in last 24 hrs
 *   - recent_leads: 10 most recent leads for this tenant
 *
 * Tenant scoping: reads contractor's service_zips + service_radius from
 * profile, joins leads via zips_within_miles, returns matching pool.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ProfileRow = {
  service_zips: string[] | null
  service_radius_mi: number | null
  business_type: string | null
}

type LeadRow = {
  id: string
  street_address: string | null
  zip: string | null
  trade_match: string[] | null
  source: string | null
  source_details: Record<string, unknown> | null
  source_event_date: string | null
  lead_score: number | null
  created_at: string | null
}

function startOfWeekUtc(): Date {
  const d = new Date()
  const day = d.getUTCDay() // 0 sunday … 6 sat
  const diff = (day + 6) % 7 // days back to Monday
  d.setUTCDate(d.getUTCDate() - diff)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function startOfMonthUtc(): Date {
  const d = new Date()
  d.setUTCDate(1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pRaw } = await supabase
    .from('profiles')
    .select('service_zips, service_radius_mi, business_type')
    .eq('user_id', userId)
    .maybeSingle()
  const profile = (pRaw as ProfileRow | null) || { service_zips: null, service_radius_mi: 25, business_type: null }
  const homeZips = (profile.service_zips || []).filter(Boolean)
  if (homeZips.length === 0) {
    return NextResponse.json({
      ok: true,
      this_week_count: 0,
      this_week_value_cents: 0,
      outreach_sent: 0,
      outreach_replied: 0,
      hot_replies: [],
      recent_leads: [],
      message: 'no service_zips on profile — finish onboarding',
    })
  }

  // Expand service zips by radius
  const radius = profile.service_radius_mi ?? 25
  const eligibleZips = new Set<string>(homeZips)
  for (const hz of homeZips) {
    const { data: nearby } = await supabase.rpc('zips_within_miles', { primary_zip: hz, radius_mi: radius })
    if (Array.isArray(nearby)) for (const z of nearby) if (z?.zip) eligibleZips.add(z.zip)
  }
  const zipsArr = [...eligibleZips]

  const trade = (profile.business_type || 'hvac').toLowerCase()
  const tradeFilter = trade.includes('plumb') ? 'plumbing'
    : trade.includes('elect') ? 'electrical'
    : trade.includes('roof') ? 'roofing'
    : trade.includes('handy') ? 'handyman'
    : 'hvac'

  const weekStart = startOfWeekUtc().toISOString()
  const monthStart = startOfMonthUtc().toISOString()

  // This week's leads
  const { data: weekLeads } = await supabase
    .from('leads')
    .select('id, street_address, zip, trade_match, source, source_details, source_event_date, lead_score, created_at')
    .contains('trade_match', [tradeFilter])
    .in('zip', zipsArr.slice(0, 200))
    .gte('created_at', weekStart)
    .order('created_at', { ascending: false })
    .limit(50)
  const weekRows = (weekLeads || []) as LeadRow[]

  // This month's leads
  const { data: monthLeads } = await supabase
    .from('leads')
    .select('id, street_address, zip, trade_match, source, source_details, source_event_date, lead_score, created_at')
    .contains('trade_match', [tradeFilter])
    .in('zip', zipsArr.slice(0, 200))
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })
    .limit(100)
  const monthRows = (monthLeads || []) as LeadRow[]

  // All-time leads
  const { data: allLeads } = await supabase
    .from('leads')
    .select('id, street_address, zip, trade_match, source, source_details, source_event_date, lead_score, created_at')
    .contains('trade_match', [tradeFilter])
    .in('zip', zipsArr.slice(0, 200))
    .order('created_at', { ascending: false })
    .limit(300)
  const allRows = (allLeads || []) as LeadRow[]

  let valueCents = 0
  for (const l of weekRows) {
    const cost = Number((l.source_details || {}).estimated_cost) || 0
    valueCents += cost * 100
  }

  const slim = (rows: LeadRow[]) => rows.map((l) => ({
    id: l.id, street_address: l.street_address, zip: l.zip,
    trade_match: l.trade_match, source: l.source,
    source_event_date: l.source_event_date,
    lead_score: l.lead_score,
  }))

  return NextResponse.json({
    ok: true,
    this_week_count: weekRows.length,
    this_month_count: monthRows.length,
    all_count: allRows.length,
    this_week_value_cents: Math.round(valueCents),
    outreach_sent: 0,
    outreach_replied: 0,
    hot_replies: [],
    this_week_leads: slim(weekRows),
    this_month_leads: slim(monthRows),
    all_leads: slim(allRows),
    recent_leads: slim(allRows.slice(0, 20)),
  })
}
