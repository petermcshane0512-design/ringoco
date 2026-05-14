import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { OFFICE_MGR_TIERS } from '@/lib/pricing'
import { verifyVapiSignature } from '@/lib/vapi'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)
const anthropic = new Anthropic()

/**
 * Vapi post-call webhook. Receives two event types we care about:
 *   - tool-calls       → AI called book_appointment. Run the booking flow.
 *   - end-of-call-report → conversation finished. Log transcript + finalize.
 *
 * The booking flow mirrors the legacy /api/twilio/voice path:
 *   1. Upsert customer (by phone)
 *   2. Insert job (status 'pending_approval')
 *   3. Office Mgr+: Claude smart-insight tip
 *   4. SMS contractor with YES/NO buttons + insight
 *   5. SMS homeowner with "owner will confirm" message
 *   6. Upsert call_logs (also enables the Receptionist tier cap counter)
 *
 * Tenant context comes from assistantOverrides.metadata (set in
 * /api/vapi/assistant-request). Falls back to looking up by called number if
 * metadata is missing (e.g. for legacy assistants without metadata wired).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  const sig = req.headers.get('x-vapi-signature')
  if (!(await verifyVapiSignature(raw, sig))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: VapiServerMessage
  try {
    payload = JSON.parse(raw) as VapiServerMessage
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = payload.message
  if (!message) return NextResponse.json({ ok: true })

  try {
    if (message.type === 'tool-calls') {
      return await handleToolCalls(message)
    }
    if (message.type === 'end-of-call-report') {
      return await handleEndOfCallReport(message)
    }
    // Any other event — acknowledge so Vapi doesn't retry
    return NextResponse.json({ ok: true, ignored: message.type })
  } catch (e) {
    console.error('vapi webhook handler threw:', e)
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}

// ── tool-calls (take_message) ───────────────────────────────────
async function handleToolCalls(message: VapiServerMessage['message']) {
  if (!message) return NextResponse.json({ ok: true })

  const calls = message.toolCalls ?? message.toolCallList ?? []
  const results: Array<{ toolCallId: string; result: string }> = []

  for (const tc of calls) {
    if (tc.function?.name !== 'take_message') {
      results.push({
        toolCallId: tc.id,
        result: 'Unknown tool — ignored.',
      })
      continue
    }
    const args = parseToolArgs(tc.function.arguments)
    const tenant = extractTenant(message)
    const callSid = message.call?.id ?? cryptoRandom()
    const callerPhone =
      message.call?.customer?.number ?? args.customer_phone ?? null

    // Demo number — send a "this was a BellAveGo demo" SMS to the caller,
    // skip DB writes + contractor SMS. Same isDemo path the legacy route uses.
    if (tenant.is_demo) {
      const callerNumber = args.customer_phone || callerPhone
      if (callerNumber) {
        try {
          await twilioClient.messages.create({
            body: `Hi ${args.customer_name}! This is a BellAveGo demo from Smith HVAC & Plumbing. We captured your message ("${args.reason}") in under 60 seconds — Mike would call you back in the next hour or two. Build this for your business → bellavego.com`,
            from: tenant.twilio_number || process.env.TWILIO_DEMO_NUMBER || process.env.TWILIO_PHONE_NUMBER!,
            to: callerNumber,
          })
        } catch (e) {
          console.error('demo caller SMS failed:', e)
        }
      }
      results.push({
        toolCallId: tc.id,
        result: "Demo message captured. You'll get a text in a moment.",
      })
      continue
    }

    if (!tenant.user_id) {
      results.push({
        toolCallId: tc.id,
        result: "Couldn't locate the business account — please call back.",
      })
      continue
    }

    const r = await takeMessage({
      tenant,
      args,
      callSid,
      callerPhone,
      calledNumber: tenant.twilio_number ?? message.call?.phoneNumber?.number ?? null,
    })

    results.push({
      toolCallId: tc.id,
      result: r.success
        ? "Message captured. The owner will call you back in the next hour or two."
        : `Issue: ${r.error}`,
    })
  }

  return NextResponse.json({ results })
}

async function takeMessage(opts: {
  tenant: TenantMeta
  args: TakeMessageArgs
  callSid: string
  callerPhone: string | null
  calledNumber: string | null
}): Promise<{ success: boolean; error?: string }> {
  const { tenant, args, callSid, callerPhone, calledNumber } = opts
  const phone = args.customer_phone || callerPhone
  const urgencyEmoji = args.urgency === 'emergency' ? '🚨' : args.urgency === 'soon' ? '⚡' : '🕓'

  // 1. Upsert customer (no address — the AI doesn't capture it anymore)
  let customerId: string | undefined
  if (phone) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .eq('user_id', tenant.user_id)
      .maybeSingle()
    if (existing) {
      customerId = existing.id
    } else {
      const { data: created } = await supabase
        .from('customers')
        .insert({
          user_id: tenant.user_id,
          name: args.customer_name,
          phone,
        })
        .select('id')
        .single()
      customerId = created?.id
    }
  }

  // 2. Insert job (status 'pending_approval' kept for dashboard backward compat —
  // semantically this is "needs callback" not "needs scheduling confirmation").
  const { data: jobRow, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      user_id: tenant.user_id,
      customer_id: customerId,
      customer_name: args.customer_name,
      customer_phone: phone,
      job_type: args.reason,
      scheduled_time: 'callback requested',
      title: `Callback: ${args.customer_name} — ${args.reason}`,
      status: 'pending_approval',
    })
    .select('id')
    .single()

  if (jobErr) {
    console.error('vapi take_message: job insert failed', jobErr)
    return { success: false, error: 'database write failed' }
  }

  // 2b. Seed quote_followups so Quote Hunter chases the lead if the contractor
  // doesn't make the callback within 2 days. Office Mgr/Concierge only.
  try {
    const twoDaysOut = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('quote_followups').insert({
      user_id: tenant.user_id,
      customer_name: args.customer_name,
      customer_phone: phone,
      quote_description: args.reason,
      source: 'ai_call',
      status: 'pending',
      next_followup_at: twoDaysOut,
    })
  } catch (e) {
    console.error('quote_followups seed (vapi) failed:', e)
  }

  // 3. Smart insight (Office Mgr+) — quick sales tip from the captured reason
  let smartInsight = ''
  if (OFFICE_MGR_TIERS.has(tenant.plan_tier ?? '')) {
    try {
      const r = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system:
          'Read a one-sentence callback request a homeowner left with an AI receptionist. Output ONE short sales/ops tip the contractor should know BEFORE calling them back. ' +
          '≤25 words. Concrete. Format: "💡 [tip]". If nothing useful, output "💡 Standard callback — no extra notes."',
        messages: [
          {
            role: 'user',
            content: `Callback request: ${args.customer_name} (${phone}) said: "${args.reason}". Urgency: ${args.urgency}.`,
          },
        ],
      })
      smartInsight = r.content[0].type === 'text' ? r.content[0].text.trim() : ''
    } catch (e) {
      console.error('smart-insight failed:', e)
    }
  }

  // 4. SMS contractor — tap-to-call link, no YES/NO
  const ownerPhone = tenant.owner_phone ?? process.env.FALLBACK_OWNER_PHONE
  const fromNumber = calledNumber || tenant.twilio_number || process.env.TWILIO_PHONE_NUMBER!
  if (ownerPhone) {
    try {
      const insightLine = smartInsight ? `\n\n${smartInsight}` : ''
      const telLink = phone ? `\n\n📲 Tap to call: ${phone}` : ''
      await twilioClient.messages.create({
        body: `${urgencyEmoji} New callback via BellAveGo\n\n👤 ${args.customer_name}\n📞 ${phone}\n💬 ${args.reason}\n⚡ Urgency: ${args.urgency}${insightLine}${telLink}\n\nView at bellavego.com/dashboard`,
        from: fromNumber,
        to: ownerPhone,
      })
    } catch (e) {
      console.error('contractor SMS failed:', e)
    }
  }

  // 5. SMS the caller — "we'll call you back" reassurance
  if (phone) {
    try {
      const businessName = tenant.business_name || 'us'
      await twilioClient.messages.create({
        body: `Hi ${args.customer_name}, thanks for calling ${businessName}! We got your message about "${args.reason}". The owner will call you back in the next hour or two. - ${businessName}`,
        from: fromNumber,
        to: phone,
      })
    } catch (e) {
      console.error('caller SMS failed:', e)
    }
  }

  // 6. Upsert call_logs (powers Receptionist tier monthly call cap counter)
  try {
    await supabase.from('call_logs').upsert(
      {
        user_id: tenant.user_id,
        profile_id: tenant.user_id,
        call_sid: callSid,
        caller_phone: callerPhone,
        job_type: args.reason,
        job_created: true,
        booking_completed: true,
        job_id: jobRow?.id,
      },
      { onConflict: 'call_sid' },
    )
  } catch (e) {
    console.error('call_logs upsert failed:', e)
  }

  return { success: true }
}

// ── end-of-call-report (analytics + cap counter for non-booked calls) ──
async function handleEndOfCallReport(message: VapiServerMessage['message']) {
  if (!message) return NextResponse.json({ ok: true })
  const tenant = extractTenant(message)
  const callSid = message.call?.id ?? cryptoRandom()
  const callerPhone = message.call?.customer?.number ?? null
  const transcript = message.transcript ?? message.artifact?.transcript ?? null
  const summary = message.summary ?? message.analysis?.summary ?? null
  const messageCaptured = (message.toolCallList ?? message.toolCalls ?? []).some(
    (tc) => tc.function?.name === 'take_message',
  )

  // Demo calls don't write to DB.
  if (tenant.is_demo) {
    return NextResponse.json({ ok: true, demo: true })
  }

  if (!tenant.user_id) {
    return NextResponse.json({ ok: true, note: 'no tenant metadata' })
  }

  // Upsert call_logs — if booking already finalized this row via tool-call,
  // we just merge transcript + summary. Otherwise (caller hung up early)
  // we create an inception row so the tier cap counts the attempt.
  try {
    await supabase.from('call_logs').upsert(
      {
        user_id: tenant.user_id,
        profile_id: tenant.user_id,
        call_sid: callSid,
        caller_phone: callerPhone,
        transcript: typeof transcript === 'string' ? transcript : transcript ? JSON.stringify(transcript) : null,
        summary,
        job_created: messageCaptured,
        booking_completed: messageCaptured,
      },
      { onConflict: 'call_sid' },
    )
  } catch (e) {
    console.error('end-of-call call_logs upsert failed:', e)
  }

  return NextResponse.json({ ok: true })
}

// ── helpers ─────────────────────────────────────────────────────

type TenantMeta = {
  user_id: string
  business_name?: string | null
  owner_phone?: string | null
  plan_tier?: string | null
  twilio_number?: string | null
  is_demo?: boolean
}

function extractTenant(message: VapiServerMessage['message']): TenantMeta {
  const md = (message?.assistant?.metadata ?? message?.call?.assistantOverrides?.metadata ?? {}) as Record<string, unknown>
  return {
    user_id: (md.user_id as string) ?? '',
    business_name: (md.business_name as string) ?? null,
    plan_tier: (md.plan_tier as string) ?? null,
    twilio_number: (md.twilio_number as string) ?? null,
    owner_phone: (md.owner_phone as string) ?? null,
    is_demo: md.is_demo === true,
  }
}

type TakeMessageArgs = {
  customer_name: string
  customer_phone: string
  reason: string
  urgency: 'emergency' | 'soon' | 'whenever' | string
}

function parseToolArgs(args: unknown): TakeMessageArgs {
  const empty: TakeMessageArgs = { customer_name: '', customer_phone: '', reason: '', urgency: 'soon' }
  if (typeof args === 'string') {
    try {
      return { ...empty, ...(JSON.parse(args) as Partial<TakeMessageArgs>) }
    } catch {
      return empty
    }
  }
  return { ...empty, ...((args as Partial<TakeMessageArgs>) ?? {}) }
}

function cryptoRandom(): string {
  return 'vapi_' + Math.random().toString(36).slice(2, 12)
}

// ── Types (narrow shape of Vapi's server messages) ──────────────
type VapiToolCall = {
  id: string
  function?: { name?: string; arguments?: unknown }
}

type VapiServerMessage = {
  message?: {
    type: 'tool-calls' | 'end-of-call-report' | string
    call?: {
      id?: string
      customer?: { number?: string }
      phoneNumber?: { number?: string }
      assistantOverrides?: { metadata?: Record<string, unknown> }
    }
    assistant?: { metadata?: Record<string, unknown> }
    toolCalls?: VapiToolCall[]
    toolCallList?: VapiToolCall[]
    transcript?: string | unknown
    summary?: string
    analysis?: { summary?: string }
    artifact?: { transcript?: string }
  }
}
