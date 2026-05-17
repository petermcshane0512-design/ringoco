import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)
const anthropic = new Anthropic()

/**
 * Inbound SMS handler — three audiences:
 *
 *  1. Contractor (from = profile.owner_phone) replying YES/NO to a job approval.
 *     Same logic as before: confirm/decline the most recent pending_approval job.
 *
 *  2. Anyone replying STOP/UNSUBSCRIBE/CANCEL/QUIT/END (TCPA compliance).
 *     Adds them to sms_optouts and Twilio handles the auto-ack. We just persist
 *     so we never re-message them, even from a different campaign.
 *
 *  3. End-customer (anyone else) replying to our outbound SMS — Quote Hunter
 *     follow-up, Collections chase, review request, AI-receptionist confirmation.
 *     We auto-ack with a friendly "we'll have someone reach out" and create a
 *     support ticket so the contractor / Peter sees it. No more silence.
 */

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END', 'OPTOUT'])
const HELP_KEYWORDS = new Set(['HELP', 'INFO', 'SUPPORT'])

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = value as string })

  // Validate request is genuinely from Twilio
  const twilioSignature = req.headers.get('x-twilio-signature') || ''
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host') || ''
  const url = `${proto}://${host}/api/twilio/sms`
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    twilioSignature,
    url,
    params
  )
  if (!isValid) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const rawBody = (params['Body'] || '').trim()
  const body = rawBody.toUpperCase()
  const from = params['From']
  const to = params['To'] // contractor's Twilio number that received the SMS

  // Look up contractor by the Twilio number that received the message
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('twilio_number', to)
    .maybeSingle()

  if (!profile) return emptyXml()

  // ── 1. STOP keywords — TCPA compliance, persist opt-out ──────────
  if (STOP_KEYWORDS.has(body)) {
    try {
      await supabase.from('sms_optouts').upsert(
        { phone: from, opted_out_at: new Date().toISOString(), reason: body },
        { onConflict: 'phone' }
      )
    } catch (e) {
      console.error('sms_optouts upsert failed:', e)
    }
    // Twilio auto-sends "You have successfully been unsubscribed…" for STOP.
    // We just confirm receipt and don't double-send.
    return emptyXml()
  }

  // ── 2. HELP — branch by who's asking ─────────────────────────────
  if (HELP_KEYWORDS.has(body)) {
    if (from === profile.owner_phone) {
      // Contractor is asking for onboarding help → conversational Claude
      return handleOwnerHelp({ from, to, profile })
    }
    // End-customer asking how to reach the business → static reply
    const businessName = profile.business_name || 'this business'
    const ownerPhone = profile.owner_phone || ''
    try {
      await twilioClient.messages.create({
        body: `${businessName} via BellAveGo: text us your name + what you need and we'll get back to you. ${ownerPhone ? `Or call ${ownerPhone} directly. ` : ''}Reply STOP to unsubscribe.`,
        from: to,
        to: from,
      })
    } catch (e) {
      console.error('HELP auto-reply failed:', e)
    }
    return emptyXml()
  }

  // ── 3a. Owner replying with a $ amount or 'skip' to a revenue ask ─
  if (from === profile.owner_phone) {
    const revenueIntent = classifyRevenueReply(rawBody)
    if (revenueIntent) {
      return handleOwnerRevenueReply({ intent: revenueIntent, to, profile })
    }
  }

  // ── 3b. Owner replying YES/NO to job approval ─────────────────────
  if (from === profile.owner_phone) {
    return handleOwnerReply({ body, from, to, profile })
  }

  // ── 4. End-customer replying to our outbound SMS ─────────────────
  // No more silence. Auto-ack the customer + open a support ticket so the
  // contractor (and Peter as backup) can pick it up.
  return handleEndCustomerReply({ body: rawBody, from, to, profile })
}

type Profile = {
  user_id: string
  business_name?: string
  owner_phone?: string
  owner_first_name?: string
  forwarding_carrier?: string
  forwarding_confirmed_at?: string | null
  plan_tier?: string
  twilio_number?: string
}

/**
 * Contractor texted HELP from their owner_phone → onboarding coach Claude.
 * Pulls forwarding state + recent calls + carrier and writes a tailored
 * walkthrough SMS. Used to be a static reply; now adapts to where they're
 * stuck.
 */
