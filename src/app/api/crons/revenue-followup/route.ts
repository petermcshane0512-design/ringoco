import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Revenue Capture Agent — daily cron.
 *
 * The single most important consulting-report fueler. AI receptionist creates
 * jobs but never sees the $ amount — that lives in the contractor's head.
 * This cron texts each contractor once per eligible job: "what did the X job
 * come to? Reply with $ amount or 'skip'."
 *
 * Eligibility:
 *   - jobs.amount IS NULL (no number yet)
 *   - jobs.revenue_skipped = false (they didn't already say no)
 *   - jobs.revenue_asked_at IS NULL (we haven't asked yet — one shot per job)
 *   - jobs.status NOT IN ('cancelled', 'declined') (only viable jobs)
 *   - jobs.created_at between 5 and 30 days ago (give the work time to happen)
 *   - profile.revenue_asks_disabled = false (contractor opted out)
 *   - profile.is_active = true
 *
 * Rate limiting: ONE ask per contractor per run. The cron picks the OLDEST
 * eligible job per contractor so reminders flow in order of recency.
 *
 * Inbound replies are handled by /api/twilio/sms (handleOwnerRevenueReply).
 *
 * Cost: ~1 SMS × $0.008 per booked job per active contractor. For a 100-job
 * customer paying $797/mo that's $0.80/mo — rounding error vs the revenue
 * intel it unlocks.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = { eligible_users: 0, sent: 0, errors: 0, skipped_opted_out: 0, skipped_no_phone: 0 }

  const minAgoIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  const maxAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Pull eligible jobs (oldest first so we ask about them in order).
  const { data: candidates, error } = await supabase
    .from('jobs')
    .select('id, user_id, customer_name, job_type, scheduled_time, created_at')
    .is('amount', null)
    .eq('revenue_skipped', false)
    .is('revenue_asked_at', null)
    .not('status', 'in', '(cancelled,declined)')
    .lt('created_at', minAgoIso)
    .gt('created_at', maxAgoIso)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // One ask per contractor per run — pick oldest job per user_id.
  const seenUsers = new Set<string>()
  const eligibleJobs: Array<{
    id: string; user_id: string; customer_name: string | null;
    job_type: string | null; scheduled_time: string | null; created_at: string;
  }> = []
  for (const job of candidates ?? []) {
    if (seenUsers.has(job.user_id)) continue
    seenUsers.add(job.user_id)
    eligibleJobs.push(job)
  }
  stats.eligible_users = eligibleJobs.length

  for (const job of eligibleJobs) {
    // Look up contractor profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, owner_first_name, owner_phone, twilio_number, is_active, revenue_asks_disabled')
      .eq('user_id', job.user_id)
      .maybeSingle()

    if (!profile || !profile.is_active) continue
    if (profile.revenue_asks_disabled) {
      stats.skipped_opted_out++
      continue
    }
    if (!profile.owner_phone || !profile.twilio_number) {
      stats.skipped_no_phone++
      continue
    }

    const firstName = profile.owner_first_name || guessFirstName(profile.business_name)
    const jobLabel = describeJob(job.customer_name, job.job_type)

    // Wording — chosen for: (1) ties to consulting report value, (2) one-tap
    // reply with bare number, (3) easy escape hatch with 'skip'.
    const body =
      `Hey ${firstName} — quick one for your BellAveGo consulting report: ` +
      `what did the ${jobLabel} come to? ` +
      `Reply with $ amount (e.g. "520") or "skip". Reply STOP REVENUE to turn these off.`

    try {
      await twilioClient.messages.create({
        body,
        from: profile.twilio_number,
        to: profile.owner_phone,
      })
      await supabase
        .from('jobs')
        .update({ revenue_asked_at: new Date().toISOString() })
        .eq('id', job.id)
      stats.sent++
    } catch (e) {
      console.error('revenue-followup SMS failed for job', job.id, e)
      stats.errors++
    }
  }

  // Log the run
  try {
    await supabase.from('agent_runs').insert({
      agent: 'revenue-followup',
      leads_pushed: stats.sent,
      notes: JSON.stringify(stats),
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, ...stats })
}

function describeJob(customerName: string | null, jobType: string | null): string {
  const name = (customerName || '').split(/\s+/)[0]
  const type = (jobType || '').trim()
  if (name && type) return `${name} ${type}`
  if (name) return `${name} job`
  if (type) return type
  return 'recent service'
}

function guessFirstName(businessName: string | null | undefined): string {
  if (!businessName) return 'there'
  const cleaned = businessName.replace(/\b(LLC|Inc|Co|Company|Services?|HVAC|Plumbing|Heating|Cooling|Electric(al)?)\b/gi, '').trim()
  return cleaned.split(/\s+/)[0] || 'there'
}
