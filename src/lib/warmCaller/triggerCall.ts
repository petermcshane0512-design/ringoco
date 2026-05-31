/**
 * Trigger a Vapi outbound warm call.
 *
 * Wraps Vapi's POST /call/phone with: business-hours guard, DNC check,
 * dedup check, prospect context injection, and outreach_calls logging.
 *
 * Called by /api/crons/warm-caller (the daily batch) and by
 * scripts/test-warm-caller.mjs (manual smoke test).
 */

import { createClient } from '@supabase/supabase-js'
import { renderWarmCallSystemPrompt, WARM_CALL_TOOLS, type WarmCallContext } from './prompt'

const VAPI_API_BASE = 'https://api.vapi.ai'

export type TriggerCallInput = {
  leadId: string
  leadPhone: string
  leadCity: string
  leadStateAbbr?: string | null
  context: WarmCallContext
  dryRun?: boolean
}

export type TriggerCallResult =
  | { ok: true; vapiCallId: string; outreachCallId: string }
  | { ok: false; skipped: 'dnc' | 'after_hours' | 'recent_dial' | 'invalid_phone' | 'env_missing'; reason: string }
  | { ok: false; error: string }

/**
 * US state → IANA timezone (approximate — covers the bulk of HVAC ICP).
 * For shops on a tz boundary, leans conservative (pushes call window later).
 */
const STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Denver',
  IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago', KS: 'America/Chicago',
  KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles',
  NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York',
  NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York', OK: 'America/Chicago',
  OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York',
  WI: 'America/Chicago', WY: 'America/Denver',
}

function isWithinBusinessHours(stateAbbr: string | null | undefined, nowUtc: Date = new Date()): boolean {
  const tz = STATE_TZ[(stateAbbr || '').toUpperCase()] || 'America/New_York'
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false,
  }).formatToParts(nowUtc)
  const weekday = parts.find((p) => p.type === 'weekday')?.value || ''
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
  // Mon-Fri 8am-7pm prospect local time. No Saturday calls (HVAC owners weekend).
  if (weekday === 'Sat' || weekday === 'Sun') return false
  return hour >= 8 && hour < 19
}

function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/[^\d]/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export async function triggerWarmCall(input: TriggerCallInput): Promise<TriggerCallResult> {
  const {
    VAPI_API_KEY,
    VAPI_WARM_CALLER_ASSISTANT_ID,
    VAPI_OUTBOUND_PHONE_NUMBER_ID,
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = process.env

  if (!VAPI_API_KEY || !VAPI_WARM_CALLER_ASSISTANT_ID || !VAPI_OUTBOUND_PHONE_NUMBER_ID) {
    return { ok: false, skipped: 'env_missing', reason: 'Vapi outbound env not configured' }
  }
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, skipped: 'env_missing', reason: 'Supabase env not configured' }
  }

  const phone = normalizePhone(input.leadPhone)
  if (!phone) return { ok: false, skipped: 'invalid_phone', reason: `cannot normalize ${input.leadPhone}` }

  if (!isWithinBusinessHours(input.leadStateAbbr)) {
    return { ok: false, skipped: 'after_hours', reason: `outside business hours for ${input.leadStateAbbr}` }
  }

  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // DNC check
  const { data: lead } = await supabase
    .from('outreach_leads')
    .select('id, dnc_until')
    .eq('id', input.leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'lead not found' }
  if (lead.dnc_until && new Date(lead.dnc_until).getTime() > Date.now()) {
    return { ok: false, skipped: 'dnc', reason: `dnc until ${lead.dnc_until}` }
  }

  // Dedup: any call in last 7 days?
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('outreach_calls')
    .select('id')
    .eq('lead_id', input.leadId)
    .gte('initiated_at', weekAgo)
    .limit(1)
  if (recent && recent.length > 0) {
    return { ok: false, skipped: 'recent_dial', reason: `already dialed within 7 days` }
  }

  if (input.dryRun) {
    return { ok: true, vapiCallId: 'DRY-RUN-' + crypto.randomUUID(), outreachCallId: 'DRY-RUN' }
  }

  // Pre-create outreach_calls row so webhook can correlate via vapi_call_id later
  const systemPrompt = renderWarmCallSystemPrompt(input.context)

  const vapiPayload = {
    phoneNumberId: VAPI_OUTBOUND_PHONE_NUMBER_ID,
    assistantId: VAPI_WARM_CALLER_ASSISTANT_ID,
    customer: { number: phone },
    assistantOverrides: {
      model: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'system', content: systemPrompt }],
        tools: WARM_CALL_TOOLS,
        maxTokens: 220,
        temperature: 0.4,
      },
      metadata: {
        lead_id: input.leadId,
        warm_call: true,
        business_name: input.context.prospect_business_name,
      },
    },
  }

  const vapiRes = await fetch(`${VAPI_API_BASE}/call/phone`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(vapiPayload),
  })

  if (!vapiRes.ok) {
    const errText = await vapiRes.text().catch(() => '<no body>')
    return { ok: false, error: `Vapi ${vapiRes.status}: ${errText.slice(0, 300)}` }
  }

  const callData = await vapiRes.json() as { id?: string; status?: string }
  const vapiCallId = callData.id || ''

  const { data: inserted, error: insertErr } = await supabase
    .from('outreach_calls')
    .insert({
      lead_id: input.leadId,
      vapi_call_id: vapiCallId,
      phone_dialed: phone,
      initiated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertErr) {
    return { ok: false, error: `inserted Vapi call but DB log failed: ${insertErr.message}` }
  }

  return { ok: true, vapiCallId, outreachCallId: inserted.id }
}
