import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/hot-opener-trigger
 *
 * Hourly Mon-Sat 9-5 CST. Catches "hand-raisers" — prospects who opened
 * Step 0 ≥3 times OR clicked the link — and auto-fires a 1-to-1
 * follow-up from peter@bellavego.com referencing the open behavior +
 * $200-off code + direct call/text CTA.
 *
 * Replaces the manual billyGO-style chase. Hormozi $100M Leads
 * ascension ladder pattern: detect intent signal, accelerate offer.
 *
 * SMS Peter w/ each hand-raiser so he can ALSO personally call. Auto
 * email + manual call = 2x close vs either alone.
 *
 * Idempotent: marks hand_raise_followup_sent_at to never re-fire.
 *
 * Why a separate "main" inbox (peter@bellavego.com vs burner domain
 * that sent Step 0): looks personally written. Different domain =
 * different envelope = doesn't show up as "Re:" of the cold sequence
 * in their inbox. Feels 1-to-1.
 */

const HAND_RAISE_THRESHOLD_OPENS = 3
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const SYSTEM = `Write a 1-to-1 follow-up email from Peter (founder of BellAveGo) to a home-service contractor (HVAC, plumbing, electrical, roofing, or handyman) who opened Peter's cold email multiple times but hasn't replied.

CONTEXT: Peter sent them a cold email earlier this week pitching BellAveGo (AI receptionist + 5 fresh homeowner leads/week + $97 first month w/ code FIRST200 + 30-day money-back). They opened it {{open_count}} times. That's a hand-raise signal.

GOAL: Write a short personal follow-up acknowledging the opens (without being creepy), restating the offer, and asking for a 10-min call OR a hit-the-URL.

RULES:
- 5-7 lines total, max 130 words
- Subject ≤ 55 chars, starts lowercase, no emoji
- Acknowledge the multiple opens softly: "saw {{companyName}} took a few looks" / "noticed you came back to my note a couple times" — NEVER "you opened my email 3 times" (creepy)
- Reference ONE specific fact about their business (city, trade) — don't fake what you don't know
- Drop these in order: hand-raise acknowledgment → specific business fact → offer recap ($97 first month w/ FIRST200, then $297, 30-day MBG) → 2-line CTA (URL + text/call Peter direct 773-710-9565)
- Tone: confident peer, not salesperson. Direct.
- DO NOT: open w/ "Hi", "Hope this finds you well", "I wanted to reach out", "I noticed you" (robotic)

OUTPUT: exact JSON, no preamble:
{"subject":"...", "body":"..."}`

type Lead = {
  id: string
  email: string
  business_name: string | null
  owner_first_name: string | null
  city: string | null
  state: string | null
  trade: string | null
  email_open_count?: number | null  // populated by Instantly sync
}

type HotSignal = { opens: number; clicks: number; reason: 'click' | 'opens' }

async function fetchHotInstantlyLeads(): Promise<Map<string, HotSignal>> {
  // Pull leads from Instantly v2 leads/list and filter to hand-raisers.
  // TRIGGERS (any one):
  //   - ≥1 link click (strongest signal — overrides opens threshold)
  //   - ≥3 opens AND not bounced AND not replied negative
  const KEY = process.env.INSTANTLY_API_KEY!
  // No server-side campaign filter — paginate then filter client-side
  const items: Array<{ email?: string; email_open_count?: number; email_click_count?: number; email_reply_count?: number; opens?: number; clicks?: number; replies?: number; campaign?: string; id?: string }> = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = { limit: 100 }
    if (cursor) body.starting_after = cursor
    const r = await fetch('https://api.instantly.ai/api/v2/leads/list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) break
    const j = await r.json()
    const batch = (j.items || j.data || []) as typeof items
    items.push(...batch.filter((l) => l.campaign === CAMPAIGN_ID))
    cursor = j.next_starting_after as string | undefined
    if (!cursor) break
  }
  const map = new Map<string, HotSignal>()
  for (const lead of items) {
    const opens = lead.email_open_count ?? lead.opens ?? 0
    const clicks = lead.email_click_count ?? lead.clicks ?? 0
    const replies = lead.email_reply_count ?? lead.replies ?? 0
    // Skip anyone who replied — pester not allowed
    if (replies > 0) continue
    if (clicks >= 1) {
      map.set((lead.email || '').toLowerCase(), { opens, clicks, reason: 'click' })
    } else if (opens >= HAND_RAISE_THRESHOLD_OPENS) {
      map.set((lead.email || '').toLowerCase(), { opens, clicks, reason: 'opens' })
    }
  }
  return map
}

