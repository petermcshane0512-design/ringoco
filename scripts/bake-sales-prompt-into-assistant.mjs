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
// for the start marker ("You are Emma, an AI sales representative") and
// reads to the closing backtick before "}".
const vapiSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/vapi.ts'), 'utf8')
const startMarker = 'return `You are Emma, an AI sales representative for BellAveGo.'
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

const config = {
  firstMessage: "Hi, this is Emma with BellAveGo. I know you're checking out our AI receptionist for home-service businesses — how can I help?",
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    temperature: 0.6,
    maxTokens: 260,
    messages: [{ role: 'system', content: SALES_PROMPT }],
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
