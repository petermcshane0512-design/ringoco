import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { renderSalesAgentPrompt } from '@/lib/vapi'

/**
 * Bake the latest sales-agent prompt into the live Vapi assistant.
 *
 *   curl -X POST -H "x-admin-secret: $ADMIN_API_SECRET" \
 *        https://www.bellavego.com/api/admin/sync-vapi-prompt
 *
 * Replaces the existing scripts/bake-sales-prompt-into-assistant.mjs flow
 * with a server-side path so we can hit it from anywhere without needing
 * VAPI_API_KEY exposed locally. Vapi credentials live in Vercel env;
 * this route runs in that env at request time.
 *
 * What it does:
 *   1. Calls renderSalesAgentPrompt() to get the latest system prompt
 *   2. PATCHes the Vapi assistant with that prompt + the 3 function
 *      tools (take_message, check_availability, book_appointment).
 *      Vapi's PATCH on model REPLACES the whole sub-object so we MUST
 *      re-send tools every time — without them Emma loses the ability
 *      to call take_message and no lead emails fire.
 *
 * Required env: VAPI_API_KEY, VAPI_ASSISTANT_ID
 * Optional env: VAPI_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  return runSync(req)
}

// GET also allowed for convenience (curl with no body works). Same auth.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  return runSync(req)
}

async function runSync(req: NextRequest) {
  const apiKey = process.env.VAPI_API_KEY
  const assistantId = process.env.VAPI_ASSISTANT_ID || 'cccc9db9-7a6b-4211-b6b1-a68de8e21458'
  if (!apiKey) {
    return NextResponse.json({ error: 'VAPI_API_KEY not set in Vercel env' }, { status: 500 })
  }

  const appUrl =
    (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'
  const webhookSecret = process.env.VAPI_WEBHOOK_SECRET

  const salesPrompt = renderSalesAgentPrompt()

  // Optional override: ?firstMessage=… changes the greeting without
  // re-deploying. Default matches the assistant-request override copy
  // (Peter 2026-06-03 — CLOSER mode, fast open, no features dump).
  const url = new URL(req.url)
  const firstMessage =
    url.searchParams.get('firstMessage') ||
    "Hi, this is Emma with Bell Ahva Go. Do you want to hear about our software, or how I'd answer a phone call for your team?"

  const tools = [
    {
      type: 'function',
      function: {
        name: 'take_message',
        description:
          "Call this after you've captured the caller's first name AND one-sentence reason for the call. " +
          "In SALES MODE on the demo line, call AFTER answering their questions AND capturing first name + business name. " +
          "Phone is captured from caller ID — do NOT ask the caller for it.",
        parameters: {
          type: 'object',
          properties: {
            customer_name: { type: 'string', description: "Caller's first name." },
            reason: {
              type: 'string',
              description:
                "ONE plain-language sentence describing what they want. Sales-mode examples: " +
                "'Mike\\'s Plumbing — ready to sign up for Pro $297', 'Tom\\'s HVAC — asked about pricing, leaning Starter'.",
            },
            urgency: { type: 'string', enum: ['emergency', 'soon', 'whenever'] },
            customer_phone: { type: 'string', description: 'OPTIONAL — only if caller volunteers a different callback number.' },
          },
          required: ['customer_name', 'reason', 'urgency'],
        },
      },
      server: {
        url: `${appUrl}/api/vapi/end-of-call-report`,
        ...(webhookSecret ? { secret: webhookSecret } : {}),
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_availability',
        description:
          "Call this ONLY when the per-call system prompt says the contractor has a connected calendar AND the caller wants a specific appointment time. " +
          "Returns 3-4 real open slots. If no calendar is connected, do NOT call this — just take a message.",
        parameters: {
          type: 'object',
          properties: {
            duration_min: { type: 'number', description: 'Service call=60, install/quote=90, big install=120-180. Default 90.' },
            days_ahead: { type: 'number', description: "Default 14. 'This week' = 7. 'Next week' = 10." },
          },
          required: [],
        },
      },
      server: {
        url: `${appUrl}/api/calendar/availability`,
        ...(webhookSecret ? { secret: webhookSecret } : {}),
      },
    },
    {
      type: 'function',
      function: {
        name: 'book_appointment',
        description:
          'Call IMMEDIATELY after the caller picks one of the slots check_availability returned. ' +
          'DO NOT call without first calling check_availability. ' +
          'DO NOT call if no calendar is connected.',
        parameters: {
          type: 'object',
          properties: {
            start_iso: { type: 'string', description: 'EXACT ISO-8601 timestamp from the slot the caller picked — use verbatim.' },
            duration_min: { type: 'number', description: 'Same value passed to check_availability. Default 90.' },
            customer_name: { type: 'string', description: "Caller's first name." },
            service_summary: { type: 'string', description: 'ONE sentence describing the job.' },
          },
          required: ['start_iso', 'customer_name', 'service_summary'],
        },
      },
      server: {
        url: `${appUrl}/api/calendar/book`,
        ...(webhookSecret ? { secret: webhookSecret } : {}),
      },
    },
  ]

  const config = {
    firstMessage,
    model: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      temperature: 0.6,
      maxTokens: 260,
      messages: [{ role: 'system', content: salesPrompt }],
      tools,
    },
  }

  try {
    const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const body = await res.json().catch(() => ({})) as { firstMessage?: string; model?: { messages?: Array<{ content?: string }> } }
    if (!res.ok) {
      return NextResponse.json({ error: `Vapi HTTP ${res.status}`, body }, { status: 502 })
    }
    return NextResponse.json({
      ok: true,
      assistantId,
      promptChars: salesPrompt.length,
      firstMessageApplied: body.firstMessage?.slice(0, 160) ?? null,
      systemPromptFirst200: body.model?.messages?.[0]?.content?.slice(0, 200) ?? null,
      toolCount: tools.length,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
