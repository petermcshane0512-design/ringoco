import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const anthropic = new Anthropic()

const VALID_CATEGORIES = new Set(['billing', 'bug', 'feature_request', 'general'])

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { subject?: string; body?: string; category?: string }
  if (!body.subject || !body.body) {
    return NextResponse.json({ error: 'subject + body required' }, { status: 400 })
  }
  if (body.subject.length > 200 || body.body.length > 8000) {
    return NextResponse.json({ error: 'subject must be <200 chars; body <8000' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, owner_phone, plan_tier')
    .eq('user_id', userId)
    .maybeSingle()

  // Auto-classify + summarize via Claude Haiku (cheap, ~$0.001 per ticket)
  type Priority = 'low' | 'normal' | 'high' | 'urgent'
  let category = body.category && VALID_CATEGORIES.has(body.category) ? body.category : 'general'
  let aiSummary = ''
  let priority: Priority = 'normal'
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `Classify a customer support ticket from a home-services contractor. Output STRICT JSON only:
{"category":"billing|bug|feature_request|general","priority":"low|normal|high|urgent","summary":"one short sentence"}

Priority rules:
- urgent: AI receptionist down / billing failure blocking service / lost customer data
- high: bug breaking a paid feature / suspected security issue
- normal: general questions, minor bugs, feature requests
- low: cosmetic, "how do I..." that's in docs`,
      messages: [{ role: 'user', content: `Subject: ${body.subject}\nBody: ${body.body}` }],
    })
    const text = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { category?: string; priority?: string; summary?: string }
    if (parsed.category && VALID_CATEGORIES.has(parsed.category)) category = parsed.category
    if (parsed.priority && ['low', 'normal', 'high', 'urgent'].includes(parsed.priority)) {
      priority = parsed.priority as Priority
    }
    aiSummary = parsed.summary ?? ''
  } catch (e) {
    console.error('[support] AI classify failed:', e)
  }

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      business_name: profile?.business_name,
      subject: body.subject,
      body: body.body,
      category,
      priority,
      ai_summary: aiSummary,
      thread: [{ from: 'customer', body: body.body, at: new Date().toISOString() }],
    })
    .select()
    .single()

  if (error || !ticket) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })

  // Auto-ack the customer so they know it landed. Concierge gets the 4-hr SLA
  // promise; everyone else gets "next business day" since that matches policy.
  let customerAcked = false
  if (profile?.owner_phone) {
    try {
      const slaCopy =
        profile.plan_tier === 'concierge' ? 'within 4 hours'
        : priority === 'urgent' ? 'within 4 hours'
        : 'within 1 business day'
      await twilioClient.messages.create({
        body: `BellAveGo: got your support request ("${body.subject.slice(0, 60)}${body.subject.length > 60 ? '…' : ''}"). Our team will respond ${slaCopy}. — BellAveGo Support`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: profile.owner_phone,
      })
      customerAcked = true
      await supabase
        .from('support_tickets')
        .update({ customer_acked_at: new Date().toISOString() })
        .eq('id', ticket.id)
    } catch (e) {
      console.error('[support] customer auto-ack failed:', e)
    }
  }

  // SMS Peter on every new ticket (urgent/high get more punch)
  try {
    const punch = priority === 'urgent' ? '🚨 URGENT' : priority === 'high' ? '⚠️ HIGH' : '🎫'
    const businessTag = profile?.business_name ? ` — ${profile.business_name}` : ''
    const tierTag = profile?.plan_tier ? ` (${profile.plan_tier})` : ''
    const ackTag = customerAcked ? '\nCustomer auto-ack sent.' : ''
    await twilioClient.messages.create({
      body: `${punch} New support ticket${businessTag}${tierTag}\n\nSubject: ${body.subject}\n${aiSummary ? `\nAI: ${aiSummary}\n` : ''}${ackTag}\nView: https://www.bellavego.com/admin/support/${ticket.id}`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
    })
  } catch (e) {
    console.error('[support] Peter SMS failed:', e)
  }

  return NextResponse.json({ ok: true, ticket })
}
