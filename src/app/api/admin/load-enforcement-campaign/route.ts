import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/admin/load-enforcement-campaign
 *   ?dry=1     — inspect: count what would load, no writes
 *   ?limit=N   — cap (default 500)
 *   ?trades=roofing,masonry  — which sourced trades to load
 *
 * 2026-06-12 — the enforcement send loader. The existing auto-load cron is
 * HVAC-only + status='queued'; this is the parallel path for the Chicago
 * roofing/masonry enforcement campaign. For each sourced outreach_lead:
 *   1. seeds a prospect_free_leads row (biz_id = outreach_leads.id) so the
 *      /free-lead landing resolves and can pull a real lead by city+state
 *   2. pushes the contact to the Instantly campaign with free_lead_url +
 *      firstName/companyName/city/trade already stamped (no separate
 *      backfill step — the sequence renders immediately)
 *   3. flips status -> 'loaded_enforcement' so re-runs don't double-add
 *
 * first_name is parsed from the business name ("Mike's Roofing" -> "Mike")
 * with a "there" fallback so the {{firstName}} merge never renders blank.
 */

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const SITE = 'https://www.bellavego.com'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type SourcedLead = {
  id: string
  email: string | null
  business_name: string | null
  city: string | null
  state: string | null
  trade: string | null
}

function firstNameFrom(business: string | null): string {
  const b = (business || '').trim()
  if (!b) return 'there'
  // ONLY trust a possessive ("Mike's Roofing" -> "Mike"). The first-token
  // heuristic was too loose — it produced "Hey Tuckpointing,", "Hey
  // Riteway,", "Hey Alsip," which read like spam and tank conversion. A
  // generic "Hey there," is far safer than a wrong name. (2026-06-12)
  const poss = b.match(/^([A-Z][a-z]{2,})['’]s\b/)
  if (poss) {
    const name = poss[1]
    const tradeWord = /^(tuckpoint|mason|roof|brick|chimney|gutter|restore|restoration|builder|contractor)/i
    if (!tradeWord.test(name)) return name
  }
  return 'there'
}

async function pushToInstantly(lead: SourcedLead, freeLeadUrl: string, firstName: string): Promise<{ ok: boolean; error?: string }> {
  // 2026-06-12 — Instantly v2 reads custom merge vars from `custom_variables`,
  // NOT `payload` (the long-standing bug: free_lead_url never rendered). Send
  // custom_variables; keep payload too as harmless belt-and-suspenders.
  const vars = {
    city: lead.city || 'your area',
    trade: (lead.trade || 'home-service').toLowerCase(),
    free_lead_url: freeLeadUrl,
    promo_code: 'FIRST400',
    promo_url: 'bellavego.com/start',
  }
  const body = {
    campaign: CAMPAIGN_ID,
    email: lead.email,
    first_name: firstName,
    last_name: '',
    company_name: lead.business_name || '',
    custom_variables: vars,
    payload: vars,
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
  return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 160)}` }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ error: 'INSTANTLY_API_KEY missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const limit = Math.min(1000, parseInt(url.searchParams.get('limit') ?? '500', 10))
  const trades = (url.searchParams.get('trades') ?? 'roofing,masonry')
    .split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)

  const { data: sourced, error } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, city, state, trade')
    .eq('status', 'sourced')
    .in('trade', trades)
    .not('email', 'is', null)
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const leads = (sourced || []) as SourcedLead[]

  if (dry) {
    return NextResponse.json({
      ok: true, mode: 'dry', would_load: leads.length, trades,
      sample: leads.slice(0, 5).map((l) => ({
        email: l.email, company: l.business_name, city: l.city, trade: l.trade,
        first_name: firstNameFrom(l.business_name),
        free_lead_url: `${SITE}/free-lead?b=${l.id}`,
      })),
    })
  }

  let seeded = 0, pushed = 0, marked = 0
  const errors: string[] = []

  for (const l of leads) {
    if (!l.email) continue
    const bizId = l.id
    const freeLeadUrl = `${SITE}/free-lead?b=${bizId}`
    const firstName = firstNameFrom(l.business_name)

    // 1. seed prospect_free_leads so /free-lead resolves + can pull by city+state
    const { error: pErr } = await supabase.from('prospect_free_leads').upsert({
      biz_id: bizId,
      email: l.email.toLowerCase(),
      trade: (l.trade || 'roofing').toLowerCase(),
      city: (l.city || '').slice(0, 64),
      state: (l.state || '').slice(0, 32),
      zip: '',
      source_batch: 'enforcement_campaign',
    }, { onConflict: 'biz_id' })
    if (pErr) { if (errors.length < 8) errors.push(`seed ${l.email}: ${pErr.message}`); continue }
    seeded++

    // 2. push to Instantly with free_lead_url pre-stamped
    const res = await pushToInstantly(l, freeLeadUrl, firstName)
    if (res.ok) {
      pushed++
      // 3. mark loaded so re-runs skip it
      const { error: mErr } = await supabase.from('outreach_leads').update({ status: 'loaded_enforcement' }).eq('id', l.id)
      if (!mErr) marked++
    } else if (errors.length < 8) {
      errors.push(`push ${l.email}: ${res.error}`)
    }
  }

  return NextResponse.json({
    ok: true, mode: 'loaded', trades,
    eligible: leads.length, prospect_rows_seeded: seeded,
    pushed_to_instantly: pushed, marked_loaded: marked,
    errors,
    next: 'add ?backfill=1 is NOT needed — free_lead_url stamped at push. Verify one /free-lead link, then activate the campaign.',
  })
}
