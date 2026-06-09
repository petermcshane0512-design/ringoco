import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/variant-generator
 *
 * Daily 6am CT. Sonnet 4.6 writes 2 new candidate Step 0 variants based
 * on what's currently winning + losing. Drafts go to `outreach_variants`
 * with status='draft' — Peter approves before they go live.
 *
 * First 14 days = drafts only, no auto-promotion to live.
 * After Day 14 (data confidence threshold), variants get auto-promoted
 * by the scorer if they statistically beat the current live variant.
 *
 * Cost: ~$0.02 per generation × 1/day = ~$7/mo Anthropic.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

const SYSTEM = `You write cold email copy for BellAveGo, a pure homeowner LEAD-GEN platform for solo + 1-3 person home-service crews (HVAC, plumbing, electrical, roofing, handyman). NEVER mention AI receptionist, phone-answering AI, voice AI, Emma, or anything voice-related — that product was DROPPED 2026-06-09.

OFFER:
- 80 fresh exclusive homeowner leads per month delivered Monday morning (~20/wk), in the contractor's zip+trade. Real names + addresses + phone. Sourced from public-record events (permits, aged HVAC units, property turnover, code-violation listings).
- AUTO-OUTREACH: one-click button — AI sends personalized email + SMS to each delivered lead as if from the contractor. Contractor gets phone notification when homeowner replies. Saves them 1-2 hrs/day of cold-reachout.
- EXCLUSIVE territory — leads never shared like HomeAdvisor/Angie/Networx.
- **First month $97 w/ code FIRST400** (saves $400). Then $497/mo flat.
- Need more mid-month? Extra leads $25 each (any amount).
- **Performance guarantee**: 1 paying job booked in 30 days or full refund.
- 30-day money-back guarantee. Cancel anytime. No setup. No phone numbers required. No integration.
- CTA URL: bellavego.com/start?promo=FIRST400

NEVER USE THESE PHRASES — they reference the deprecated receptionist product:
"AI receptionist", "Emma", "answers your calls", "voice AI", "books the job", "phone AI", "24/7 answering", demo line phone number, anything about phones answering or call routing.

RULES:
- Personalize w/ {{firstName}} {{companyName}} {{city}} merge tags
- Subject ≤ 65 chars
- Body ≤ 180 words
- Direct, plain language. No jargon. No marketing-speak.
- Talk to a guy under a truck, not a CFO.
- ALWAYS include: bellavego.com/start CTA, $497/30-day MBG, performance guarantee (1 job in 30 days or refund)
- Hormozi $100M Offers principles: dream outcome + perceived likelihood + low time-delay + low effort
- Each variant must be MEANINGFULLY DIFFERENT in angle from existing variants (don't just reshuffle words)
- ABSOLUTELY NEVER: "consulting report", "review count", "market intel", "ranked vs competitors", "competitor analysis"

OUTPUT: exact JSON, no preamble, no markdown:
[
  {"variant_slug":"v2-...", "subject":"...", "body":"...", "angle":"why this is different"},
  {"variant_slug":"v3-...", "subject":"...", "body":"...", "angle":"why this is different"}
]`

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

  // Fetch existing variants + last 7 days of scores so Sonnet can avoid duplication
  const { data: existing } = await supabase
    .from('outreach_variants')
    .select('variant_slug, subject, body, status, step')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('step', 0)

  const { data: scores } = await supabase
    .from('outreach_variant_scores')
    .select('variant_id, sent, open_rate, reply_rate, click_rate, date')
    .gte('date', new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10))
    .order('date', { ascending: false })

  const userPrompt = `Today's date: ${new Date().toISOString().slice(0, 10)}

Existing variants in this campaign (don't duplicate angles):
${(existing || []).map((v) => `- ${v.variant_slug} [${v.status}]: "${v.subject}"`).join('\n')}

Last 7 days performance (helps you understand what's working):
${(scores || []).slice(0, 12).map((s) => `${s.date}: sent=${s.sent}, open=${(Number(s.open_rate) * 100).toFixed(1)}%, reply=${(Number(s.reply_rate) * 100).toFixed(2)}%, click=${(Number(s.click_rate) * 100).toFixed(2)}%`).join('\n') || '(no perf data yet — Day 1)'}

Write 2 new Step 0 variants. Each must take a DIFFERENT angle than the existing variants. Examples of fresh angles: storytelling (lost-job-because), question-led (you ever missed a $1,200 install?), local-pride ({{city}} crews), social-proof ("Mike in {{city}} signed up Mon"), competitor-pain (Rosie/Goodcall charge more), wisdom-of-elders (we built this for guys like my uncle).`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = msg.content.find((c) => c.type === 'text')?.text || '[]'
  // Strip code fences if Sonnet wrapped it
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()

  type Variant = { variant_slug: string; subject: string; body: string; angle?: string }
  let variants: Variant[] = []
  try {
    variants = JSON.parse(cleaned) as Variant[]
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Sonnet returned non-JSON', raw: text.slice(0, 500) })
  }

  let inserted = 0
  const errors: string[] = []
  for (const v of variants) {
    const row = {
      campaign_id: CAMPAIGN_ID,
      variant_slug: v.variant_slug,
      step: 0,
      subject: v.subject,
      body: v.body,
      status: 'draft' as const,
      generated_by: 'agent:variant-generator',
      generation_notes: v.angle || 'no angle provided',
    }
    const { error } = await supabase.from('outreach_variants').insert(row)
    if (error) errors.push(`${v.variant_slug}: ${error.message}`)
    else inserted++
  }

  return NextResponse.json({
    ok: errors.length === 0,
    inserted,
    errors,
    sonnet_returned: variants.length,
    checked_at: new Date().toISOString(),
  })
}
