import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { buildOutreachMessage, type OutreachLead, type OutreachProfile } from '@/lib/outreachMessage'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/leads/[id]/generate-message
 *
 * 2026-06-09 LEADS-ONLY PIVOT — the per-lead AI message generator.
 * 2026-06-12 — message-building logic extracted to lib/outreachMessage.ts
 * so /api/leads/list can PRE-generate the same messages at dashboard load
 * (per Peter: scripts already loaded up). This route stays as the
 * on-demand fallback/regenerate path; behavior + status codes unchanged.
 *
 * The result is now ALSO persisted to lead_drops.ai_* so a regenerate
 * survives refresh and the dashboard renders it instantly next load.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type LeadRow = OutreachLead & { id: string; city: string | null; state: string | null; owner_name: string | null }

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
  const drop = (dropRaw as { id: string; owner_name: string | null } | null) || null

  const { data: leadRaw, error: leadErr } = await supabase
    .from('leads')
    .select('id, street_address, zip, city, state, source, source_details, trade_match, owner_name')
    .eq('id', leadId)
    .maybeSingle()
  if (leadErr || !leadRaw) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 })
  const lead = leadRaw as LeadRow
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
  const profile = (pRaw as OutreachProfile | null) || {} as OutreachProfile

  const ownerName = drop?.owner_name || lead.owner_name
  const result = await buildOutreachMessage(lead, ownerName, profile)

  if (!result.ok) {
    if ('missing' in result) {
      // Hybrid onboarding gate — dashboard renders the 45-second inline
      // setup at the exact moment of intent (first send).
      return NextResponse.json({ ok: false, error: 'profile_incomplete', missing: result.missing }, { status: 428 })
    }
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  // Persist so refresh keeps the message and list pre-load skips this lead.
  if (drop) {
    await supabase.from('lead_drops').update({
      ai_sms: result.sms,
      ai_email_subject: result.email_subject,
      ai_email_body: result.email_body,
      ai_generated_at: new Date().toISOString(),
    }).eq('id', drop.id)
  }

  return NextResponse.json({
    ok: true,
    email_subject: result.email_subject,
    email_body: result.email_body,
    sms: result.sms,
    source: result.source,
  })
}
