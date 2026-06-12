import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { LEADS_PER_WEEK, LEADS_PER_MONTH, PRICE_MONTHLY_USD, INTRO_PRICE_USD, INTRO_PROMO_CODE } from '@/lib/offer'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/admin/instantly-sequence              — inspect mode
 * GET /api/admin/instantly-sequence?apply=1      — write sequence copy
 * GET /api/admin/instantly-sequence?backfill=1   — stamp merge vars onto loaded contacts
 *
 * 2026-06-10 launch-eve tool. The HVAC Q3 campaign template carried the
 * dead offer (80/mo, FIRST200, $297, /start link). This route rewrites
 * all 3 sequence steps to the free-lead-first copy in NEW_STEPS below,
 * and reports whether already-loaded contacts carry the merge variables
 * the new copy depends on (free_lead_url, sample_lead_snippet).
 *
 * Inspect mode returns:
 *   - current sequence steps (subject + body preview per variant)
 *   - payload keys present on 3 sample leads in the campaign
 *   - which REQUIRED_VARS are missing from those leads
 *
 * Write mode PATCHes the campaign, replacing each step's variant subject
 * + body while preserving step count, delays, and any other fields the
 * API returned. Aborts (409) if the campaign does not have exactly 3
 * email steps, so a structural surprise never gets blind-overwritten.
 *
 * Runs on Vercel because INSTANTLY_API_KEY exists only in Vercel env.
 * Browser-friendly on purpose: Peter triggers it logged in via Clerk.
 */

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const API = 'https://api.instantly.ai/api/v2'
const SITE = 'https://www.bellavego.com'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 2026-06-11 — sample_lead_snippet dropped from the copy (it sourced from
// outreach_leads.sample_lead_snippet which is empty for this list, leaving
// a blank gap in step 1). free_lead_url is the only hard dependency now;
// the real lead renders on the /free-lead page itself.
const REQUIRED_VARS = ['free_lead_url'] as const

type NewStep = { subject: string; body: string }

function toHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '<div><br></div>' : `<div>${line}</div>`))
    .join('')
}

// 2026-06-12 — ENFORCEMENT SEQUENCE per Peter. The hook is no longer
// "homeowners who need work" — it's "homeowners the CITY is forcing to do
// the work." Personalized per recipient by {{firstName}} / {{city}} /
// {{trade}} + a REAL flagged homeowner pulled for their exact area on the
// /free-lead page (the deepest personalization there is). Never the word
// "public" — we sell the work removed, not the data. Scarcity + risk
// reversal per Hormozi. Vars used are the ones reliably populated on every
// contact (firstName/companyName/city/trade/free_lead_url); the live stat
// numbers render on the /free-lead landing, not in the body, so no merge
// var can come back blank.
const NEW_STEPS: NewStep[] = [
  {
    subject: 'a {{city}} homeowner the city just cited',
    body: toHtml(
`Hey {{firstName}},

Quick one. My software reads {{city}}'s building-violation and code-enforcement records every night and flags homeowners the city has ordered to get work done. Fix it or face fines.

Caught one near you this week. Real {{city}} property, owner name, the exact violation the city cited, and what they're required to repair. These folks aren't "maybe interested." They legally have to hire someone, and most haven't yet.

Pulled it for you, free. No card, nothing to cancel:

{{free_lead_url}}

I sell these by the month. First one's free so you can judge it yourself.

Peter
BellAveGo - (773) 710-9565`),
  },
  {
    subject: 're: the {{city}} homeowner under a city order',
    body: toHtml(
`{{firstName}}, that flagged homeowner for {{companyName}} is still sitting there:

{{free_lead_url}}

Here's why this is different from HomeAdvisor. We don't sell you "leads." We find the homeowners your city has cited or fined, the ones who HAVE to do the work. We match them to {{trade}}, verify the phone, and hand them to you exclusively. Never shared with 4 other shops. You call; they already have to say yes.

${LEADS_PER_WEEK} of these a week in your area. The math: one closed job covers months of the $${PRICE_MONTHLY_USD}. First month is $${INTRO_PRICE_USD} with code ${INTRO_PROMO_CODE}.

One shop per area. Worst case you spend 30 seconds and keep a free lead.

Peter`),
  },
  {
    subject: 'before another {{trade}} contractor takes {{city}}',
    body: toHtml(
`{{firstName}}, last note from me.

The homeowners the city flagged in {{city}} this month are on a deadline. They WILL hire a {{trade}} shop soon. The only question is whether it's you or the guy who calls them first. Fresh data is the whole edge, and we only give one shop per area access.

Your free one is still here: {{free_lead_url}}

Want the full feed? ${LEADS_PER_WEEK} a week, city-cited homeowners, verified phones, yours alone. First month is $${INTRO_PRICE_USD} with code ${INTRO_PROMO_CODE}. Book one paying job in 30 days or I refund you, give you the next month free, and you keep every lead.

Either way grab the free one. Costs nothing, could be worth a few grand.

Peter
BellAveGo - (773) 710-9565`),
  },
]

