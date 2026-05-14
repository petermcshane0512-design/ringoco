/**
 * Support FAQ knowledge base.
 *
 * Used by the AI support agent to auto-resolve common questions. Each entry
 * has a topic (semantic match key), the canonical answer, and a confidence
 * floor — questions matching THIS topic are safe to auto-reply on.
 *
 * The agent's Claude call is given the full KB + the customer's question +
 * their profile/recent activity, and returns:
 *   { topic, reply, confidence, escalate_reason? }
 *
 * Rules:
 *  - confidence >= 0.85 AND no escalate_reason → auto-reply, mark resolved
 *  - confidence < 0.85 OR escalate_reason set → leave for Peter
 *  - Topics tagged ESCALATE_ONLY = never auto-reply, always Peter
 */

export type FaqEntry = {
  topic: string
  triggers: string[] // example phrasings — used in prompt for matching
  answer: string
  escalateOnly?: boolean
}

export const SUPPORT_FAQ: FaqEntry[] = [
  {
    topic: 'how_to_setup_forwarding',
    triggers: [
      'how do I set up call forwarding',
      "calls aren't forwarding",
      'where do I forward my number',
      "AI isn't answering my calls",
      'forwarding setup',
    ],
    answer:
      `Call forwarding takes about 60 seconds. Open this page on your business cell: https://www.bellavego.com/dashboard/forwarding — it auto-detects your carrier and shows the exact dial code (Verizon: *71, AT&T/T-Mobile: **61*). Tap the green button on that page from your business cell, press call, and you're done. ` +
      `Test it by calling your business number from another phone, don't pick up for ~15 seconds — the AI takes over. Reply HELP if you get stuck and I'll walk you through it.`,
  },
  {
    topic: 'ai_offline_or_not_answering',
    triggers: [
      'AI is offline',
      "AI isn't answering",
      'my receptionist stopped working',
      'no calls coming through',
      "why isn't it working",
    ],
    answer:
      `Two most common causes when the AI isn't answering: ` +
      `(1) call forwarding isn't set up on your business cell yet — check https://www.bellavego.com/dashboard/forwarding. ` +
      `(2) your payment lapsed — check https://www.bellavego.com/dashboard/billing. ` +
      `If neither of those, reply with your business name and I'll dig in immediately.`,
  },
  {
    topic: 'change_voice_or_tone',
    triggers: [
      'change the voice',
      'different voice',
      'make her sound more professional',
      'change the tone',
      'voice settings',
      'too robotic',
    ],
    answer:
      `You can change the AI's tone and add custom instructions from https://www.bellavego.com/dashboard/settings — pick friendly / professional / concise, optionally add notes like "always mention we offer free estimates." Changes are live within ~60 seconds. ` +
      `If you want a totally different voice option not in the dropdown, reply with which one and I'll switch it on the backend.`,
  },
  {
    topic: 'cancel_subscription',
    triggers: [
      'how do I cancel',
      'I want to cancel',
      'cancel my subscription',
      'end my subscription',
      'stop my service',
    ],
    answer:
      `You can cancel anytime from https://www.bellavego.com/dashboard/billing → "Manage subscription" → "Cancel." Service stays live until the end of your current billing period. ` +
      `If you're cancelling because something isn't working, reply with what's broken first and I'll fix it — most issues are 5-minute resolutions.`,
    escalateOnly: true, // Always escalate cancel intent so Peter can save the customer
  },
  {
    topic: 'request_refund',
    triggers: [
      'I want a refund',
      'refund my money',
      'this isn\'t working',
      'I want my money back',
    ],
    answer: 'Refund requests handled personally — see thread.',
    escalateOnly: true, // Always escalate refund requests
  },
  {
    topic: 'billing_or_charge_question',
    triggers: [
      "I was charged wrong",
      "double charged",
      "what is this charge",
      "billing question",
      "card was declined",
    ],
    answer: 'Billing questions handled personally — see thread.',
    escalateOnly: true,
  },
  {
    topic: 'reports_not_arriving',
    triggers: [
      "haven't gotten a report",
      "where are my reports",
      "no consulting report yet",
      "report still pending",
    ],
    answer:
      `Reports run on your plan's cadence: Receptionist = bi-monthly (6/yr), Office Manager = monthly (12/yr), Concierge = weekly + quarterly deep-dive. ` +
      `Your welcome report fires the day after activation. All reports live at https://www.bellavego.com/dashboard/reports. ` +
      `If your activation was less than 24 hours ago, the welcome report is still queueing — it'll land by tomorrow morning.`,
  },
  {
    topic: 'add_another_number_or_location',
    triggers: [
      'add another number',
      'add a second location',
      'multi-location',
      'I have multiple shops',
    ],
    answer:
      `Right now each subscription gets one BellAveGo number. If you have multiple locations or shops, we have a Multi-Location plan ($2,497/loc/mo) that handles unlimited numbers + shared dashboard. Reply YES if you want me to send you a sign-up link.`,
  },
  {
    topic: 'call_cap_question',
    triggers: [
      'how many calls do I get',
      'call limit',
      'ran out of calls',
      'what happens if I hit the cap',
    ],
    answer:
      `Receptionist tier = 250 calls/month. Office Manager and Concierge = unlimited. When Receptionist hits 250 in a month, the AI plays a polite "we've hit capacity this month" message until the 1st. ` +
      `If you're consistently near the cap, upgrading to Office Manager ($797/mo) pays for itself in 2-3 captured leads. Reply UPGRADE to switch.`,
  },
  {
    topic: 'export_data',
    triggers: [
      'export my data',
      'download my customers',
      'CSV export',
      'data portability',
    ],
    answer:
      `You can export your customers, jobs, and call logs from https://www.bellavego.com/dashboard → click any of those sections → there's a "Download CSV" button at the top right. ` +
      `If you don't see the button or want a different format (Excel, etc.), reply with what you need.`,
  },
  {
    topic: 'integration_or_api',
    triggers: [
      'do you have an API',
      'integrate with Jobber',
      'integrate with Housecall Pro',
      'sync to my CRM',
      'webhook',
    ],
    answer:
      `Direct CRM integrations (Jobber, Housecall Pro, ServiceTitan, JobNimbus) are coming in 2026 Q3. ` +
      `In the meantime, every booking we capture lands in your dashboard with a "Send to CRM" copy-paste button. If your CRM has a webhook ingest endpoint, reply with the URL and I'll wire it up directly.`,
  },
  {
    topic: 'general_how_does_it_work',
    triggers: [
      'how does this work',
      'how does the AI work',
      'what does BellAveGo do',
    ],
    answer:
      `Short version: customers call your business number. If you don't pick up in ~15 seconds, the call forwards to BellAveGo. Our AI answers in your business name, captures the caller's name + reason, then texts you a tap-to-call link. You call them back when you have a free hand. ` +
      `Full overview: https://www.bellavego.com/founder. Reply with anything specific you want clarified.`,
  },
]

export function faqContextForPrompt(): string {
  return SUPPORT_FAQ
    .map((f, i) =>
      `[${i + 1}] topic: ${f.topic}${f.escalateOnly ? ' (ESCALATE_ONLY)' : ''}\n` +
      `    triggers: ${f.triggers.join(' | ')}\n` +
      `    answer: ${f.answer.replace(/\n/g, ' ')}`
    )
    .join('\n\n')
}

export function getEscalateOnlyTopics(): Set<string> {
  return new Set(SUPPORT_FAQ.filter((f) => f.escalateOnly).map((f) => f.topic))
}
