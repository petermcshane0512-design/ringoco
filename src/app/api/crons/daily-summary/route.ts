import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

/**
 * Daily founder summary SMS — fires once a day at 02:00 UTC (= 9pm Central).
 *
 *   Cold-email funnel (last 24h)
 *   Hot reply drafts (sent / killed / pending)
 *   New signups (trials starting today)
 *   Trials ending in next 48h (action required if hot)
 *   MRR snapshot (active + trialing)
 *   Health alarms (bounce/unsub thresholds)
 *
 * One SMS. Forces signal density. If anything looks off, Peter pulls
 * /dashboard or a script.
 *
 * Auth: vercel-cron user-agent or x-admin-secret header.
 */

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

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const dayAgoISO = dayAgo.toISOString()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // ── 1. Cold-email funnel ──────────────────────────────────
  const { count: sentCount } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .gte('pushed_at', dayAgoISO)

  const { count: pushFailedCount } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'push_failed')
    .gte('pushed_at', dayAgoISO)

  const { data: replyRows } = await supabase
    .from('outreach_replies')
    .select('classification')
    .gte('received_at', dayAgoISO)

  const replies = {
    total: (replyRows ?? []).length,
    positive: 0,
    objection: 0,
    unsubscribe: 0,
    bounce: 0,
  }
  for (const r of replyRows ?? []) {
    if (r.classification === 'positive') replies.positive++
    else if (r.classification === 'objection') replies.objection++
    else if (r.classification === 'unsubscribe') replies.unsubscribe++
    else if (r.classification === 'bounce') replies.bounce++
  }

  // ── 2. Hot-reply drafts ───────────────────────────────────
  const { data: draftRows } = await supabase
    .from('outreach_pending_drafts')
    .select('status')
    .gte('created_at', dayAgoISO)

  const drafts = {
    sent: 0,
    killed: 0,
    pending: 0,
    failed: 0,
    expired: 0,
  }
  for (const d of draftRows ?? []) {
    if (d.status === 'sent') drafts.sent++
    else if (d.status === 'killed') drafts.killed++
    else if (d.status === 'pending') drafts.pending++
    else if (d.status === 'failed') drafts.failed++
    else if (d.status === 'expired') drafts.expired++
  }

  // ── 3. New signups today (profiles created in last 24h with stripe subscription) ──
  const { count: newSignups } = await supabase
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .gte('created_at', dayAgoISO)
    .not('stripe_subscription_id', 'is', null)

  // ── 4. Trials ending in next 48h + MRR ────────────────────
  const trialingSubs = await listAllSubs({ status: 'trialing' })
  const activeSubs = await listAllSubs({ status: 'active' })

  const trialsEndingSoon = trialingSubs.filter((s) => {
    if (!s.trial_end) return false
    const end = new Date(s.trial_end * 1000)
    return end > now && end <= in48h
  })

  const mrrCents = [...trialingSubs, ...activeSubs].reduce((sum, s) => {
    const item = s.items.data[0]
    if (!item) return sum
    const unit = item.price.unit_amount ?? 0
    const interval = item.price.recurring?.interval
    const monthly = interval === 'year' ? unit / 12 : unit
    return sum + monthly
  }, 0)
  const mrr = mrrCents / 100

  // ── 5. Health alarms ──────────────────────────────────────
  const sent = sentCount ?? 0
  const bounceRate = sent > 0 ? replies.bounce / sent : 0
  const unsubRate = sent > 0 ? replies.unsubscribe / sent : 0
  const alarms: string[] = []
  if (bounceRate > 0.05) alarms.push(`bounce ${(bounceRate * 100).toFixed(1)}%`)
  if (unsubRate > 0.01) alarms.push(`unsub ${(unsubRate * 100).toFixed(1)}%`)
  if (pushFailedCount && pushFailedCount > 0) alarms.push(`${pushFailedCount} push_failed`)

  // ── 6. Compose SMS ────────────────────────────────────────
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  })

  const lines: string[] = [
    `BellAveGo daily — ${dateLabel}`,
    '',
    `Cold email (24h):`,
    `  ${sent} sent · ${replies.total} replies (${replies.positive}🔥 ${replies.objection}? ${replies.unsubscribe}stop ${replies.bounce}bounce)`,
    '',
    `Hot drafts:`,
    `  ${drafts.sent} shipped · ${drafts.pending} pending · ${drafts.killed} killed${drafts.failed ? ` · ${drafts.failed} FAILED` : ''}`,
    '',
    `Signups: ${newSignups ?? 0} new today`,
    `Trials:  ${trialingSubs.length} active · ${trialsEndingSoon.length} end <48h`,
    `MRR:     $${mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo (${activeSubs.length} paying + ${trialingSubs.length} trial)`,
  ]
  if (alarms.length > 0) {
    lines.push('', `⚠️ ${alarms.join(' · ')}`)
  }
  if (trialsEndingSoon.length > 0) {
    lines.push('', 'Trials ending <48h:')
    for (const s of trialsEndingSoon.slice(0, 5)) {
      const end = new Date(s.trial_end! * 1000).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'America/Chicago',
      })
      lines.push(`  ${s.customer as string} → ${end}`)
    }
  }
  const messageBody = lines.join('\n')

  try {
    await twilioClient.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: PETER_PHONE,
    })
  } catch (e) {
    console.error('[daily-summary] SMS failed:', e)
  }

  // Log to agent_runs for history
  await supabase.from('agent_runs').insert({
    agent: 'daily-summary',
    leads_searched: 0,
    leads_enriched: sent,
    leads_pushed: replies.total,
    notes: JSON.stringify({
      sent,
      replies,
      drafts,
      newSignups: newSignups ?? 0,
      trialingCount: trialingSubs.length,
      activeCount: activeSubs.length,
      mrr,
      trialsEndingSoon: trialsEndingSoon.length,
      bounceRate,
      unsubRate,
      alarms,
    }),
  })

  return NextResponse.json({
    ok: true,
    sent,
    replies,
    drafts,
    newSignups: newSignups ?? 0,
    trialingCount: trialingSubs.length,
    activeCount: activeSubs.length,
    mrr,
    alarms,
    smsBody: messageBody,
  })
}

async function listAllSubs(opts: { status: Stripe.Subscription.Status }): Promise<Stripe.Subscription[]> {
  const subs: Stripe.Subscription[] = []
  let starting_after: string | undefined
  do {
    const page = await stripe.subscriptions.list({
      status: opts.status,
      limit: 100,
      starting_after,
    })
    subs.push(...page.data)
    starting_after = page.has_more ? page.data[page.data.length - 1]?.id : undefined
  } while (starting_after)
  return subs
}
