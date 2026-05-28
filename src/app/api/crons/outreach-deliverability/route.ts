import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

/**
 * Outreach deliverability monitor — daily 9am CT cron.
 *
 * Watches three signals from the last 24h:
 *   1. Bounce rate  — bounces / total_sent. > 5% = Gmail/ISP will flag the
 *      sending domain. We SMS Peter immediately and (future) auto-pause
 *      the Instantly campaign.
 *   2. Unsubscribe rate — > 1% means the copy/audience is wrong. Alert.
 *   3. Negative-reply rate — > 20% of replies marked spam/unsubscribe.
 *
 * Lifts numbers from outreach_replies + outreach_leads. Logs the run to
 * agent_runs regardless of outcome so we have a history.
 *
 * Auth: Vercel cron user-agent OR CRON_SECRET bearer for manual invoke.
 */

const BOUNCE_RATE_ALERT_THRESHOLD = 0.05      // 5%
const UNSUB_RATE_ALERT_THRESHOLD  = 0.01      // 1%
const NEG_REPLY_RATE_ALERT_THRESHOLD = 0.20   // 20%

function authedCron(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const auth = req.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const adminSecret = req.headers.get('x-admin-secret') ?? ''
  if (process.env.ADMIN_API_SECRET && adminSecret === process.env.ADMIN_API_SECRET) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!authedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // 1. Sent count in last 24h. Approx via outreach_leads.pushed_at (real
  // schema column — outreach_leads has no created_at). Real send count
  // ultimately comes from Instantly, but pushed_at is when we shipped the
  // lead, which is within minutes of the actual send.
  const { count: sentCount } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .gte('pushed_at', since)

  // 2. Reply breakdown by classification. outreach_replies uses received_at.
  const { data: replies } = await supabase
    .from('outreach_replies')
    .select('classification')
    .gte('received_at', since)

  const replyCounts = {
    total:        (replies ?? []).length,
    positive:     (replies ?? []).filter((r) => r.classification === 'positive').length,
    objection:    (replies ?? []).filter((r) => r.classification === 'objection').length,
    wrong_person: (replies ?? []).filter((r) => r.classification === 'wrong_person').length,
    unsubscribe:  (replies ?? []).filter((r) => r.classification === 'unsubscribe').length,
    auto_reply:   (replies ?? []).filter((r) => r.classification === 'auto_reply').length,
    spam:         (replies ?? []).filter((r) => r.classification === 'spam').length,
    bounce:       (replies ?? []).filter((r) => r.classification === 'bounce').length,
  }

  const sent = sentCount ?? 0
  const bounceRate = sent > 0 ? replyCounts.bounce / sent : 0
  const unsubRate  = sent > 0 ? replyCounts.unsubscribe / sent : 0
  const negReplyRate = replyCounts.total > 0
    ? (replyCounts.unsubscribe + replyCounts.spam) / replyCounts.total
    : 0

  const alerts: string[] = []
  if (bounceRate > BOUNCE_RATE_ALERT_THRESHOLD) {
    alerts.push(`🚨 Bounce rate ${(bounceRate * 100).toFixed(1)}% (${replyCounts.bounce}/${sent}) — Gmail will flag soon. PAUSE the campaign + warm a new inbox.`)
  }
  if (unsubRate > UNSUB_RATE_ALERT_THRESHOLD) {
    alerts.push(`⚠️ Unsubscribe rate ${(unsubRate * 100).toFixed(1)}% (${replyCounts.unsubscribe}/${sent}) — copy or audience is off.`)
  }
  if (replyCounts.total >= 10 && negReplyRate > NEG_REPLY_RATE_ALERT_THRESHOLD) {
    alerts.push(`⚠️ ${(negReplyRate * 100).toFixed(0)}% of replies are unsubscribe/spam (${replyCounts.unsubscribe + replyCounts.spam}/${replyCounts.total}) — review last batch.`)
  }

  if (alerts.length > 0) {
    try {
      await twilioClient.messages.create({
        body: `BellAveGo outreach health check — ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}\n\n` +
              alerts.join('\n\n') +
              `\n\nReplies last 24h: ${replyCounts.positive} positive, ${replyCounts.objection} objection, ${replyCounts.unsubscribe} unsub.`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: PETER_PHONE,
      })
    } catch (e) {
      console.error('deliverability SMS failed:', e)
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'outreach-deliverability',
    leads_searched: 0,
    leads_enriched: sent,
    leads_pushed: replyCounts.total,
    notes: JSON.stringify({
      windowHours: 24,
      sent,
      replyCounts,
      bounceRate,
      unsubRate,
      negReplyRate,
      alerts,
    }),
  })

  return NextResponse.json({
    ok: true,
    sent,
    replyCounts,
    bounceRate: Number(bounceRate.toFixed(4)),
    unsubRate:  Number(unsubRate.toFixed(4)),
    negReplyRate: Number(negReplyRate.toFixed(4)),
    alerts,
  })
}
