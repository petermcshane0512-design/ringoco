import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Support escalation cron — runs hourly.
 *
 * Looks for unresolved tickets that have aged past their SLA and re-pings Peter
 * once per ticket (escalated_at flag prevents nag spam). SLA tiers:
 *   - urgent: 4 hours
 *   - high:   8 hours
 *   - normal: 24 hours
 *   - low:    72 hours
 *
 * Uses first_response_at if set (Peter has at least replied), otherwise
 * created_at. So tickets where Peter typed nothing get escalated, ones where
 * he started a thread are left alone.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const SLA_HOURS: Record<string, number> = {
    urgent: 4,
    high: 8,
    normal: 24,
    low: 72,
  }

  const stats = { escalated: 0, errors: 0 }

  for (const [priority, hours] of Object.entries(SLA_HOURS)) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('id, user_id, business_name, subject, ai_summary, priority, created_at, first_response_at, plan_tier:business_name')
      .eq('priority', priority)
      .in('status', ['new', 'triaged', 'in_progress'])
      .is('escalated_at', null)
      .lt('created_at', cutoff)
      .limit(20)

    for (const t of tickets ?? []) {
      // If Peter has already responded, skip — that's the SLA met.
      if (t.first_response_at) continue

      try {
        await twilioClient.messages.create({
          body:
            `⏰ ESCALATION — ${priority.toUpperCase()} ticket past ${hours}h SLA\n\n` +
            `${t.business_name || 'Unknown'} — "${t.subject}"\n` +
            (t.ai_summary ? `AI: ${t.ai_summary}\n` : '') +
            `\nNo response yet. Open: https://www.bellavego.com/admin/support/${t.id}`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
        })

        await supabase
          .from('support_tickets')
          .update({ escalated_at: new Date().toISOString() })
          .eq('id', t.id)

        stats.escalated++
      } catch (e) {
        console.error('escalation SMS failed:', t.id, e)
        stats.errors++
      }
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'support-escalate',
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, ...stats })
}
