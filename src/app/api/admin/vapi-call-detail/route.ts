import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Pull a single Vapi call with full messages array + transcript so we
 * can analyze Emma's dialogue. Pass ?call_id= for a specific call, or
 * ?assistant_id= to get the most-recent call on that assistant.
 *
 * Auth: requireAdmin().
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.VAPI_API_KEY) {
    return NextResponse.json({ error: 'VAPI_API_KEY not set' }, { status: 500 })
  }

  const params = new URL(req.url).searchParams
  let callId = params.get('call_id')
  const assistantId = params.get('assistant_id')

  // If no call_id, find the most recent for the assistant.
  if (!callId && assistantId) {
    const listRes = await fetch(
      `https://api.vapi.ai/call?assistantId=${assistantId}&limit=1`,
      { headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` } },
    )
    if (!listRes.ok) {
      return NextResponse.json(
        { error: `Vapi list HTTP ${listRes.status}` },
        { status: 500 },
      )
    }
    const arr = (await listRes.json()) as Array<{ id?: string }>
    callId = arr[0]?.id ?? null
    if (!callId) {
      return NextResponse.json({ error: 'no calls found for assistant' }, { status: 404 })
    }
  }

  if (!callId) {
    return NextResponse.json(
      { error: 'pass ?call_id= or ?assistant_id=' },
      { status: 400 },
    )
  }

  const r = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  })
  if (!r.ok) {
    return NextResponse.json(
      { error: `Vapi call HTTP ${r.status}`, body: (await r.text()).slice(0, 300) },
      { status: 500 },
    )
  }
  const call = (await r.json()) as Record<string, unknown>

  // Trim to the most useful fields for dialogue analysis
  return NextResponse.json({
    id: call.id,
    createdAt: call.createdAt,
    endedAt: call.endedAt,
    endedReason: call.endedReason,
    durationSec: call.endedAt && call.createdAt
      ? Math.round((new Date(call.endedAt as string).getTime() - new Date(call.createdAt as string).getTime()) / 1000)
      : null,
    cost: call.cost,
    customer: (call.customer as { number?: string } | undefined)?.number,
    phoneNumber: (call.phoneNumber as { number?: string } | undefined)?.number,
    summary: call.summary,
    analysis: call.analysis,
    transcript: call.transcript,
    messages: call.messages,
    assistantId: call.assistantId,
    assistantOverrides_metadata: (call.assistantOverrides as { metadata?: unknown } | undefined)?.metadata,
  })
}
