import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/leads/generate-outreach-prompt
 *
 * 2026-06-09 LEADS-ONLY PIVOT — the moat feature.
 *
 * Reads the contractor's onboarding data (business name, owner first/last
 * name, trade(s), zip, value props, years in business, tone preference)
 * and uses Sonnet 4.6 to write a personalized outreach PROMPT TEMPLATE.
 * Template uses {{lead_first_name}}, {{lead_address}}, {{lead_signal}},
 * {{lead_zip}} merge tags so each delivered lead gets a custom-feeling
 * email + SMS without re-prompting Sonnet at send-time.
 *
 * Saves template to profiles.outreach_prompt_template. The auto-outreach
 * dispatcher (TBD) reads the template + the lead's data + writes the
 * actual sent email/SMS.
 *
 * Fires after onboarding completes (called from /dashboard/setup last
 * step). Re-callable any time profile data changes.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Profile = {
  user_id: string
  business_name: string | null
  owner_first_name: string | null
  owner_last_name: string | null
  owner_phone: string | null
  business_type: string | null
  services_offered: string | null
  service_zips: string[] | null
  job_types: string[] | null
  min_job_value_cents: number | null
  years_in_business: number | null
  value_props: string[] | null
  outreach_tone: string | null
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  casual: 'Casual + friendly. Short sentences. Like a guy texting a neighbor. No buzzwords. No "We at [Company] are pleased to..."',
  professional: 'Professional but warm. Like a contractor who has been in business 10+ years. Clear, polite, direct value.',
  direct: 'Direct, no-fluff. Short and punchy. Cut the small talk. State the problem, state the offer, ask for the yes.',
}

const SYSTEM = `You write outreach email + SMS PROMPT TEMPLATES used by an AI dispatcher to send personalized cold outreach to homeowner leads on behalf of a home-service contractor.

The contractor uploads onboarding data. You generate:
1. An EMAIL template (subject + body, with merge tags)
2. An SMS template (≤300 chars w/ merge tag)

MERGE TAGS available in templates (the dispatcher fills these per-lead):
- {{lead_first_name}} — homeowner first name
- {{lead_address}} — full street address
- {{lead_zip}} — zip code
- {{lead_signal}} — why this lead surfaced (e.g. "permit filed for AC condenser", "16yr-old heating system flagged", "new property owner")

CRITICAL CONSTRAINTS:
- Sound like the CONTRACTOR, not BellAveGo. Sign with the owner's first name (already known from onboarding data).
- Reference at least ONE value prop from the contractor's list (financing, warranty, family-owned, etc).
- Reference years in business if provided ("running [Business] for X years" or "in the business since 20XX").
- Reference the SPECIFIC lead signal ({{lead_signal}}) so the homeowner knows we did homework.
- DO NOT mention BellAveGo, AI, automation, mass email, or anything that breaks the 1-to-1 illusion.
- DO NOT promise specific prices in the email/SMS — keep it conversational, ask if they want a free quote.
- Match the tone preference exactly.
- Use first names only — never "Mr." or "Mrs.".

OUTPUT: exact JSON, no preamble, no markdown:
{
  "email_subject": "...",
  "email_body": "...",
  "sms": "..."
}`

export async function POST(_req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const { data: pRaw, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_first_name, owner_last_name, owner_phone, business_type, services_offered, service_zips, job_types, min_job_value_cents, years_in_business, value_props, outreach_tone')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !pRaw) return NextResponse.json({ ok: false, error: 'profile not found' }, { status: 404 })

  const p = pRaw as Profile
  if (!p.business_name || !p.owner_first_name) {
    return NextResponse.json({ ok: false, error: 'incomplete onboarding — business_name + owner_first_name required' }, { status: 400 })
  }

  const trade = p.business_type || p.services_offered || 'home services'
  const tone = (p.outreach_tone || 'casual').toLowerCase()
  const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.casual
  const valueProps = (p.value_props || []).join(', ') || '(none listed)'
  const yearsLine = p.years_in_business
    ? `${p.years_in_business} years in business`
    : 'years-in-business not provided — skip referencing it'
  const jobTypes = (p.job_types || []).join(', ') || 'general home-service work'

  const userPrompt = `Contractor profile:
- Business name: ${p.business_name}
- Owner first name: ${p.owner_first_name}
- Owner last name: ${p.owner_last_name || '(not provided)'}
- Trade: ${trade}
- Job types they want: ${jobTypes}
- Years in business: ${yearsLine}
- Value props (use AT LEAST ONE): ${valueProps}
- Tone preference: ${tone}
- Tone instruction: ${toneInstruction}

Write the email + SMS templates. Use the merge tags. Sign emails with ${p.owner_first_name}. Make it sound like ${p.owner_first_name} personally wrote it.`

  let result: { email_subject?: string; email_body?: string; sms?: string }
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = msg.content.find((c) => c.type === 'text')?.text || '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    result = JSON.parse(cleaned)
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Sonnet failed: ${(e as Error).message}` }, { status: 500 })
  }

  if (!result.email_subject || !result.email_body || !result.sms) {
    return NextResponse.json({ ok: false, error: 'Sonnet returned incomplete template' }, { status: 500 })
  }

  const template = JSON.stringify({
    email_subject: result.email_subject,
    email_body: result.email_body,
    sms: result.sms,
    generated_at: new Date().toISOString(),
    tone,
    used_value_props: p.value_props,
  })

  const { error: upErr } = await supabase
    .from('profiles')
    .update({ outreach_prompt_template: template })
    .eq('user_id', userId)
  if (upErr) {
    return NextResponse.json({ ok: false, error: `db write failed: ${upErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    email_subject: result.email_subject,
    email_body_preview: result.email_body.slice(0, 300),
    sms_preview: result.sms,
  })
}

// GET — return current template
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('outreach_prompt_template')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const template = (data as { outreach_prompt_template?: string | null } | null)?.outreach_prompt_template
  if (!template) return NextResponse.json({ ok: true, template: null })
  try {
    return NextResponse.json({ ok: true, template: JSON.parse(template) })
  } catch {
    return NextResponse.json({ ok: true, template: { raw: template } })
  }
}
