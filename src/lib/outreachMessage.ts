import Anthropic from '@anthropic-ai/sdk'

/**
 * buildOutreachMessage — the single place a personalized homeowner
 * email + SMS gets written for a (lead, contractor) pair.
 *
 * Extracted 2026-06-12 from /api/leads/[id]/generate-message so the SAME
 * logic can run in two places:
 *   1. /api/leads/list — PRE-generates messages at dashboard load and
 *      persists them on lead_drops (per Peter: "scripts already loaded
 *      up", no click-and-wait).
 *   2. /api/leads/[id]/generate-message — on-demand fallback/regenerate.
 *
 * Strategy unchanged: merge the contractor's cached
 * profiles.outreach_prompt_template (free, instant) when it exists;
 * fall back to live Sonnet otherwise. NEVER mentions BellAveGo/AI.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export type OutreachLead = {
  street_address: string | null
  zip: string | null
  source: string | null
  source_details: Record<string, unknown> | null
  trade_match: string[] | null
}

export type OutreachProfile = {
  business_name: string | null
  owner_first_name: string | null
  owner_last_name: string | null
  years_in_business: number | null
  value_props: string[] | null
  outreach_tone: string | null
  outreach_prompt_template: string | null
}

export type OutreachMessage = { email_subject: string; email_body: string; sms: string; source: 'cached_template' | 'sonnet_live' }

export type OutreachResult =
  | ({ ok: true } & OutreachMessage)
  | { ok: false; error: 'profile_incomplete'; missing: string[] }
  | { ok: false; error: string }

export function homeownerFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there'
  const parts = fullName.trim().split(/\s+/)
  return parts[0] || 'there'
}

export function describeSignal(source: string | null, details: Record<string, unknown> | null): string {
  if (!source) return 'recent activity on the property'
  const d = details || {}
  if (source === 'permit') return `permit filed: ${String(d.work_description || d.permit_type || 'home improvement')}`
  if (source === 'aging_hvac') return `your HVAC system flagged as past typical lifespan (16+ yrs)`
  if (source === 'move_in') return `just purchased the property — most folks like an HVAC checkup before peak season`
  if (source === 'storm') return `recent storm in your area — checking on roof/HVAC damage`
  return 'recent property record event'
}

function mergeTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '')
}

/** The hybrid-onboarding gate — which profile fields block AI outreach. */
export function missingProfileFields(profile: OutreachProfile): string[] {
  const realBusinessName = (profile.business_name || '').trim()
  const missing: string[] = []
  if (!realBusinessName || realBusinessName.toLowerCase() === 'my business') missing.push('business_name')
  if (!(profile.owner_first_name || '').trim()) missing.push('owner_first_name')
  if (!(profile.outreach_tone || '').trim()) missing.push('outreach_tone')
  if (!profile.value_props || profile.value_props.length === 0) missing.push('value_props')
  return missing
}

/**
 * Template-only fast path — pure string merge, no API call, microseconds.
 * Returns null when the cached template is missing/incomplete (caller
 * decides whether to pay for the Sonnet fallback).
 */
export function buildFromTemplate(
  lead: OutreachLead,
  ownerName: string | null,
  profile: OutreachProfile,
): OutreachMessage | null {
  if (!profile.outreach_prompt_template) return null
  try {
    const tpl = JSON.parse(profile.outreach_prompt_template) as { email_subject?: string; email_body?: string; sms?: string }
    if (!tpl.email_subject || !tpl.email_body || !tpl.sms) return null
    const vars = {
      lead_first_name: homeownerFirstName(ownerName),
      lead_address: lead.street_address || `your home in ${lead.zip || ''}`,
      lead_zip: lead.zip || '',
      lead_signal: describeSignal(lead.source, lead.source_details),
    }
    return {
      email_subject: mergeTemplate(tpl.email_subject, vars),
      email_body: mergeTemplate(tpl.email_body, vars),
      sms: mergeTemplate(tpl.sms, vars),
      source: 'cached_template',
    }
  } catch {
    return null
  }
}

export async function buildOutreachMessage(
  lead: OutreachLead,
  ownerName: string | null,
  profile: OutreachProfile,
): Promise<OutreachResult> {
  const missing = missingProfileFields(profile)
  if (missing.length > 0) return { ok: false, error: 'profile_incomplete', missing }

  // 1) Cached template merge — free, instant.
  const merged = buildFromTemplate(lead, ownerName, profile)
  if (merged) return { ok: true, ...merged }

  // 2) Live Sonnet fallback.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY missing on Vercel + no cached template' }
  }
  const realBusinessName = (profile.business_name || '').trim()
  const signer = (profile.owner_first_name || '').trim() || realBusinessName
  const tone = (profile.outreach_tone || 'casual').toLowerCase()
  const valueProps = (profile.value_props || []).join(', ') || '(none listed)'
  const years = profile.years_in_business ? `${profile.years_in_business} years in business` : ''
  const trade = (lead.trade_match || []).join(' / ') || 'home services'
  const leadFirstName = homeownerFirstName(ownerName)
  const leadAddress = lead.street_address || `your home in ${lead.zip || ''}`
  const leadSignal = describeSignal(lead.source, lead.source_details)

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Write an outreach email + SMS to a homeowner on behalf of a home-service contractor. Tone: ${tone}. Sounds 1-to-1, signed by the contractor. Reference the signal that surfaced the lead. NEVER mention BellAveGo, AI, automation, or mass outreach. Output JSON: {"email_subject","email_body","sms"}`,
      messages: [{
        role: 'user',
        content: `Contractor: ${realBusinessName}${profile.owner_first_name ? `, run by ${profile.owner_first_name} ${profile.owner_last_name || ''}` : ''}${years ? ` (${years})` : ''}. Value props: ${valueProps}. Trade: ${trade}.

Homeowner: ${leadFirstName} at ${leadAddress}.

Signal that surfaced this lead: ${leadSignal}.

Write the email (subject + body, ≤180 words) and SMS (≤300 chars). Sign with "${signer}". Match tone "${tone}".`,
      }],
    })
    const text = msg.content.find((c) => c.type === 'text')?.text || '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned) as { email_subject?: string; email_body?: string; sms?: string }
    if (!parsed.email_subject || !parsed.email_body || !parsed.sms) {
      return { ok: false, error: 'Sonnet returned incomplete' }
    }
    return { ok: true, email_subject: parsed.email_subject, email_body: parsed.email_body, sms: parsed.sms, source: 'sonnet_live' }
  } catch (e) {
    return { ok: false, error: `Sonnet failed: ${(e as Error).message}` }
  }
}
