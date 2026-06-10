import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/leads/[id]/generate-message
 *
 * 2026-06-09 LEADS-ONLY PIVOT — the per-lead AI message generator.
 *
 * Returns a personalized email + SMS the contractor can send to a specific
 * lead. Pulls:
 *   - Contractor's outreach_prompt_template (Sonnet-written at onboarding
 *     end via /api/leads/generate-outreach-prompt). Stored as JSON in
 *     profiles.outreach_prompt_template.
 *   - Specific lead data (homeowner name, address, signal, etc).
 *
 * Strategy: if template has merge tags ({{lead_first_name}}, {{lead_address}},
 * {{lead_signal}}, {{lead_zip}}), do simple find-replace. If template is
 * missing or merge fails, fall back to live Sonnet generation per lead.
 *
 * Result NOT persisted — caller picks "Send SMS" or "Send Email" to
 * actually dispatch.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Lead = {
  id: string
  street_address: string | null
  zip: string | null
  city: string | null
  state: string | null
  source: string | null
  source_details: Record<string, unknown> | null
  trade_match: string[] | null
}

type LeadDrop = {
  id: string
  lead_id: string
  user_id: string
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
}

type Profile = {
  business_name: string | null
  owner_first_name: string | null
  owner_last_name: string | null
  owner_phone: string | null
  years_in_business: number | null
  value_props: string[] | null
  outreach_tone: string | null
  outreach_prompt_template: string | null
}

function homeownerFirstName(fullName: string | null | undefined): string {
  if (!fullName) return 'there'
  const parts = fullName.trim().split(/\s+/)
  return parts[0] || 'there'
}

function describeSignal(source: string | null, details: Record<string, unknown> | null): string {
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

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: leadId } = await ctx.params

  // Lead drop must belong to this tenant
  const { data: dropRaw } = await supabase
    .from('lead_drops')
    .select('id, lead_id, user_id, owner_name, owner_phone, owner_email')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .maybeSingle()
  let drop = (dropRaw as LeadDrop | null) || null

  // Fall back to direct leads row if no drop record (lead engine didn't assign it)
  let owner_name: string | null = null
  let owner_phone: string | null = null
  let owner_email: string | null = null
  if (drop) {
    owner_name = drop.owner_name
    owner_phone = drop.owner_phone
    owner_email = drop.owner_email
  }

  const { data: leadRaw, error: leadErr } = await supabase
    .from('leads')
    .select('id, street_address, zip, city, state, source, source_details, trade_match')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr || !leadRaw) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 })
  const lead = leadRaw as Lead
  // Refuse aging_hvac: synthetic zip-aggregate row, no underlying property.
  // describeSignal() would emit a false per-property claim ("your HVAC system
  // flagged as past typical lifespan"). Never deliver to a homeowner.
  if (lead.source === 'aging_hvac') {
    return NextResponse.json({ ok: false, error: 'lead source not deliverable (synthetic zip-aggregate)' }, { status: 422 })
  }

  const { data: pRaw } = await supabase
    .from('profiles')
    .select('business_name, owner_first_name, owner_last_name, owner_phone, years_in_business, value_props, outreach_tone, outreach_prompt_template')
    .eq('user_id', userId)
    .maybeSingle()
  const profile = (pRaw as Profile | null) || {} as Profile
  if (!profile.business_name || !profile.owner_first_name) {
    return NextResponse.json({ ok: false, error: 'Finish onboarding first — your business info is required to write the message' }, { status: 400 })
  }

  const leadFirstName = homeownerFirstName(owner_name)
  const leadAddress = lead.street_address || `your home in ${lead.zip || ''}`
  const leadZip = lead.zip || ''
  const leadSignal = describeSignal(lead.source, lead.source_details)

  // 1) Try merge from cached template
  if (profile.outreach_prompt_template) {
    try {
      const tpl = JSON.parse(profile.outreach_prompt_template) as { email_subject?: string; email_body?: string; sms?: string }
      if (tpl.email_subject && tpl.email_body && tpl.sms) {
        const vars = {
          lead_first_name: leadFirstName,
          lead_address: leadAddress,
          lead_zip: leadZip,
          lead_signal: leadSignal,
        }
        return NextResponse.json({
          ok: true,
          email_subject: mergeTemplate(tpl.email_subject, vars),
          email_body: mergeTemplate(tpl.email_body, vars),
          sms: mergeTemplate(tpl.sms, vars),
          source: 'cached_template',
        })
      }
    } catch { /* fall through to Sonnet */ }
  }

  // 2) Fall back to live Sonnet generation per lead
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing on Vercel + no cached template' }, { status: 500 })
  }
  const tone = (profile.outreach_tone || 'casual').toLowerCase()
  const valueProps = (profile.value_props || []).join(', ') || '(none listed)'
  const years = profile.years_in_business ? `${profile.years_in_business} years in business` : ''
  const trade = (lead.trade_match || []).join(' / ') || 'home services'

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Write an outreach email + SMS to a homeowner on behalf of a home-service contractor. Tone: ${tone}. Sounds 1-to-1, signed by the contractor. Reference the signal that surfaced the lead. NEVER mention BellAveGo, AI, automation, or mass outreach. Output JSON: {"email_subject","email_body","sms"}`,
      messages: [{
        role: 'user',
        content: `Contractor: ${profile.business_name}, run by ${profile.owner_first_name} ${profile.owner_last_name || ''} (${years}). Value props: ${valueProps}. Trade: ${trade}.

Homeowner: ${leadFirstName} at ${leadAddress}.

Signal that surfaced this lead: ${leadSignal}.

Write the email (subject + body, ≤180 words) and SMS (≤300 chars). Sign with "${profile.owner_first_name}". Match tone "${tone}".`,
      }],
    })
    const text = msg.content.find((c) => c.type === 'text')?.text || '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned) as { email_subject?: string; email_body?: string; sms?: string }
    if (!parsed.email_subject || !parsed.email_body || !parsed.sms) {
      return NextResponse.json({ ok: false, error: 'Sonnet returned incomplete' }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      email_subject: parsed.email_subject,
      email_body: parsed.email_body,
      sms: parsed.sms,
      source: 'sonnet_live',
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Sonnet failed: ${(e as Error).message}` }, { status: 500 })
  }
}
