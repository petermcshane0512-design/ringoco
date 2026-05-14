import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { SUPPORT_FAQ, faqContextForPrompt, getEscalateOnlyTopics } from '@/lib/supportKnowledge'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const anthropic = new Anthropic()

/**
 * AI Customer Support Agent.
 *
 * Runs every 10 minutes. Picks up support tickets where:
 *   - status in ('new', 'triaged')
 *   - first_response_at is null  (Peter hasn't typed anything yet)
 *   - ai_attempted_at is null     (we haven't auto-attempted yet)
 *
 * Calls Claude with the question + customer profile + FAQ KB. Claude returns:
 *   { topic, reply, confidence (0-1), escalate_reason? }
 *
 * Auto-resolve conditions (ALL must hold):
 *   - confidence >= 0.85
 *   - escalate_reason is empty
 *   - topic is NOT in ESCALATE_ONLY set (cancel, refund, billing disputes)
 *
 * Otherwise we mark ai_attempted_at so we don't re-try, and Peter gets the
 * ticket as usual. The standard support-escalate SLA cron then nags him.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const escalateOnly = getEscalateOnlyTopics()
  const stats = { picked: 0, auto_resolved: 0, escalated: 0, errors: 0 }

  // Pull recent unprocessed tickets — small batch per run to spread token cost
  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, business_name, subject, body, ai_summary, priority, status, thread, created_at, first_response_at, ai_attempted_at')
    .in('status', ['new', 'triaged'])
    .is('first_response_at', null)
    .is('ai_attempted_at', null)
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type TicketRow = {
    id: string
    user_id: string
    business_name: string | null
    subject: string
    body: string
    ai_summary: string | null
    priority: string
    status: string
    thread: Array<{ from: string; body: string; at: string }> | null
  }

  for (const t of (tickets ?? []) as TicketRow[]) {
    stats.picked++

    // Pull the customer's profile + recent activity for context
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, business_name, owner_phone, plan_tier, twilio_number, is_active, welcomed_at, forwarding_confirmed_at, last_consulting_report_at')
      .eq('user_id', t.user_id)
      .maybeSingle()

    const { count: callCount } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', t.user_id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    const contextLine =
      `Customer profile:\n` +
      `  - Business: ${profile?.business_name || 'unknown'}\n` +
      `  - Plan: ${profile?.plan_tier || 'unknown'}\n` +
      `  - Active subscription: ${profile?.is_active ? 'yes' : 'no'}\n` +
      `  - BellAveGo number: ${profile?.twilio_number || 'NOT PROVISIONED'}\n` +
      `  - Forwarding confirmed: ${profile?.forwarding_confirmed_at ? 'yes' : 'no'}\n` +
      `  - Calls received last 30d: ${callCount ?? 0}\n` +
      `  - Welcome report sent: ${profile?.welcomed_at ? 'yes' : 'no'}\n`

    let aiResult: {
      topic: string
      reply: string
      confidence: number
      escalate_reason?: string
    } | null = null

    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system:
          `You are the AI customer-support agent for BellAveGo (an AI phone receptionist SaaS for home-service contractors). Your job: read a support ticket and either auto-resolve it (if the answer is in the FAQ and you're confident) or escalate to Peter (the founder).

You output STRICT JSON only — no prose, no markdown fences:
{
  "topic": "<one of the FAQ topic slugs OR 'other'>",
  "reply": "<your full SMS-ready reply text, ≤320 chars, friendly tone, ends with 'Reply HELP if this didn't answer it. — BellAveGo'>",
  "confidence": <0.0 to 1.0, how sure you are this fully resolves the ticket>,
  "escalate_reason": "<short reason to escalate, OR empty string if confidence >= 0.85>"
}

ESCALATE (return low confidence) if:
- The topic is tagged ESCALATE_ONLY in the FAQ (cancel, refund, billing dispute)
- The customer sounds frustrated or angry
- The question is technical and the FAQ doesn't cover it precisely
- The question references their specific data (their billing, their numbers, etc.) where you'd need DB access to answer
- You're not >85% sure your answer is right

KEEP CONFIDENCE HIGH when:
- The question is a clear match to an FAQ topic
- Your answer is generic enough to apply to any customer (not data-dependent)
- The customer's profile context doesn't change the answer

FAQ knowledge base:

${faqContextForPrompt()}`,
        messages: [
          {
            role: 'user',
            content:
              `${contextLine}\nTicket subject: ${t.subject}\nTicket body: ${t.body}\nAI summary: ${t.ai_summary || '(none)'}\n\nReturn JSON now.`,
          },
        ],
      })
      const text = r.content[0].type === 'text' ? r.content[0].text : '{}'
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      aiResult = JSON.parse(cleaned)
    } catch (e) {
      console.error('support-autorespond Claude call failed for', t.id, e)
      stats.errors++
      // Mark attempted so we don't loop
      try {
        await supabase.from('support_tickets').update({ ai_attempted_at: new Date().toISOString() }).eq('id', t.id)
      } catch {}
      continue
    }

    if (!aiResult) {
      stats.errors++
      continue
    }

    const isEscalateTopic = aiResult.topic && escalateOnly.has(aiResult.topic)
    const shouldAutoResolve =
      aiResult.confidence >= 0.85 &&
      !aiResult.escalate_reason &&
      !isEscalateTopic &&
      aiResult.reply &&
      aiResult.reply.length > 0

    if (shouldAutoResolve) {
      // 1. SMS the reply to the customer
      let smsSent = false
      if (profile?.owner_phone && profile?.twilio_number) {
        try {
          await twilioClient.messages.create({
            body: aiResult.reply,
            from: profile.twilio_number,
            to: profile.owner_phone,
          })
          smsSent = true
        } catch (e) {
          console.error('support-autorespond SMS send failed:', e)
        }
      }

      // 2. Append AI reply to ticket thread + mark resolved
      const newThread = [
        ...((t.thread as Array<{ from: string; body: string; at: string }>) ?? []),
        {
          from: 'ai_agent',
          body: aiResult.reply,
          at: new Date().toISOString(),
        },
      ]
      try {
        await supabase
          .from('support_tickets')
          .update({
            status: 'resolved',
            thread: newThread,
            ai_attempted_at: new Date().toISOString(),
            first_response_at: new Date().toISOString(),
            resolved_at: new Date().toISOString(),
            ai_confidence: aiResult.confidence,
            ai_topic: aiResult.topic,
            resolved_by: 'ai_agent',
          })
          .eq('id', t.id)
        if (smsSent) stats.auto_resolved++
      } catch (e) {
        console.error('support-autorespond ticket update failed:', e)
        stats.errors++
      }
    } else {
      // Mark attempted so we don't try again; leave for Peter
      try {
        await supabase
          .from('support_tickets')
          .update({
            ai_attempted_at: new Date().toISOString(),
            ai_confidence: aiResult.confidence,
            ai_topic: aiResult.topic,
            ai_escalate_reason: aiResult.escalate_reason || (isEscalateTopic ? 'escalate_only_topic' : 'low_confidence'),
          })
          .eq('id', t.id)
        stats.escalated++
      } catch (e) {
        console.error('support-autorespond escalate update failed:', e)
        stats.errors++
      }
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'support-autorespond',
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, ...stats, faq_size: SUPPORT_FAQ.length })
}
