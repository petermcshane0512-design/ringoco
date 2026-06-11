import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/auto-load-instantly
 *
 * Twice-daily lead pipeline: pulls ICP-qualified leads from outreach_leads
 * (HVAC, has email, status='queued', NOT placeholder, ≤30 reviews if known)
 * and pushes them into the live Instantly campaign as new contacts.
 *
 * Respects daily send capacity (480/day at full warmup) so the queue never
 * gets buried under more leads than the mailboxes can ship in a week.
 *
 * Idempotent — flips status='in_instantly_queue' on success so re-runs
 * don't double-add the same lead.
 *
 * Algorithm step 5 (Automate) applied: this is the final automation tier.
 * Manual CSV uploads were OK for first 100 leads. After that this script
 * is what fills the campaign while Peter sleeps.
 */

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Lead = {
  id: string
  email: string | null
  business_name: string | null
  owner_first_name: string | null
  city: string | null
  state: string | null
  trade: string | null
  review_count?: number | null
  personalized_opener?: string | null
  sample_lead_snippet?: string | null
}

type NeighborhoodLead = {
  street_address: string | null
  zip: string
  source: string
  source_details: Record<string, unknown> | null
  trade_match: string[] | null
}

/**
 * Fetch 5 real homeowner leads from the `leads` pool matching the
 * prospect's state (best we can do without prospect ZIP). Returns a
 * pre-formatted string ready to drop into Instantly template via
 * {{leads_preview}} variable.
 *
 * Per Hormozi $100M Offers: "free gift before the ask." Giving the
 * prospect 5 ACTUAL leads in their state inside the email itself
 * lifts click + trial conversion 2-3x vs report-link-only.
 *
 * Cost: $0 — leads from existing 27K+ pool, prospects don't "consume"
 * them (they're public homeowner-opportunity records).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLeadsPreview(sb: any, state: string | null, trade: string | null): Promise<string> {
  if (!state) return ''
  // ZIP centroids share state, find ZIPs in this state then leads in those ZIPs
  const { data: zips } = await sb
    .from('zip_centroids')
    .select('zip')
    .eq('state', state)
    .limit(500)
  if (!zips || zips.length === 0) return ''
  const zipList = (zips as Array<{ zip: string }>).map((z) => z.zip)
  const tradeFilter = (trade || 'hvac').toLowerCase().includes('plumb') ? 'plumbing'
    : (trade || 'hvac').toLowerCase().includes('elect') ? 'electrical'
    : (trade || 'hvac').toLowerCase().includes('roof') ? 'roofing'
    : 'hvac'
  // Exclude aging_hvac: synthetic zip-aggregate placeholders, not per-property
  // events. Customer-facing surfaces (including cold-email body) never show
  // invented data (Peter rule 2026-06-10).
  const { data: leadsInState } = await sb
    .from('leads')
    .select('street_address, zip, source, source_details, trade_match')
    .in('zip', zipList.slice(0, 200))
    .contains('trade_match', [tradeFilter])
    .neq('source', 'aging_hvac')
    .order('lead_score', { ascending: false })
    .limit(5)
  if (!leadsInState || leadsInState.length === 0) return ''
  return (leadsInState as NeighborhoodLead[]).map((l, i) => {
    const d = l.source_details || {}
    let descriptor = ''
    if (l.source === 'permit') {
      const work = (d.work_description as string) || (d.permit_type as string) || 'permit filed'
      descriptor = `${work.slice(0, 60)}`
    } else {
      descriptor = 'homeowner opportunity'
    }
    return `${i + 1}. ZIP ${l.zip} · ${descriptor}`
  }).join('\n')
}

// Build the personalized report URL with lead_id attribution. Critical:
// `?l=<lead_id>` is what /api/track/report-visit reads to flip
// report_visit_at on outreach_leads — without it, Instantly clicks land
// on the report page but Peter can never see WHO clicked. That defeats
// the entire "call people who opened the report" play.
function buildReportUrl(lead: Lead): string {
  const params = new URLSearchParams({
    for: lead.business_name || '',
    type: lead.trade || 'HVAC',
    l: lead.id,
  })
  if (lead.city) params.set('city', lead.city)
  return `https://www.bellavego.com/sample-report?${params.toString()}`
}

async function pushLead(lead: Lead, leadsPreview: string): Promise<{ ok: boolean; error?: string }> {
  const reportUrl = buildReportUrl(lead)
  const body = {
    campaign: CAMPAIGN_ID,
    email: lead.email,
    first_name: lead.owner_first_name || 'there',
    last_name: '',
    company_name: lead.business_name || '',
    personalization: '',
    payload: {
      city: lead.city || '',
      trade: lead.trade || 'HVAC',
      review_count: lead.review_count?.toString() || '',
      report_url: reportUrl,
      leads_preview: leadsPreview,
      // 2026-06-09 — both fields powered by separate nightly crons:
      //   personalize-queued-leads → personalized_opener (Sonnet 1-line hook)
      //   personalize-sample-leads → sample_lead_snippet (1 real Batch Data
      //                              owner-occupied lead in recipient's city)
      // Template merges both. Falls back to empty if either not yet written.
      personalized_opener: lead.personalized_opener || '',
      sample_lead_snippet: lead.sample_lead_snippet || '',
      // 2026-06-10 — email-only + hot-call pivot. The free-lead landing is
      // the conversion surface AND the hot-lead trigger (2 visits → SMS to
      // Peter). Template should link {{free_lead_url}}, not report_url.
      free_lead_url: `https://www.bellavego.com/free-lead?b=${lead.id}`,
      // Bold CTA line + promo code (Hormozi $100M Money Models — sub-$100
      // trip-wire entry point). Pre-rendered per lead so the template
      // stays consistent across variants.
      // 2026-06-10 — FIRST200 superseded by FIRST400 ($497 → $97 month 1).
      promo_code: 'FIRST400',
      promo_url: 'bellavego.com/start?promo=FIRST400',
    },
    skip_if_in_workspace: true,
    skip_if_in_campaign: true,
    verify_leads_for_lead_finder: false,
    verify_leads_on_import: false,
  }
  const r = await fetch('https://api.instantly.ai/api/v2/leads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (r.status === 200 || r.status === 201) return { ok: true }
  const txt = await r.text().catch(() => '')
  return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 200)}` }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ error: 'INSTANTLY_API_KEY missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  // Default: load up to 240 per run (480/day = 2 runs/day of 240).
  // Override with ?limit=N for manual loads.
  const limit = parseInt(url.searchParams.get('limit') ?? '240', 10)
  const dryRun = url.searchParams.get('dry') === '1'

  // Pull ICP-qualified leads ready for Instantly. Filter:
  //   - status='queued' (not yet sent OR loaded into Instantly)
  //   - email present
  //   - trade='hvac' (current campaign is HVAC-only)
  // ICP small-dog filtering (≤30 reviews) is done upstream in the scrapers
  // (refilter-hiring-small-dogs.mjs et al.) — they only insert rows that pass.
  // Re-filtering here on review_count would require it to be reliably populated
  // across every scraper, which it isn't yet (varies by source). Keep this
  // route trustful of the upstream filter.
  // YOUNG-OWNER TIERED FALLBACK (2026-06-05).
  // Send volume MUST hit 580/day June 15 → Dec 25 regardless of pool age.
  // Strategy: fill from HOT first, then WARM, then COLD if still short.
  // Always order by young_owner_score DESC so the freshest young leads
  // go out first every day. Algorithm learns from conversion data which
  // buckets actually convert — adjust scoring weights iteratively.
  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, owner_first_name, city, state, trade, young_owner_score, personalized_opener, sample_lead_snippet')
    .eq('status', 'queued')
    .not('email', 'is', null)
    // 2026-06-09 — opened up to all home-service trades, not just HVAC,
    // per trade-expansion plan + FL batch loaded today
    .not('trade', 'is', null)
    .order('young_owner_score', { ascending: false, nullsFirst: false })
    .order('pushed_at', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, loaded: 0, message: 'queue empty' })
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry: true,
      would_push: leads.length,
      sample: leads.slice(0, 5),
    })
  }

  let ok = 0
  let failed = 0
  const errors: { email: string | null; error: string }[] = []

  // Cache leads_preview per state to avoid re-querying lead pool for
  // every Instantly recipient. ~80% of one nightly batch hits 1-5 states.
  const previewCache = new Map<string, string>()
  async function getPreview(state: string | null, trade: string | null): Promise<string> {
    const cacheKey = `${state || ''}|${trade || 'hvac'}`
    if (previewCache.has(cacheKey)) return previewCache.get(cacheKey)!
    const preview = await fetchLeadsPreview(supabase, state, trade)
    previewCache.set(cacheKey, preview)
    return preview
  }

  // Sequential with light pause — Instantly API throttle floor is ~10/sec.
  // 240 leads at 200ms = ~50 sec total, within maxDuration.
  for (const lead of leads as Lead[]) {
    const leadsPreview = await getPreview(lead.state, lead.trade)
    const res = await pushLead(lead, leadsPreview)
    if (res.ok) {
      ok++
      await supabase
        .from('outreach_leads')
        .update({
          status: 'in_instantly_queue',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
    } else {
      failed++
      if (errors.length < 10) errors.push({ email: lead.email, error: res.error || '?' })
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  return NextResponse.json({
    ok: true,
    pulled: leads.length,
    loaded: ok,
    failed,
    campaign_id: CAMPAIGN_ID,
    errors: errors.length > 0 ? errors : undefined,
  })
}
