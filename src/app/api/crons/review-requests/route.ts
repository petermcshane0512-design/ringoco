import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { REVIEW_TIERS } from '@/lib/pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

/**
 * Hourly cron — fires Google Review request SMS to customers whose jobs
 * were completed >= 4 hours ago and haven't been asked yet.
 *
 * Tier-gated: Growth + Premium only. Foundation tier doesn't get this.
 *
 * Schema columns used (migration 004):
 *   jobs.completed_at, jobs.review_requested_at
 *   profiles.google_place_id, profiles.review_request_enabled
 */

type JobRow = {
  id: string
  user_id: string
  customer_name: string | null
  customer_phone: string | null
  completed_at: string | null
}

type ProfileRow = {
  business_name: string | null
  google_place_id: string | null
  twilio_number: string | null
  plan_tier: string | null
  review_request_enabled: boolean | null
}

// REVIEW_TIERS centralized in src/lib/pricing.ts — includes multiloc which OFFICE_MGR_TIERS does not.

export async function GET(req: NextRequest) {
  // Vercel cron sends an Authorization: Bearer ${CRON_SECRET} header automatically
  // when CRON_SECRET env var is set. We accept either authenticated cron or no
  // header at all (so manual /api/crons/review-requests visits work for testing).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, user_id, customer_name, customer_phone, completed_at')
    .eq('status', 'completed')
    .is('review_requested_at', null)
    .not('completed_at', 'is', null)
    .lt('completed_at', cutoff)
    .limit(100)

  if (error) {
    console.error('review-requests select failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: { job_id: string; status: string; reason?: string }[] = []

  for (const job of (jobs ?? []) as JobRow[]) {
    if (!job.user_id || !job.customer_phone) {
      results.push({ job_id: job.id, status: 'skipped', reason: 'missing user/phone' })
      continue
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, google_place_id, twilio_number, plan_tier, review_request_enabled')
      .eq('user_id', job.user_id)
      .maybeSingle()

    const p = profile as ProfileRow | null
    if (!p) {
      results.push({ job_id: job.id, status: 'skipped', reason: 'no profile' })
      continue
    }
    if (!REVIEW_TIERS.has(p.plan_tier ?? '')) {
      results.push({ job_id: job.id, status: 'skipped', reason: 'tier-gated' })
      continue
    }
    if (p.review_request_enabled === false) {
      results.push({ job_id: job.id, status: 'skipped', reason: 'opted out' })
      continue
    }
    if (!p.twilio_number) {
      results.push({ job_id: job.id, status: 'skipped', reason: 'no twilio number' })
      continue
    }

    const reviewUrl = p.google_place_id
      ? `https://search.google.com/local/writereview?placeid=${p.google_place_id}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.business_name ?? 'business')}`

    const customerFirstName = (job.customer_name ?? '').split(' ')[0] || 'there'

    const body =
      `Hi ${customerFirstName}, thanks for choosing ${p.business_name ?? 'us'}! ` +
      `If we did a great job, a quick Google review really helps small businesses like ours. ` +
      `Takes 30 seconds: ${reviewUrl} — ${p.business_name ?? ''}`

    try {
      await twilioClient.messages.create({
        body,
        from: p.twilio_number,
        to: job.customer_phone,
      })
      await supabase
        .from('jobs')
        .update({ review_requested_at: new Date().toISOString() })
        .eq('id', job.id)
      results.push({ job_id: job.id, status: 'sent' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('review SMS failed', job.id, msg)
      results.push({ job_id: job.id, status: 'error', reason: msg })
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'review-requests',
    leads_pushed: results.filter((r) => r.status === 'sent').length,
    notes: JSON.stringify(results),
  })

  return NextResponse.json({
    processed: jobs?.length ?? 0,
    sent: results.filter((r) => r.status === 'sent').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
  })
}