async function generateHandRaiseEmail(lead: Lead, openCount: number): Promise<{ subject: string; body: string } | null> {
  const ctx = [
    `Business name: ${lead.business_name || 'unknown'}`,
    `Owner first name: ${lead.owner_first_name || 'unknown'}`,
    `City: ${lead.city || 'unknown'}${lead.state ? ', ' + lead.state : ''}`,
    `Trade: ${lead.trade || 'unknown'}`,
    `Open count: ${openCount}`,
  ].join('\n')
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: ctx }],
    })
    const text = msg.content.find((c) => c.type === 'text')?.text || '{}'
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned) as { subject?: string; body?: string }
    if (!parsed.subject || !parsed.body) return null
    return { subject: parsed.subject.slice(0, 80), body: parsed.body.slice(0, 2000) }
  } catch (e) {
    console.warn(`[hot-opener] sonnet failed for ${lead.email}:`, (e as Error).message)
    return null
  }
}

async function sendViaInstantlyReply(_lead: Lead, _email: { subject: string; body: string }) {
  // For now: STAGE the email by saving body to outreach_leads.hand_raise_followup_body
  // and SMS Peter w/ a link so he can copy-paste send from his personal inbox.
  // Auto-send via Instantly /emails/reply requires the thread message_id — TBD.
  //
  // This pattern (stage + SMS Peter) is intentional for first 30 days: lets
  // Peter sanity-check each Sonnet email before it ships to a real prospect.
  // After 30 days of high-quality opener emails, switch to auto-send.
  return { staged: true }
}

async function smsHandRaiseAlert(lead: Lead, openCount: number) {
  const founderPhone = process.env.FOUNDER_ALERT_PHONE || '+17737109565'
  const fromNumber = process.env.TWILIO_PHONE_NUMBER!
  const sms =
    `🔥 HAND-RAISE\n\n` +
    `${lead.business_name || lead.email}\n` +
    `${openCount} opens. Email staged in admin.\n` +
    `${lead.email}\n` +
    `\nReview/send: bellavego.com/admin/hand-raises\n` +
    `Reply within 4h — 80% close rate window.`
  try {
    await twilioClient.messages.create({ body: sms, from: fromNumber, to: founderPhone })
  } catch (e) {
    console.warn('[hot-opener] sms failed:', (e as Error).message)
  }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  // 1. Find hand-raisers in Instantly
  const hotMap = await fetchHotInstantlyLeads()
  if (hotMap.size === 0) {
    return NextResponse.json({ ok: true, hot_count: 0, processed: 0, message: 'no hand-raisers right now' })
  }

  // 2. Look up the outreach_leads rows for those emails AND filter to never-followed-up
  const hotEmails = Array.from(hotMap.keys())
  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, owner_first_name, city, state, trade')
    .in('email', hotEmails)
    .is('hand_raise_followup_sent_at', null)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, hot_count: hotMap.size, processed: 0, message: 'all hot leads already followed up' })
  }

  // 3. For each: Sonnet-write 1-to-1 email, stage to supabase, SMS Peter
  let processed = 0
  for (const l of leads as Lead[]) {
    const signal = hotMap.get(l.email.toLowerCase())
    if (!signal) continue
    const email = await generateHandRaiseEmail(l, signal.opens)
    if (!email) continue
    await sendViaInstantlyReply(l, email)
    await supabase
      .from('outreach_leads')
      .update({
        hand_raise_followup_sent_at: new Date().toISOString(),
        hand_raise_open_count_at_send: signal.opens,
        hand_raise_followup_body: `Subject: ${email.subject}\n\n${email.body}\n\n[signal: ${signal.reason}, opens=${signal.opens}, clicks=${signal.clicks}]`,
      })
      .eq('id', l.id)
    await smsHandRaiseAlert(l, signal.opens)
    processed++
  }

  return NextResponse.json({
    ok: true,
    hot_count: hotMap.size,
    processed,
    threshold_opens: HAND_RAISE_THRESHOLD_OPENS,
    checked_at: new Date().toISOString(),
  })
}
