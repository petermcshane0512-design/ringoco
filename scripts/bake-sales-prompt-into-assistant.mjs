#!/usr/bin/env node
/**
 * Pragmatic fix: skip the assistant-request webhook entirely for the
 * demo line and bake the full sales prompt directly into the base
 * Vapi assistant. The webhook override path has been failing silently
 * for unknown reasons — Vapi accepts the response but doesn't apply
 * it. Until we figure out why, the demo line gets the sales prompt
 * via the assistant's own config, which Vapi DEFINITELY uses.
 *
 * Trade-off: per-call override flexibility goes away for the demo
 * line. Tenant lines still need the override path for personalization
 * (their business name, etc.), but tenants don't exist yet — that's a
 * later problem.
 *
 * Run:
 *   VAPI_API_KEY=<key> node scripts/bake-sales-prompt-into-assistant.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const KEY = process.env.VAPI_API_KEY
const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || 'cccc9db9-7a6b-4211-b6b1-a68de8e21458'

if (!KEY) { console.error('VAPI_API_KEY required'); process.exit(1) }

// Read the renderSalesAgentPrompt() return string out of lib/vapi.ts.
// Hacky but avoids needing to compile TS or duplicate the prompt. Looks
// for the start marker (the first line of the prompt template literal)
// and reads to the closing backtick before "}".
const vapiSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/vapi.ts'), 'utf8')
const startMarker = 'return `You are Emma — the AI on BellAveGo\'s public demo line.'
const startIdx = vapiSrc.indexOf(startMarker)
if (startIdx < 0) {
  console.error('Could not locate renderSalesAgentPrompt() start in src/lib/vapi.ts')
  process.exit(1)
}
// Find the closing backtick — scan forward until we hit a backtick at the start of a line or one followed by `}`
let endIdx = startIdx + startMarker.length
let inEscape = false
while (endIdx < vapiSrc.length) {
  const ch = vapiSrc[endIdx]
  if (inEscape) { inEscape = false; endIdx++; continue }
  if (ch === '\\') { inEscape = true; endIdx++; continue }
  if (ch === '`') break
  endIdx++
}
if (endIdx >= vapiSrc.length) {
  console.error('Could not find closing backtick for sales prompt')
  process.exit(1)
}

// Extract just the prompt content (skip the `return \`` opener).
const SALES_PROMPT = vapiSrc.slice(startIdx + 'return `'.length, endIdx)
console.log(`Extracted sales prompt: ${SALES_PROMPT.length} chars`)
console.log(`First 100 chars: ${SALES_PROMPT.slice(0, 100)}`)
console.log(`Last 100 chars:  ${SALES_PROMPT.slice(-100)}`)
console.log()

// IMPORTANT: PATCH on Vapi's model object REPLACES the whole thing —
// it doesn't merge. So we must re-send tools every time we PATCH the
// model. Without this, the assistant ends up with 0 tools and Emma
// can't call take_message → no lead emails fire when calls end.
// Bug observed in production May 22 2026 — first call after the bake
// closed the sale but never captured the lead because tools were wiped.
const APP_URL = 'https://www.bellavego.com'
const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET // optional

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
              "'Mike\\'s Plumbing — ready to sign up for Operator $797', 'Tom\\'s HVAC — asked about pricing, leaning Mission Control'.",
          },
          urgency: { type: 'string', enum: ['emergency', 'soon', 'whenever'] },
          customer_phone: { type: 'string', description: "OPTIONAL — only if caller volunteers a different callback number." },
        },
        required: ['customer_name', 'reason', 'urgency'],
      },
    },
    server: {
      url: `${APP_URL}/api/vapi/end-of-call-report`,
      ...(WEBHOOK_SECRET ? { secret: WEBHOOK_SECRET } : {}),
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
      url: `${APP_URL}/api/calendar/availability`,
      ...(WEBHOOK_SECRET ? { secret: WEBHOOK_SECRET } : {}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description:
        "Call IMMEDIATELY after the caller picks one of the slots check_availability returned. " +
        "DO NOT call without first calling check_availability. " +
        "DO NOT call if no calendar is connected.",
      parameters: {
        type: 'object',
        properties: {
          start_iso: { type: 'string', description: 'EXACT ISO-8601 timestamp from the slot the caller picked — use verbatim.' },
          duration_min: { type: 'number', description: 'Same value passed to check_availability. Default 90.' },
          customer_name: { type: 'string', description: "Caller's first name." },
          service_summary: { type: 'string', description: "ONE sentence describing the job." },
        },
        required: ['start_iso', 'customer_name', 'service_summary'],
      },
    },
    server: {
      url: `${APP_URL}/api/calendar/book`,
      ...(WEBHOOK_SECRET ? { secret: WEBHOOK_SECRET } : {}),
    },
  },
]

const config = {
  firstMessage: "Hi, this is Emma with BellAveGo — thanks for checking us out! Would you like to hear about our software, or hear how I'd answer your customers' phone calls?",
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    temperature: 0.6,
    maxTokens: 260,
    messages: [{ role: 'system', content: SALES_PROMPT }],
    tools,
  },
}

console.log(`PATCHing assistant ${ASSISTANT_ID}…`)
const r = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(config),
})
const body = await r.json()
if (!r.ok) {
  console.error(`HTTP ${r.status}:`, body)
  process.exit(1)
}
console.log(`OK — assistant updated`)
console.log(`  firstMessage: ${body.firstMessage?.slice(0, 120)}`)
console.log(`  systemPrompt first 200: ${body.model?.messages?.[0]?.content?.slice(0, 200)}`)
