import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/personalize-queued-leads
 *
 * Nightly 2am CT (after refill-outreach-queue runs at 1am).
 *
 * For every outreach_leads row with status='queued' AND
 * personalized_opener IS NULL AND email IS NOT NULL: Sonnet 4.6 writes
 * a 1-2 line personalized opener that makes the cold email feel like
 * we looked into their business. Persisted to outreach_leads.personalized_opener.
 *
 * Used by auto-load-instantly cron when it pushes to Instantly — gets
 * passed as {{personalized_opener}} merge variable. Email template
 * Step 0 uses it as the second line after "Hey {{firstName}},".
 *
 * Cost: ~$0.005/lead × 200 leads/night = $1/night = ~$30/mo Anthropic.
 *
 * Hormozi $100M Leads play: hyper-personalization at scale. Makes a
 * cold email feel 1-to-1 → 2-3x reply rate vs generic.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM = `Write a 1-2 sentence personalized opener for a cold email going to a solo or 1-3 person home-service crew (HVAC, plumbing, electrical, roofing, handyman).

GOAL: Make the prospect feel we looked at their actual business — not blasted them. The line goes RIGHT AFTER "Hey {firstName}," in the email body.

RULES:
- 1-2 sentences max. ≤ 28 words total.
- Reference ONE specific thing about them: their city, business name, what their website says they do, years operating, review count vibe.
- Plain language. No marketing-speak. No "I noticed" or "I saw" if it sounds robotic.
- DO NOT mention numbers we can't actually see (don't guess at revenue, customers, employees).
- DO NOT use review-count or competitor-comparison framing (deprecated).
- The line must SET UP the offer that follows (5 weekly leads + AI receptionist) — so the connection feels natural.
- Sound like a guy who looked at their site for 30 sec, not a salesperson.

EXAMPLES (good):
- "Saw {companyName} runs same-day AC service in Plano — that's exactly where missed after-hours calls bite hardest."
- "{companyName} has been at it in {city} a while — by year 3-4, most small crews are leaking calls on the workdays they're slammed."
- "Plumbing in {city} this summer's a meat-grinder — solo guys are leaving 8-12 jobs/mo on the table from missed calls alone."
- "Your site says you're a one-truck operation — that's exactly who BellAveGo's built for."

EXAMPLES (bad, do not write):
- "I noticed your business has great reviews!" (generic, robotic)
- "Are you struggling with missed calls?" (question hook, weak)
- "Hope this finds you well." (filler)

OUTPUT: JUST the 1-2 sentence opener as raw text. No quotes, no preamble, no explanation. Just the line.`

type Lead = {
  id: string
  email: string
  business_name: string | null
  city: string | null
  state: string | null
  trade: string | null
  website_snippet: string | null
  owner_first_name: string | null
  domain_registered_at: string | null
}

async function generateOpener(lead: Lead): Promise<string | null> {
  const ctx: string[] = []
  if (lead.business_name) ctx.push(`Business name: ${lead.business_name}`)
  if (lead.city) ctx.push(`City: ${lead.city}${lead.state ? ', ' + lead.state : ''}`)
  if (lead.trade) ctx.push(`Trade: ${lead.trade}`)
  if (lead.website_snippet) ctx.push(`Website snippet (truncated): ${lead.website_snippet.slice(0, 400)}`)
  if (lead.domain_registered_at) {
    const yrs = Math.floor((Date.now() - new Date(lead.domain_registered_at).getTime()) / (365 * 86_400_000))
    if (yrs >= 0 && yrs <= 30) ctx.push(`Domain age: ~${yrs} years`)
  }
  if (ctx.length === 0) return null

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: 'user', content: ctx.join('\n') }],
    })
    const text = msg.content.find((c) => c.type === 'text')?.text || ''
    return text.trim().replace(/^["']|["']$/g, '').slice(0, 320)
  } catch (e) {
    console.warn(`[personalize] sonnet failed for ${lead.email}:`, (e as Error).message)
    return null
  }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '200', 10))

  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, city, state, trade, website_snippet, owner_first_name, domain_registered_at')
    .eq('status', 'queued')
    .not('email', 'is', null)
    .is('personalized_opener', null)
    .limit(limit)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, skipped: 0, message: 'no leads need personalization' })
  }

  let generated = 0
  let skipped = 0
  let failed = 0
  // Process in small parallel batches to keep Anthropic spend bounded + finish under maxDuration
  const BATCH = 6
  for (let i = 0; i < leads.length; i += BATCH) {
    const slice = leads.slice(i, i + BATCH) as Lead[]
    const results = await Promise.all(slice.map(async (l) => ({ l, opener: await generateOpener(l) })))
    for (const r of results) {
      if (!r.opener) { failed++; continue }
      const { error: upErr } = await supabase
        .from('outreach_leads')
        .update({ personalized_opener: r.opener, personalized_opener_generated_at: new Date().toISOString() })
        .eq('id', r.l.id)
      if (upErr) { skipped++; continue }
      generated++
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    skipped,
    failed,
    queue_seen: leads.length,
    checked_at: new Date().toISOString(),
  })
}
