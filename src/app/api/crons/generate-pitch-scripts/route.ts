import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/generate-pitch-scripts
 *
 * Generates a one-line pitch script for every lead that doesn't yet have
 * one. Customer opens the dashboard → sees the lead → reads the script →
 * dials. No "what do I say" friction.
 *
 * Uses Claude Haiku 4.5 — ~$0.001/lead, fast enough to process 1000+
 * leads per cron run. Runs nightly 2am UTC.
 *
 * Examples of generated scripts:
 *   permit lead: "Hi, I saw you pulled a panel-upgrade permit at 123 Main
 *     last week. Quick question — did you already line up an electrician?"
 *   aging_hvac:  "Hi, calling neighbors with HVAC units past their 15yr
 *     lifespan. Got a min for a quick energy-bill check?"
 *
 * Batches 20 at a time in one Haiku call to keep cost down.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type LeadRow = {
  id: string
  source: string
  street_address: string | null
  zip: string
  source_details: Record<string, unknown> | null
  trade_match: string[] | null
  lead_score: number
}

const SYSTEM = `You are a sales copywriter for home-service contractors (HVAC, plumbing, electrical, roofing, handyman). Your job: write a single 2-sentence cold-call opener per lead.

Rules:
- Sentence 1: reference the SPECIFIC trigger (the permit, the storm, the home age) — must feel handcrafted, not templated
- Sentence 2: ask one question that earns a "yes go on" — never a closed yes/no
- NEVER use "I noticed", "I'm reaching out", "I was wondering" — burned-out cold phrases
- Tone: confident shop foreman, not salesperson
- Max 35 words
- Output ONLY the 2 sentences, no quotes, no preamble

Return a JSON array of strings, one per lead, in the exact order requested.`

async function generateBatch(leads: LeadRow[]): Promise<string[]> {
  const prompt = `Write a pitch script for each of these ${leads.length} leads. Output a JSON array of strings, one per lead, in order.

${leads.map((l, i) => {
  const d = l.source_details || {}
  const trades = (l.trade_match || []).join('/')
  let trigger = ''
  if (l.source === 'permit') {
    trigger = `Permit: ${(d.permit_type as string) || ''} | Work: ${(d.work_description as string) || ''} | Cost: $${d.reported_cost ?? '?'} | Address: ${l.street_address ?? l.zip}`
  } else if (l.source === 'aging_hvac') {
    trigger = `Aging-HVAC ZIP ${l.zip}: median home ${(d.home_age_years as number) ?? '?'}yrs old, ~${(d.annual_replace_estimate as number) ?? '?'} units/yr likely past lifespan`
  } else if (l.source === 'storm') {
    trigger = `Storm ${(d.event as string) || ''}: ${(d.area_desc as string) || ''}, hail ${(d.hail_inches as number) ?? '?'}", wind ${(d.wind_mph as number) ?? '?'}mph`
  } else {
    trigger = `${l.source} lead in ${l.zip}`
  }
  return `${i + 1}. trade=${trades} | ${trigger}`
}).join('\n')}

Return: ["script1", "script2", ...]  — exactly ${leads.length} items.`

  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, '')

  // Lenient JSON extraction — find first [ and matching ] in case Haiku
  // wraps with extra prose despite the system rule.
  const first = text.indexOf('[')
  const last = text.lastIndexOf(']')
  if (first === -1 || last === -1) {
    throw new Error(`no JSON array in: ${text.slice(0, 200)}`)
  }
  const slice = text.slice(first, last + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch (e) {
    throw new Error(`parse failed: ${(e as Error).message}. Slice: ${slice.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) throw new Error('expected array')
  return parsed.slice(0, leads.length).map(String)
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(1000, parseInt(url.searchParams.get('limit') ?? '200', 10))
  const dryRun = url.searchParams.get('dry') === '1'

  // Pull leads with no pitch yet, highest-score first
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, source, street_address, zip, source_details, trade_match, lead_score')
    .is('pitch_script', null)
    .order('lead_score', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, message: 'no leads need pitches' })
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dry: true, would_generate: leads.length })
  }

  const BATCH = 20
  let generated = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH) as LeadRow[]
    try {
      const scripts = await generateBatch(batch)
      // Write per-lead in parallel
      const writes = batch.map((l, idx) => {
        if (!scripts[idx]) return null
        return supabase
          .from('leads')
          .update({ pitch_script: scripts[idx].slice(0, 400) })
          .eq('id', l.id)
      }).filter(Boolean)
      const results = await Promise.allSettled(writes as unknown as Promise<unknown>[])
      generated += results.filter((r) => r.status === 'fulfilled').length
      failed += results.filter((r) => r.status === 'rejected').length
    } catch (e) {
      console.warn(`[pitch-scripts] batch ${i / BATCH} failed: ${(e as Error).message}`)
      if (errors.length < 5) errors.push((e as Error).message.slice(0, 200))
      failed += batch.length
    }
  }

  return NextResponse.json({
    ok: true,
    leads_processed: leads.length,
    generated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
    checked_at: new Date().toISOString(),
  })
}
