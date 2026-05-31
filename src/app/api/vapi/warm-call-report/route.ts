import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/vapi/warm-call-report
 *
 * Vapi end-of-call webhook for warm-caller outbound. Different from the
 * inbound /api/vapi/end-of-call-report which handles tenant + demo calls.
 *
 * Parses the take_message tool call args, updates outreach_calls + the
 * source outreach_leads row, and fires a hot-lead SMS to Peter
 * (FALLBACK_OWNER_PHONE) within seconds of the call ending.
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const eventType = body?.message?.type
  if (eventType !== 'end-of-call-report' && eventType !== 'status-update') {
    return NextResponse.json({ ok: true, ignored: eventType })
  }
  if (eventType === 'status-update') {
    // Only react to terminal states; ignore intermediate ringing/in-progress.
    return NextResponse.json({ ok: true, ignored: 'status-update' })
  }

  const vapiCallId = body?.message?.call?.id || body?.message?.callId || null
  const metadata = body?.message?.call?.assistantOverrides?.metadata ?? body?.message?.metadata ?? {}
  const leadId = metadata?.lead_id ?? null
  const businessName = metadata?.business_name ?? null

  if (!leadId) {
    return NextResponse.json({ ok: false, error: 'no lead_id in metadata' }, { status: 200 })
  }

  const toolCalls = body?.message?.toolCallList ?? body?.message?.toolCalls ?? []
  const takeMsg = toolCalls.find(
    (t: any) => (t?.function?.name || t?.name) === 'take_message',
  )
  const dncCall = toolCalls.find(
    (t: any) => (t?.function?.name || t?.name) === 'set_dnc',
  )

  const args: any = takeMsg
    ? (typeof takeMsg.function?.arguments === 'string'
        ? safeJson(takeMsg.function.arguments)
        : (takeMsg.function?.arguments ?? takeMsg.arguments ?? {}))
    : {}

  const outcome = args.outcome ?? (dncCall ? 'dnc' : 'unknown')
  const hotLead = !!args.hot_lead
  const callbackPhone = args.callback_phone ?? null
  const callbackName = args.callback_name ?? null
  const notes = args.notes ?? null
  const objection = args.objection ?? null

  const durationSec = Math.round((body?.message?.durationSeconds ?? body?.message?.endedReason && body?.message?.duration) || 0)
  const transcript = body?.message?.transcript ?? null
  const recordingUrl = body?.message?.recordingUrl ?? body?.message?.artifact?.recordingUrl ?? null
  const cost = body?.message?.cost ?? null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Update outreach_calls row matched on vapi_call_id (created at trigger time)
  if (vapiCallId) {
    const { error: updErr } = await supabase
      .from('outreach_calls')
      .update({
        ended_at: new Date().toISOString(),
        duration_sec: durationSec,
        outcome,
        outcome_detail: objection ?? notes,
        callback_at: args.callback_iso ?? null,
        hot_lead: hotLead,
        recording_url: recordingUrl,
        transcript,
        cost_usd: typeof cost === 'number' ? cost : null,
      })
      .eq('vapi_call_id', vapiCallId)
    if (updErr) console.error('warm-call DB update failed:', updErr.message)
  }

  // Mirror minimal status to outreach_leads
  const leadPatch: Record<string, unknown> = { call_attempted_at: new Date().toISOString(), call_outcome: outcome }
  if (notes) leadPatch.call_notes = notes
  if (dncCall) {
    // 5-year DNC honor
    leadPatch.dnc_until = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString()
    leadPatch.status = 'unsubscribed'
  }
  await supabase.from('outreach_leads').update(leadPatch).eq('id', leadId)

  // HOT LEAD → SMS Peter immediately
  if (hotLead && callbackPhone) {
    const peterPhone = process.env.FALLBACK_OWNER_PHONE
    if (peterPhone) {
      try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
        const fromNumber =
          process.env.TWILIO_DEMO_NUMBER || process.env.TWILIO_PHONE_NUMBER!
        await twilioClient.messages.create({
          from: fromNumber,
          to: peterPhone,
          body:
            `🔥 HOT LEAD — Emma just qualified one\n\n` +
            `🏠 ${businessName ?? 'shop'}\n` +
            `👤 ${callbackName ?? 'owner'}\n` +
            `📞 ${callbackPhone}\n` +
            (notes ? `📝 ${String(notes).slice(0, 200)}\n` : '') +
            `\nText them in next 10 min — Emma promised you would.`,
        })
        await supabase
          .from('outreach_calls')
          .update({ founder_notified_at: new Date().toISOString() })
          .eq('vapi_call_id', vapiCallId ?? '')
      } catch (e) {
        console.error('hot-lead Peter SMS failed:', e)
      }
    }
  }

  return NextResponse.json({ ok: true, outcome, hot_lead: hotLead })
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}
