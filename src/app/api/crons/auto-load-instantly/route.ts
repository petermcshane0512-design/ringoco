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
  trade: string | null
  review_count: number | null
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

async function pushLead(lead: Lead): Promise<{ ok: boolean; error?: string }> {
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
      // Instantly template references this as {{report_url}}. Every
      // click on this URL fires /api/track/report-visit?l=<lead_id>
      // which sets report_visit_at on outreach_leads — that's the
      // signal Peter sorts by to know who to dial first.
      report_url: reportUrl,
    },
    skip_if_in_workspace: true,
    skip_if_in_campaign: true,
    blocklist_id: null,
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
  // YOUNG-OWNER ICP FILTER (2026-06-05 pivot per real cold-call signal).
  // Old HVAC heads (>40yo, 20+yr shops) don't trust AI. Only send to
  // young_owner_score >= 40. Strongest signal is domain_registered_at
  // post-2018 via RDAP enrichment. Tunable threshold via env.
  const minYoungScore = parseInt(process.env.INSTANTLY_MIN_YOUNG_SCORE ?? '40', 10)
  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, owner_first_name, city, trade, review_count, young_owner_score')
    .eq('status', 'queued')
    .not('email', 'is', null)
    .ilike('trade', '%hvac%')
    .gte('young_owner_score', minYoungScore)
    .order('young_owner_score', { ascending: false })
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

  // Sequential with light pause — Instantly API throttle floor is ~10/sec.
  // 240 leads at 200ms = ~50 sec total, within maxDuration.
  for (const lead of leads as Lead[]) {
    const res = await pushLead(lead)
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