type InstantlyStep = {
  type?: string
  delay?: number
  variants?: Array<{ subject?: string; body?: string; [k: string]: unknown }>
  [k: string]: unknown
}

type InstantlyCampaign = {
  id?: string
  name?: string
  sequences?: Array<{ steps?: InstantlyStep[]; [k: string]: unknown }>
  [k: string]: unknown
}

async function instantlyFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}

/**
 * Pull every email currently loaded in the Instantly campaign and ensure
 * each has a row in prospect_free_leads so /free-lead?b={biz_id} resolves.
 *
 * Why this exists: the campaign was loaded weeks ago from a different
 * source list than the CSV seeded into prospect_free_leads. As a result,
 * 369 / 369 Instantly leads have no biz_id and the backfill route can't
 * stamp a free_lead_url. Sending the new free-lead-first copy would
 * deliver "bellavego.com/free-lead?b=" with a blank biz_id to every
 * prospect — landing 404s, hot-lead pipe dies before it starts.
 *
 * Strategy:
 *   1. Page through every Instantly lead in this campaign
 *   2. Look up each email in outreach_leads (the 27K+ source where city,
 *      state, trade, business_name live for the original cold outreach)
 *   3. Generate a deterministic biz_id (8-char base32 of email hash) so
 *      re-running is idempotent
 *   4. Upsert into prospect_free_leads with source_batch='instantly_seed'
 *   5. Report counts so we know how many emails couldn't be matched at
 *      all (means they're not even in outreach_leads either)
 *
 * The /free-lead generate route already creates rows on demand for any
 * biz_id it doesn't know, so even unmatched emails could still work IF
 * we had biz_ids for them. This route's job is making sure every loaded
 * Instantly contact has SOME biz_id pointing at SOME prospect_free_leads
 * row — even a stub row is better than a broken link.
 */