async function handleOwnerHelp(args: { from: string; to: string; profile: Profile }) {
  const { from, to, profile } = args

  // Pull forwarding state + recent activity
  const { count: callCount } = await supabase
    .from('call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.user_id)

  const carrier = profile.forwarding_carrier || 'unknown'
  const carrierTipMap: Record<string, string> = {
    verizon: 'Verizon: dial *71 + your BellAveGo number from your business cell.',
    att: 'AT&T: dial **61* + your BellAveGo number + *11*15# from your business cell.',
    tmobile: 'T-Mobile: dial **61* + your BellAveGo number + *11*15# from your business cell.',
    sprint: 'US Cellular/Cricket/Boost: dial *73 + your BellAveGo number.',
    unknown: 'Open your phone\'s settings → Phone → Call Forwarding (or use the dial code on the page below).',
  }
  const carrierTip = carrierTipMap[carrier] || carrierTipMap.unknown

  const firstName = profile.owner_first_name || 'there'
  const businessName = profile.business_name || 'your business'
  const bagNumber = profile.twilio_number || 'your BellAveGo number'
  const hasCalls = (callCount ?? 0) > 0
  const forwardingConfirmed = !!profile.forwarding_confirmed_at

  let reply: string

  if (hasCalls) {
    // Already getting calls → they're asking for a different kind of help
    reply =
      `Hey ${firstName} — you've gotten ${callCount} call${callCount === 1 ? '' : 's'}. ` +
      `If you want to tweak the AI's voice, tone, or instructions: https://www.bellavego.com/dashboard/settings. ` +
      `If something specific isn't working, reply with what's broken and we'll fix it. — BellAveGo team`
  } else if (!forwardingConfirmed) {
    // Most common case: forwarding not set up
    reply =
      `Hey ${firstName}! Looks like ${businessName}'s calls aren't forwarding yet — that's why the AI hasn't answered any. ` +
      `${carrierTip} Your BellAveGo number is ${bagNumber}. ` +
      `Full walkthrough with one-tap buttons: https://www.bellavego.com/dashboard/forwarding. ` +
      `Reply STUCK if it's not working and we'll jump on a call. — BellAveGo team`
  } else {
    // Forwarding confirmed but still no calls — different problem
    reply =
      `Hey ${firstName} — forwarding's set up but no calls have come through yet. ` +
      `Quick test: call ${bagNumber} from a different phone. The AI should answer in ${businessName}'s name. ` +
      `If it doesn't, reply BROKEN and we'll dig in immediately. — BellAveGo team`
  }

  try {
    await twilioClient.messages.create({
      body: reply,
      from: to,
      to: from,
    })
  } catch (e) {
    console.error('owner HELP reply failed:', e)
  }

  return emptyXml()
}

// ── Revenue reply parser ────────────────────────────────────────
// Classify a contractor's SMS reply to a revenue ask.
// Returns null if it's not a revenue reply (lets the normal YES/NO logic run).
type RevenueIntent =
  | { kind: 'amount'; amount: number }
  | { kind: 'skip' }
  | { kind: 'disable' }
  | { kind: 'enable' }

function classifyRevenueReply(raw: string): RevenueIntent | null {
  const txt = raw.trim()
  if (!txt) return null

  // "START REVENUE" / "enable revenue" / "yes revenue" — re-enable asks
  if (/^(start|enable|yes)\s+revenue$/i.test(txt) || /^revenue\s+(start|on)$/i.test(txt)) {
    return { kind: 'enable' }
  }

  // "STOP REVENUE" / "stop revenue" / "no revenue" — disable all future asks
  if (/^(stop|disable|no)\s+revenue$/i.test(txt) || /^revenue\s+stop$/i.test(txt)) {
    return { kind: 'disable' }
  }

  // Bare "skip" or "skip revenue" — mark most-recent ask skipped
  if (/^skip(\s+revenue)?$/i.test(txt)) {
    return { kind: 'skip' }
  }

  // Dollar amount — accepts: "520", "$520", "$520.50", "520.50", "520 for smith"
  // Reject obvious non-amounts (phone numbers, dates, etc) — must be ≤6 digits before decimal.
  const m = txt.match(/^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?(?:\s+.*)?$/)
  if (m) {
    const dollars = parseInt(m[1], 10)
    const cents = m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0
    const amount = dollars + cents / 100
    // Sanity: $1 to $999,999. Lower bound rejects accidental "0" or "1" replies.
    if (amount >= 1 && amount < 1_000_000) return { kind: 'amount', amount }
  }

  return null
}

async function handleOwnerRevenueReply(args: {
  intent: RevenueIntent
  to: string
  profile: Profile
}) {
  const { intent, to, profile } = args
  const ownerPhone = profile.owner_phone!

  // STOP REVENUE — disable all future asks
  if (intent.kind === 'disable') {
    try {
      await supabase
        .from('profiles')
        .update({ revenue_asks_disabled: true })
        .eq('user_id', profile.user_id)
      await twilioClient.messages.create({
        body: `Got it — we won't ask about revenue again. Your consulting reports will use trade-average estimates instead. Reply START REVENUE anytime to turn back on.`,
        from: to,
        to: ownerPhone,
      })
    } catch (e) {
      console.error('revenue disable failed:', e)
    }
    return emptyXml()
  }

  // START REVENUE — re-enable
  if (intent.kind === 'enable') {
    try {
      await supabase
        .from('profiles')
        .update({ revenue_asks_disabled: false })
        .eq('user_id', profile.user_id)
      await twilioClient.messages.create({
        body: `Back on — we'll text once per booked job (max 1/day) so your consulting reports show real revenue. Reply STOP REVENUE anytime to pause.`,
        from: to,
        to: ownerPhone,
      })
    } catch (e) {
      console.error('revenue enable failed:', e)
    }
    return emptyXml()
  }

  // For both 'amount' and 'skip', we need the most-recent asked-but-unanswered job.
  const { data: pendingJob } = await supabase
    .from('jobs')
    .select('id, customer_name, job_type')
    .eq('user_id', profile.user_id)
    .eq('revenue_skipped', false)
    .is('amount', null)
    .not('revenue_asked_at', 'is', null)
    .order('revenue_asked_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 'skip' — mark the most-recent ask as skipped
  if (intent.kind === 'skip') {
    if (!pendingJob) {
      try {
        await twilioClient.messages.create({
          body: `No pending revenue ask to skip — you're all caught up.`,
          from: to,
          to: ownerPhone,
        })
      } catch { /* non-fatal */ }
      return emptyXml()
    }
    try {
      await supabase
        .from('jobs')
        .update({ revenue_skipped: true, revenue_source: 'estimated' })
        .eq('id', pendingJob.id)
      const jobLabel = describeJobShort(pendingJob.customer_name, pendingJob.job_type)
      await twilioClient.messages.create({
        body: `No problem — we'll use a trade-average estimate for the ${jobLabel}. Reply STOP REVENUE to turn these prompts off entirely.`,
        from: to,
        to: ownerPhone,
      })
    } catch (e) {
      console.error('revenue skip failed:', e)
    }
    return emptyXml()
  }

  // 'amount' — save the real number to the most-recent asked job
  if (intent.kind === 'amount') {
    if (!pendingJob) {
      // No outstanding ask — they sent a number cold. Could be a confusion.
      // Don't blindly save to "most recent job ever" — too risky. Just acknowledge.
      try {
        await twilioClient.messages.create({
          body: `Got the number ($${intent.amount.toLocaleString()}) but I'm not sure which job it's for — we don't have any outstanding revenue prompts. If this was for a recent job, just enter it from your dashboard: https://www.bellavego.com/dashboard/jobs`,
          from: to,
          to: ownerPhone,
        })
      } catch { /* non-fatal */ }
      return emptyXml()
    }
    try {
      await supabase
        .from('jobs')
        .update({
          amount: intent.amount,
          revenue_source: 'reported',
        })
        .eq('id', pendingJob.id)
      const jobLabel = describeJobShort(pendingJob.customer_name, pendingJob.job_type)
      await twilioClient.messages.create({
        body: `Got it — $${intent.amount.toLocaleString()} logged for the ${jobLabel}. Thanks, this feeds straight into your next consulting report.`,
        from: to,
        to: ownerPhone,
      })
    } catch (e) {
      console.error('revenue save failed:', e)
    }
    return emptyXml()
  }

  return emptyXml()
}

function describeJobShort(customerName: string | null | undefined, jobType: string | null | undefined): string {
  const name = (customerName || '').split(/\s+/)[0]
  const type = (jobType || '').trim()
  if (name && type) return `${name} ${type}`
  if (name) return `${name} job`
  if (type) return type
  return 'job'
}

async function handleOwnerReply(args: { body: string; from: string; to: string; profile: Profile }) {
  const { body, to, profile } = args

  // Get most recent pending job for THIS contractor only
  const { data: job } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending_approval')
    .eq('user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!job) {
    await twilioClient.messages.create({
      body: 'No pending job requests found.',
      from: to,
      to: profile.owner_phone!,
    })
    return emptyXml()
  }

  const businessName = profile.business_name || 'BellAveGo'

  if (body === 'YES') {
    await supabase.from('jobs').update({ status: 'scheduled' }).eq('id', job.id)
    // Resolve the corresponding quote_followup so Quote Hunter doesn't chase a booked job.
    try {
      await supabase
        .from('quote_followups')
        .update({ status: 'won', updated_at: new Date().toISOString() })
        .eq('user_id', profile.user_id)
        .eq('customer_phone', job.customer_phone)
        .eq('status', 'pending')
    } catch (e) {
      console.error('quote_followups resolve-on-YES failed:', e)
    }

    await twilioClient.messages.create({
      body: `Hi ${job.customer_name}! Your appointment for ${job.job_type} at ${job.address} on ${job.scheduled_time} is confirmed. We look forward to seeing you. - ${businessName}`,
      from: to,
      to: job.customer_phone,
    })

    await twilioClient.messages.create({
      body: `Confirmed! ${job.customer_name} has been texted their confirmation.`,
      from: to,
      to: profile.owner_phone!,
    })
  } else if (body === 'NO') {
    await supabase.from('jobs').update({ status: 'cancelled' }).eq('id', job.id)
    try {
      await supabase
        .from('quote_followups')
        .update({ status: 'lost', updated_at: new Date().toISOString() })
        .eq('user_id', profile.user_id)
        .eq('customer_phone', job.customer_phone)
        .eq('status', 'pending')
    } catch (e) {
      console.error('quote_followups resolve-on-NO failed:', e)
    }

    await twilioClient.messages.create({
      body: `Hi ${job.customer_name}, unfortunately we're not available at ${job.scheduled_time}. Please call us back to find a better time. - ${businessName}`,
      from: to,
      to: job.customer_phone,
    })

    await twilioClient.messages.create({
      body: `Declined. ${job.customer_name} has been notified to call back and reschedule.`,
      from: to,
      to: profile.owner_phone!,
    })
  }

  return emptyXml()
}

async function handleEndCustomerReply(args: { body: string; from: string; to: string; profile: Profile }) {
  const { body, from, to, profile } = args

  // Suppress if they previously opted out — defensive (Twilio also blocks).
  const { data: optout } = await supabase
    .from('sms_optouts')
    .select('phone')
    .eq('phone', from)
    .maybeSingle()
  if (optout) return emptyXml()

  // Cheap intent classification — pay / book-related / question / other.
  // Keeps the contractor in the loop only when needed; for trivial replies we
  // just thank the customer and move on.
  type Intent = 'wants_to_pay' | 'wants_to_book' | 'question' | 'thanks_or_ack'
  let intent: Intent = 'question'
  let summary = body.length > 200 ? body.slice(0, 197) + '…' : body
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: `Classify a customer SMS reply to a home-service business. Output STRICT JSON:
{"intent":"wants_to_pay|wants_to_book|question|thanks_or_ack","summary":"<10 words summarizing intent"}

Examples:
- "yes pay link please" -> wants_to_pay
- "can you come tuesday" -> wants_to_book
- "how much for water heater" -> question
- "thanks" / "got it" / "ok" -> thanks_or_ack`,
      messages: [{ role: 'user', content: body }],
    })
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { intent?: Intent; summary?: string }
    if (parsed.intent && ['wants_to_pay', 'wants_to_book', 'question', 'thanks_or_ack'].includes(parsed.intent)) {
      intent = parsed.intent
    }
    if (parsed.summary) summary = parsed.summary
  } catch (e) {
    console.error('inbound classify failed:', e)
  }

  const businessName = profile.business_name || 'us'

  // Don't bother the contractor for "thanks" — just close it out.
  if (intent === 'thanks_or_ack') return emptyXml()

  // Auto-ack the customer so they know they were heard.
  try {
    await twilioClient.messages.create({
      body: `Got it — thanks for the message. Someone from ${businessName} will get back to you shortly. (BellAveGo · reply STOP to unsubscribe)`,
      from: to,
      to: from,
    })
  } catch (e) {
    console.error('end-customer auto-ack failed:', e)
  }

  // Forward to contractor with intent context
  const intentTag =
    intent === 'wants_to_pay' ? '💰 wants to pay' :
    intent === 'wants_to_book' ? '📅 wants to book' :
    '❓ question'

  if (profile.owner_phone) {
    try {
      await twilioClient.messages.create({
        body:
          `📨 Customer replied (${intentTag})\n\n` +
          `From: ${from}\n` +
          `Said: "${body.length > 160 ? body.slice(0, 157) + '…' : body}"\n\n` +
          `Reply directly from your phone — we'll relay it through your BellAveGo line.`,
        from: to,
        to: profile.owner_phone,
      })
    } catch (e) {
      console.error('contractor forward failed:', e)
    }
  }

  // Persist as a support ticket so it shows up in /admin/support and doesn't
  // get lost if the contractor ignores their phone.
  try {
    await supabase.from('support_tickets').insert({
      user_id: profile.user_id,
      business_name: profile.business_name,
      subject: `Customer SMS reply (${intentTag}) — ${from}`,
      body,
      category: 'general',
      status: 'new',
      priority: intent === 'wants_to_pay' ? 'high' : 'normal',
      ai_summary: summary,
      thread: [{ from: 'customer', body, at: new Date().toISOString() }],
    })
  } catch (e) {
    console.error('inbound -> support_ticket failed:', e)
  }

  return emptyXml()
}

function emptyXml() {
  return new NextResponse('<?xml version="1.0"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
