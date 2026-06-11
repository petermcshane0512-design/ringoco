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

const REQUIRED_VARS = ['free_lead_url', 'sample_lead_snippet'] as const

type NewStep = { subject: string; body: string }

function toHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '<div><br></div>' : `<div>${line}</div>`))
    .join('')
}

const NEW_STEPS: NewStep[] = [
  {
    subject: 'homeowner in {{city}} for {{companyName}}',
    body: toHtml(
`{{firstName}} — my software watches building permits, storm reports, and home sales around {{city}} and flags homeowners about to need a {{trade}} contractor.

Here's one it caught this week:

{{sample_lead_snippet}}

Full details — name, address, year built, estimated job value — are yours free. No card, nothing to cancel:

{{free_lead_url}}

I make money selling these by the month. The first one's free so you can judge the data yourself.

Peter
BellAveGo — (773) 710-9565`),
  },
  {
    subject: 're: homeowner in {{city}}',
    body: toHtml(
`{{firstName}} — that homeowner I flagged for {{companyName}} is still unclaimed:

{{free_lead_url}}

Why I give the first one away: shops that like it usually want the feed — ${LEADS_PER_WEEK} leads a week in your area, verified phone on every one, and my system sends the intro text + email AS you, so you only talk to homeowners who reply. Your leads are yours alone — never shared with 4 other shops like HomeAdvisor.

The math: average {{trade}} ticket runs $2,000+. Close 2 of your ${LEADS_PER_MONTH} monthly leads and the $${PRICE_MONTHLY_USD} pays for itself eight times. First month is $${INTRO_PRICE_USD} with code ${INTRO_PROMO_CODE}.

Worst case you spend 30 seconds and keep a free lead.

Peter`),
  },
  {
    subject: 'before I move on from {{city}}',
    body: toHtml(
`{{firstName}} — last note from me.

The homeowners my system flagged in {{city}} this month don't sit around. Door knockers, HomeAdvisor shops, and the franchise guys with marketing budgets find them eventually. Fresh data is the whole edge.

Your free one is still here: {{free_lead_url}}

If you want the full feed — ${LEADS_PER_WEEK} a week, verified phones, outreach sent as you — first month is $${INTRO_PRICE_USD} with code ${INTRO_PROMO_CODE}. Book one paying job in 30 days or I refund you, give you the next month free, and you keep every lead.

Either way grab the free one. Cost you nothing, might be worth a few grand.

Peter
BellAveGo — (773) 710-9565`),
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
      supabase.from('prospect_free_leads').select('biz_id, email').in('email', emails),
      supabase.from('outreach_leads').select('email, sample_lead_snippet, personalized_opener').in('email', emails),
    ])
    const bizByEmail = new Map<string, string>()
    for (const p of (prospects.data || []) as Array<{ biz_id: string; email: string }>) {
      bizByEmail.set(p.email.toLowerCase(), p.biz_id)
    }
    const snippetByEmail = new Map<string, { snippet: string; opener: string }>()
    for (const o of (outreach.data || []) as Array<{ email: string; sample_lead_snippet: string | null; personalized_opener: string | null }>) {
      snippetByEmail.set(o.email.toLowerCase(), {
        snippet: o.sample_lead_snippet || '',
        opener: o.personalized_opener || '',
      })
    }

    for (const it of items) {
      scanned++
      const email = (it.email || '').toLowerCase()
      const payload = it.payload || {}
      const bizId = bizByEmail.get(email)
      if (!bizId) {
        if (noProspect.length < 25) noProspect.push(email)
        continue
      }
      const wantUrl = `${SITE}/free-lead?b=${bizId}`
      const extra = snippetByEmail.get(email)
      const wantSnippet = extra?.snippet || (payload.sample_lead_snippet as string) || ''
      if (
        payload.free_lead_url === wantUrl &&
        payload.sample_lead_snippet === wantSnippet &&
        payload.promo_code === 'FIRST400'
      ) { alreadyOk++; continue }

      const pr = await instantlyFetch(`/leads/${it.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          payload: {
            ...payload,
            free_lead_url: wantUrl,
            sample_lead_snippet: wantSnippet,
            personalized_opener: extra?.opener || (payload.personalized_opener as string) || '',
            promo_code: 'FIRST400',
            promo_url: 'bellavego.com/start?promo=FIRST400',
          },
        }),
      })
      if (pr.ok) patched++
      else if (errors.length < 10) errors.push(`${email}: PATCH HTTP ${pr.status}`)
      await new Promise((res) => setTimeout(res, 120))
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