async function seedProspectsFromInstantly(): Promise<{
  scanned: number
  matched_outreach: number
  upserted: number
  no_outreach_row: string[]
  errors: string[]
}> {
  const { createHash } = await import('crypto')

  let scanned = 0
  let matchedOutreach = 0
  let upserted = 0
  const noOutreach: string[] = []
  const errors: string[] = []
  let startingAfter: string | undefined

  for (let page = 0; page < 12; page++) {
    const r = await instantlyFetch('/leads/list', {
      method: 'POST',
      body: JSON.stringify({
        campaign: CAMPAIGN_ID,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    })
    if (!r.ok) { errors.push(`leads/list HTTP ${r.status}`); break }
    const j = await r.json() as {
      items?: Array<{ id: string; email?: string; payload?: Record<string, unknown> }>
      next_starting_after?: string
    }
    const items = j.items || []
    if (items.length === 0) break

    const emails = items.map((it) => (it.email || '').toLowerCase()).filter(Boolean)

    const { data: outreachRows } = await supabase
      .from('outreach_leads')
      .select('email, city, state, trade, business_name, owner_first_name')
      .in('email', emails)

    type OutreachRow = { email: string; city: string | null; state: string | null; trade: string | null; business_name: string | null; owner_first_name: string | null }
    const outreachByEmail = new Map<string, OutreachRow>()
    for (const o of (outreachRows || []) as OutreachRow[]) {
      outreachByEmail.set(o.email.toLowerCase(), o)
    }

    const upserts: Array<{
      biz_id: string
      email: string
      trade: string
      zip: string
      city: string
      state: string
      source_batch: string
    }> = []

    for (const it of items) {
      scanned++
      const email = (it.email || '').toLowerCase()
      if (!email) continue
      const ext = outreachByEmail.get(email)
      if (ext) matchedOutreach++
      else if (noOutreach.length < 25) noOutreach.push(email)

      // Deterministic short biz_id from email — stable across re-runs.
      const hash = createHash('sha256').update(email).digest('hex').slice(0, 10)
      const bizId = `inst_${hash}`

      const trade = (ext?.trade || (it.payload?.trade as string) || 'hvac').toLowerCase()
      const city = ext?.city || (it.payload?.city as string) || ''
      const state = ext?.state || (it.payload?.state as string) || ''

      upserts.push({
        biz_id: bizId,
        email,
        trade: ['hvac','plumbing','electrical','roofing','handyman','other'].includes(trade) ? trade : 'other',
        zip: '',
        city: city.slice(0, 64),
        state: state.slice(0, 32),
        source_batch: 'instantly_seed',
      })
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('prospect_free_leads')
        .upsert(upserts, { onConflict: 'biz_id' })
      if (error) errors.push(`upsert: ${error.message}`)
      else upserted += upserts.length
    }

    startingAfter = j.next_starting_after
    if (!startingAfter) break
  }

  return { scanned, matched_outreach: matchedOutreach, upserted, no_outreach_row: noOutreach, errors }
}

async function sampleLeadVarKeys(): Promise<{ keys: string[]; missing: string[]; checked: number }> {
  const r = await instantlyFetch('/leads/list', {
    method: 'POST',
    body: JSON.stringify({ campaign: CAMPAIGN_ID, limit: 3 }),
  })
  if (!r.ok) return { keys: [`leads/list HTTP ${r.status}`], missing: [...REQUIRED_VARS], checked: 0 }
  const j = await r.json() as { items?: Array<{ payload?: Record<string, unknown> }> }
  const items = j.items || []
  const keys = new Set<string>()
  for (const it of items) {
    for (const k of Object.keys(it.payload || {})) keys.add(k)
  }
  const missing = REQUIRED_VARS.filter((v) => !keys.has(v))
  return { keys: [...keys].sort(), missing, checked: items.length }
}

/**
 * Backfill merge variables onto contacts already loaded in the campaign.
 * Matches each Instantly lead by email to prospect_free_leads (for the
 * biz_id the /free-lead landing requires) + outreach_leads (for the
 * sample_lead_snippet proof line). PATCHes the lead payload preserving
 * existing keys. Contacts with no prospect_free_leads row are reported,
 * not guessed — a wrong biz_id would 404 the landing.
 */
async function backfillLeadVars(): Promise<{
  scanned: number
  patched: number
  already_ok: number
  no_prospect_row: string[]
  errors: string[]
}> {
  let scanned = 0
  let patched = 0
  let alreadyOk = 0
  const noProspect: string[] = []
  const errors: string[] = []
  let startingAfter: string | undefined

  for (let page = 0; page < 10; page++) {
    const r = await instantlyFetch('/leads/list', {
      method: 'POST',
      body: JSON.stringify({
        campaign: CAMPAIGN_ID,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    })
    if (!r.ok) { errors.push(`leads/list HTTP ${r.status}`); break }
    const j = await r.json() as {
      items?: Array<{ id: string; email?: string; payload?: Record<string, unknown> }>
      next_starting_after?: string
    }
    const items = j.items || []
    if (items.length === 0) break

    const emails = items.map((it) => (it.email || '').toLowerCase()).filter(Boolean)

    const [prospects, outreach] = await Promise.all([
      supabase.from('prospect_free_leads').select('biz_id, email, city, state, trade').in('email', emails),
      supabase.from('outreach_leads').select('email, sample_lead_snippet, personalized_opener, city, state, trade, business_name').in('email', emails),
    ])
    type ProspectRow = { biz_id: string; email: string; city: string | null; state: string | null; trade: string | null }
    const prospectByEmail = new Map<string, ProspectRow>()
    for (const p of (prospects.data || []) as ProspectRow[]) {
      prospectByEmail.set(p.email.toLowerCase(), p)
    }
    type OutreachRow = { email: string; sample_lead_snippet: string | null; personalized_opener: string | null; city: string | null; state: string | null; trade: string | null; business_name: string | null }
    const outreachByEmail = new Map<string, OutreachRow>()
    for (const o of (outreach.data || []) as OutreachRow[]) {
      outreachByEmail.set(o.email.toLowerCase(), o)
    }

    // 2026-06-11 — parallelize PATCHes in batches of 10. Sequential
    // one-at-a-time (369 × ~250ms) ran ~2 min and timed out the browser
    // tab. Batched ≈ 37 round-trips ≈ 15s, comfortably inside maxDuration.
    const toPatch: Array<{ id: string; email: string; body: string }> = []
    for (const it of items) {
      scanned++
      const email = (it.email || '').toLowerCase()
      const payload = it.payload || {}
      const prospect = prospectByEmail.get(email)
      if (!prospect?.biz_id) {
        if (noProspect.length < 25) noProspect.push(email)
        continue
      }
      const outreachRow = outreachByEmail.get(email)
      const wantUrl = `${SITE}/free-lead?b=${prospect.biz_id}`
      const wantSnippet = outreachRow?.sample_lead_snippet || (payload.sample_lead_snippet as string) || ''
      const wantCity = prospect.city || outreachRow?.city || (payload.city as string) || 'your area'
      const wantState = prospect.state || outreachRow?.state || (payload.state as string) || ''
      const wantTrade = prospect.trade || outreachRow?.trade || (payload.trade as string) || 'home-service'
      if (
        payload.free_lead_url === wantUrl &&
        payload.city === wantCity &&
        payload.trade === wantTrade &&
        payload.promo_code === 'FIRST400'
      ) { alreadyOk++; continue }

      toPatch.push({
        id: it.id,
        email,
        body: JSON.stringify({
          payload: {
            ...payload,
            free_lead_url: wantUrl,
            sample_lead_snippet: wantSnippet,
            personalized_opener: outreachRow?.personalized_opener || (payload.personalized_opener as string) || '',
            city: wantCity,
            state: wantState,
            trade: wantTrade,
            biz_id: prospect.biz_id,
            promo_code: 'FIRST400',
            promo_url: 'bellavego.com/start?promo=FIRST400',
          },
        }),
      })
    }

    for (let i = 0; i < toPatch.length; i += 10) {
      const batch = toPatch.slice(i, i + 10)
      const results = await Promise.all(batch.map((p) =>
        instantlyFetch(`/leads/${p.id}`, { method: 'PATCH', body: p.body })
          .then((pr) => ({ ok: pr.ok, status: pr.status, email: p.email }))
          .catch((e) => ({ ok: false, status: 0, email: p.email, err: (e as Error).message }))
      ))
      for (const res of results) {
        if (res.ok) patched++
        else if (errors.length < 10) errors.push(`${res.email}: PATCH HTTP ${res.status}`)
      }
    }

    startingAfter = j.next_starting_after
    if (!startingAfter) break
  }

  return { scanned, patched, already_ok: alreadyOk, no_prospect_row: noProspect, errors }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ error: 'INSTANTLY_API_KEY missing' }, { status: 500 })
  }

  const sp = new URL(req.url).searchParams
  const apply = sp.get('apply') === '1'

  if (sp.get('seed') === '1') {
    const result = await seedProspectsFromInstantly()
    return NextResponse.json({ ok: true, mode: 'seed', ...result })
  }

  if (sp.get('backfill') === '1') {
    const result = await backfillLeadVars()
    return NextResponse.json({ ok: true, mode: 'backfill', ...result })
  }

  const campRes = await instantlyFetch(`/campaigns/${CAMPAIGN_ID}`)
  if (!campRes.ok) {
    const txt = await campRes.text().catch(() => '')
    return NextResponse.json({ error: `campaign fetch HTTP ${campRes.status}`, detail: txt.slice(0, 300) }, { status: 502 })
  }
  const campaign = await campRes.json() as InstantlyCampaign

  const steps = campaign.sequences?.[0]?.steps || []
  const currentPreview = steps.map((s, i) => ({
    step: i + 1,
    delay: s.delay ?? null,
    variants: (s.variants || []).map((v) => ({
      subject: v.subject || '',
      body_preview: (v.body || '').replace(/<[^>]+>/g, ' ').slice(0, 160),
    })),
  }))

  const leadVars = await sampleLeadVarKeys()

  if (!apply) {
    return NextResponse.json({
      ok: true,
      mode: 'inspect',
      campaign_id: CAMPAIGN_ID,
      campaign_name: campaign.name || null,
      step_count: steps.length,
      current: currentPreview,
      lead_variable_keys: leadVars.keys,
      leads_checked: leadVars.checked,
      missing_required_vars: leadVars.missing,
      next: 'add ?apply=1 to write the new 3-step copy',
    })
  }

  if (steps.length !== NEW_STEPS.length) {
    return NextResponse.json({
      ok: false,
      error: `expected ${NEW_STEPS.length} steps, campaign has ${steps.length} — not overwriting`,
      current: currentPreview,
    }, { status: 409 })
  }

  const newSequences = (campaign.sequences || []).map((seq, seqIdx) => {
    if (seqIdx !== 0) return seq
    return {
      ...seq,
      steps: (seq.steps || []).map((s, i) => ({
        ...s,
        variants: (s.variants || [{}]).map((v) => ({
          ...v,
          subject: NEW_STEPS[i].subject,
          body: NEW_STEPS[i].body,
        })),
      })),
    }
  })

  const patchRes = await instantlyFetch(`/campaigns/${CAMPAIGN_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ sequences: newSequences }),
  })
  if (!patchRes.ok) {
    const txt = await patchRes.text().catch(() => '')
    return NextResponse.json({ error: `PATCH HTTP ${patchRes.status}`, detail: txt.slice(0, 500) }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    mode: 'applied',
    campaign_id: CAMPAIGN_ID,
    steps_written: NEW_STEPS.length,
    subjects: NEW_STEPS.map((s) => s.subject),
    missing_required_vars: leadVars.missing,
    warning: leadVars.missing.length > 0
      ? `loaded contacts are missing ${leadVars.missing.join(', ')} — links/proof render blank until contacts re-pushed`
      : null,
  })
}
