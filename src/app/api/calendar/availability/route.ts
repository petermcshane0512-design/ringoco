import { NextRequest, NextResponse } from 'next/server'
import { verifyVapiSignature } from '@/lib/vapi'
import { findAvailableSlots } from '@/lib/calendar/availability'

/**
 * Vapi tool endpoint — called by the AI receptionist mid-conversation when
 * it wants to offer specific appointment times to a homeowner.
 *
 * Two entry points:
 *
 * 1. Vapi tool-call (preferred at runtime). Body is the standard Vapi
 *    server message shape with toolCallList. The tool name is
 *    `check_availability`. Args: { duration_min?: number, days_ahead?: number }.
 *    Tenant comes from message.assistant.metadata.user_id.
 *
 * 2. Direct POST (for testing / future non-Vapi callers). Body:
 *    { user_id, duration_min?, days_ahead? }
 *
 * Response (tool-call format):
 *   { results: [{ toolCallId, result: "<human-readable slot list>" }] }
 *
 * Response (direct):
 *   { connected, slots: [...], ... }
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()

  // Try Vapi-signed request first
  if (await verifyVapiSignature(raw, req.headers)) {
    let payload: VapiServerMessage
    try {
      payload = JSON.parse(raw) as VapiServerMessage
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    return handleVapiToolCall(payload)
  }

  // Otherwise treat as direct call (for testing). No tenant impersonation
  // possible since user_id must be explicitly supplied + we don't trust it
  // for cross-tenant reads — but this endpoint is read-only so worst case
  // is enumerating slot availability for a user_id you already know.
  let direct: { user_id?: string; duration_min?: number; days_ahead?: number }
  try {
    direct = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON or signature' }, { status: 401 })
  }
  if (!direct.user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }
  const summary = await findAvailableSlots({
    userId: direct.user_id,
    durationMin: direct.duration_min,
    daysAhead: direct.days_ahead,
  })
  return NextResponse.json(summary)
}

// ── Vapi tool-call handler ─────────────────────────────────────
async function handleVapiToolCall(payload: VapiServerMessage) {
  const message = payload.message
  if (!message) return NextResponse.json({ ok: true })

  const calls = message.toolCalls ?? message.toolCallList ?? []
  const results: Array<{ toolCallId: string; result: string }> = []

  const md = (message.assistant?.metadata ?? message.call?.assistantOverrides?.metadata ?? {}) as Record<string, unknown>
  const userId = (md.user_id as string) || ''
  const isDemo = md.is_demo === true

  for (const tc of calls) {
    if (tc.function?.name !== 'check_availability') {
      results.push({ toolCallId: tc.id, result: 'Unknown tool — ignored.' })
      continue
    }

    if (isDemo) {
      // Demo number — don't hit real APIs, return canned response
      results.push({
        toolCallId: tc.id,
        result:
          'Mike has Tuesday January 14 at 2 PM, Wednesday January 15 at 9 AM, ' +
          'or Thursday January 16 at 11 AM. Which works best for you?',
      })
      continue
    }

    if (!userId) {
      results.push({ toolCallId: tc.id, result: 'No tenant context — please call back.' })
      continue
    }

    const args = parseToolArgs(tc.function.arguments)
    const summary = await findAvailableSlots({
      userId,
      durationMin: args.duration_min,
      daysAhead: args.days_ahead,
    })

    if (!summary.connected) {
      // Calendar wasn't connected at all — let AI fall back to message-taking
      results.push({
        toolCallId: tc.id,
        result:
          "No calendar is connected for this contractor. " +
          "Please just take a message — they'll call back to schedule.",
      })
      continue
    }

    if (summary.slots.length === 0) {
      results.push({
        toolCallId: tc.id,
        result:
          "No open slots in the next 2 weeks based on the contractor's calendar. " +
          "Take a message and let them know the owner will call back to find a time.",
      })
      continue
    }

    // Emit a natural, AI-readable list of the top 3-4 slots.
    // Each line includes the human-readable label AND the ISO timestamp so the
    // AI can pass the ISO back verbatim in take_message → which lets us
    // auto-create the calendar event with millisecond precision (Phase 2).
    const top = summary.slots.slice(0, 4)
    const lines = top.map((s, i) => `Option ${i + 1}: ${s.label}  [iso=${s.start}, duration_min=${summary.durationMin}]`)

    results.push({
      toolCallId: tc.id,
      result:
        `The contractor has these open slots:\n${lines.join('\n')}\n\n` +
        `Read the human labels (NOT the iso=) to the caller. When they pick one, ` +
        `call take_message with appointment_start_iso = the iso= value from their pick ` +
        `AND appointment_duration_min = ${summary.durationMin}. ` +
        `This lets the system auto-book the appointment into the contractor's calendar.`,
    })
  }

  return NextResponse.json({ results })
}

type VapiToolCall = {
  id: string
  function?: { name?: string; arguments?: unknown }
}

type VapiServerMessage = {
  message?: {
    type: 'tool-calls' | string
    call?: {
      id?: string
      assistantOverrides?: { metadata?: Record<string, unknown> }
    }
    assistant?: { metadata?: Record<string, unknown> }
    toolCalls?: VapiToolCall[]
    toolCallList?: VapiToolCall[]
  }
}

function parseToolArgs(args: unknown): { duration_min?: number; days_ahead?: number } {
  const empty = {}
  if (typeof args === 'string') {
    try { return { ...empty, ...(JSON.parse(args) as object) } } catch { return empty }
  }
  return { ...empty, ...((args as object) ?? {}) }
}
