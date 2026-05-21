import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { searchApolloLeads, enrichWithPlaces } from '@/lib/leadEnrichment'
import { personalizeBatch } from '@/lib/personalizeEmail'
import { pushLeadsToInstantly } from '@/lib/instantly'
import type { Trade, InstantlyLeadPayload } from '@/lib/leadTypes'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type EnrichRequest = {
  cities: { city: string; state: string }[]
  trades: Trade[]
  perCityLimit?: number
  campaignId?: string
  pushToInstantly?: boolean
  dryRun?: boolean
}

/**
 * Cold-email lead pipeline orchestrator.
 *
 * POST /api/agents/enrich-leads
 *
 * Pipeline (per city × trade combo):
 *   1. Apollo search   → ApolloLead[]
 *   2. Google Places   → EnrichedLead[] (with competitors + reviews)
 *   3. Claude personalize → PersonalizedFragments per lead
 *   4. Dedup vs outreach_leads table
 *   5. Push to Instantly campaign
 *   6. Insert into outreach_leads + log to agent_runs
 *
 * Auth: requireAdmin — accepts `x-admin-secret: $ADMIN_API_SECRET` (cron/scripts)
 * or a Clerk session with an admin email (interactive use from /admin UI).
 * Fail-closed: previously the secret check only ran if ADMIN_API_SECRET was set,
 * which made this route fully public in any environment that forgot the env var.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: EnrichRequest
  try {
    body = (await req.json()) as EnrichRequest
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.cities?.length || !body.trades?.length) {
    return NextResponse.json({ error: 'cities and trades required' }, { status: 400 })
  }

  const perCityLimit = body.perCityLimit ?? 25
  const campaignId = body.campaignId ?? process.env.INSTANTLY_DEFAULT_CAMPAIGN_ID ?? 'CAMPAIGN_FEAR_LOSS'
  const pushToInstantly = body.pushToInstantly ?? true
  const dryRun = body.dryRun ?? false

  const stats = {
    leads_searched: 0,
    leads_enriched: 0,
    leads_personalized: 0,
    leads_deduped: 0,
    leads_pushed: 0,
    errors: 0,
  }

  // ── 1. Search + 2. Enrich (per city × trade) ─────────────────
  const enrichedLeads = []
  for (const place of body.cities) {
    for (const trade of body.trades) {
      try {
        const apolloLeads = await searchApolloLeads({ ...place, trade, limit: perCityLimit })
        stats.leads_searched += apolloLeads.length
        for (const lead of apolloLeads) {
          const enriched = await enrichWithPlaces(lead)
          enrichedLeads.push(enriched)
          stats.leads_enriched++
        }
      } catch (e) {
        console.error(`enrich failed for ${place.city}/${trade}:`, e)
        stats.errors++
      }
    }
  }

  // ── 3. Dedup vs outreach_leads ───────────────────────────────
  const emails = enrichedLeads.map((l) => l.ownerEmail)
  const { data: existing } = await supabase
    .from('outreach_leads')
    .select('email')
    .in('email', emails)
  const existingSet = new Set((existing ?? []).map((r) => r.email))
  const fresh = enrichedLeads.filter((l) => !existingSet.has(l.ownerEmail))
  stats.leads_deduped = enrichedLeads.length - fresh.length

  // ── 4. Personalize via Claude (parallel batches of 5) ─────────
  const personalized = await personalizeBatch(fresh, 5)
  stats.leads_personalized = personalized.length

  // ── 5. Build Instantly payloads ──────────────────────────────
  const payloads: InstantlyLeadPayload[] = personalized.map(({ lead, fragments }) => ({
    email: lead.ownerEmail,
    first_name: lead.ownerFirstName,
    last_name: lead.ownerLastName,
    company_name: lead.businessName,
    custom_variables: {
      business_name: lead.businessName,
      city: lead.city,
      state: lead.state,
      trade: lead.trade,
      review_count: String(lead.reviewCount ?? ''),
      estimated_missed_calls: String(lead.estimatedMissedCallsPerMonth),
      estimated_missed_revenue: String(lead.estimatedMonthlyMissedRevenue),
      top_competitor_name: lead.topCompetitors[0]?.name ?? '',
      ai_opening: fragments.opening,
      ai_competitor_ref: fragments.competitorRef ?? '',
      ai_roi_math: fragments.roiMath,
      ai_review_hook: fragments.reviewHook ?? '',
      ai_closing_hook: fragments.closingHook,
    },
  }))

  if (dryRun) {
    return NextResponse.json({ stats, sample: payloads.slice(0, 3) })
  }

  // ── 6. Push to Instantly ────────────────────────────────────
  if (pushToInstantly && payloads.length > 0) {
    const result = await pushLeadsToInstantly({ campaignId, leads: payloads })
    stats.leads_pushed = result.pushed
    stats.errors += result.errors
  }

  // ── 7. Persist to outreach_leads + agent_runs ───────────────
  if (personalized.length > 0) {
    await supabase.from('outreach_leads').insert(
      personalized.map(({ lead }) => ({
        email: lead.ownerEmail,
        business_name: lead.businessName,
        owner_first_name: lead.ownerFirstName,
        city: lead.city,
        state: lead.state,
        trade: lead.trade,
        campaign_id: campaignId,
        status: 'sent',
      })),
    )
  }

  await supabase.from('agent_runs').insert({
    agent: 'enrich-leads',
    leads_searched: stats.leads_searched,
    leads_enriched: stats.leads_enriched,
    leads_pushed: stats.leads_pushed,
    campaigns: [campaignId],
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, stats })
}
