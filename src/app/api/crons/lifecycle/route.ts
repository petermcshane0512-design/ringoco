import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Daily lifecycle cron — two duties, both cheap so they share one job:
 *
 *  1. 24h verification nudge — active customers who paid >24h ago but have ZERO
 *     call_logs almost always have call-forwarding misconfigured at their carrier.
 *     SMS them a friendly nudge with a deep link to /dashboard/forwarding.
 *     Idempotent on profiles.verification_nudged_at.
 *
 *  2. call_state GC — voice route writes per-call conversation state. On hangup
 *     without a completed booking, the row sticks around. Sweep > 24h old.
 *
 * Stays under Vercel cron limits by bundling. Logs to agent_runs.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = { nudges_sent: 0, nudges_errors: 0, call_state_purged: 0 }

  // ── 1. 24h verification nudge ──────────────────────────────────
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Active customers paid >24h ago that we haven't nudged yet
  const { data: candidates } = await supabase
    .from('profiles')
    .select('user_id, business_name, owner_phone, owner_first_name, twilio_number, welcomed_at')
    .eq('is_active', true)
    .is('verification_nudged_at', null)
    .not('owner_phone', 'is', null)
    .not('twilio_number', 'is', null)
    .lt('welcomed_at', dayAgo)
    .limit(50)

  for (const p of candidates ?? []) {
    // Has the AI received any calls for this profile yet?
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', p.user_id)

    if ((count ?? 0) > 0) {
      // They have calls — mark nudged-at to skip in future runs
      await supabase
        .from('profiles')
        .update({ verification_nudged_at: new Date().toISOString() })
        .eq('user_id', p.user_id)
      continue
    }

    const firstName =
      (p as { owner_first_name?: string }).owner_first_name || guessFirstName(p.business_name)
    const body =
      `Hey ${firstName}, we noticed your BellAveGo AI hasn't received any calls yet — usually that means call forwarding isn't set up on your business cell. ` +
      `5-min walkthrough with screenshots: https://www.bellavego.com/dashboard/forwarding\n\nReply HELP if you'd like Peter to walk you through it.`

    try {
      await twilioClient.messages.create({
        body,
        from: p.twilio_number!,
        to: p.owner_phone!,
      })
      await supabase
        .from('profiles')
        .update({ verification_nudged_at: new Date().toISOString() })
        .eq('user_id', p.user_id)
      stats.nudges_sent++
    } catch (e) {
      console.error('verification nudge failed:', p.user_id, e)
      stats.nudges_errors++
    }
  }

  // ── 2. call_state cleanup ──────────────────────────────────────
  try {
    const { count } = await supabase
      .from('call_state')
      .delete({ count: 'exact' })
      .lt('updated_at', dayAgo)
    stats.call_state_purged = count ?? 0
  } catch (e) {
    console.error('call_state purge failed:', e)
  }

  await supabase.from('agent_runs').insert({
    agent: 'lifecycle',
    leads_pushed: stats.nudges_sent,
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, ...stats })
}

function guessFirstName(businessName: string | null | undefined): string {
  if (!businessName) return 'there'
  // strip common suffixes
  const cleaned = businessName.replace(/\b(LLC|Inc|Co|Company|Services?|HVAC|Plumbing|Heating|Cooling|Electric(al)?)\b/gi, '').trim()
  return cleaned.split(/\s+/)[0] || 'there'
}
