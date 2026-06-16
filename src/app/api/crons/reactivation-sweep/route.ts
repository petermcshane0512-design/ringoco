import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/reactivation-sweep
 *
 * Weekly Tuesday 17:00 UTC. Finds profiles that cancelled in the last
 * 7-60 days and haven't been re-engaged yet, sends them a "come back,
 * first month free" win-back SMS + email. Stamps reactivation_attempted_at +
 * bumps reactivation_count so we don't spam.
 *
 * Graduated reactivation:
 *   attempt 1 (7-14 days after cancel):   "we miss you, first month free back"
 *   attempt 2 (30-45 days):                "your dashboard still has your number, one click to reactivate"
 *   attempt 3 (90 days):                   "last call — your AI number gets released next week"
 *
 * Per attempt: SMS only (email opt-in not always set). Cheap, high-leverage.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const FROM = process.env.TWILIO_PHONE_NUMBER!

function authorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const got = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  return !!expected && got === expected
}

function buildWinback(attempt: number, name: string): string {
  if (attempt === 1) {
    return `Hey ${name || 'partner'} — saw you cancelled BellAveGo. Quick offer: come back this week and your first 2 weeks are FREE. Cancel anytime. https://www.bellavego.com/dashboard/upgrade — Peter`
  }
  if (attempt === 2) {
    return `${name || 'Hey'} — your AI number is still parked at BellAveGo for ~30 more days. Reactivate in one click and don't lose it. 2 weeks FREE if you re-up: https://www.bellavego.com/dashboard/upgrade — Peter`
  }
  return `${name || 'Hey'} — last call. Your BellAveGo number gets released to the pool next week. If you want it back, 2 weeks FREE re-up: https://www.bellavego.com/dashboard/upgrade — Peter`
}

async function handler(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  // Pull profiles cancelled in the last 90 days that have at least an owner_phone.
  const since = new Date(now - 90 * day).toISOString()
  const { data: cancelled, error } = await supabase
    .from('profiles')
    .select('user_id, owner_first_name, owner_phone, cancelled_at, reactivation_attempted_at, reactivation_count, is_active, plan_tier')
    .eq('plan_tier', 'cancelled')
    .not('cancelled_at', 'is', null)
    .not('owner_phone', 'is', null)
    .gte('cancelled_at', since)
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = {
    user_id: string
    owner_first_name: string | null
    owner_phone: string | null
    cancelled_at: string
    reactivation_attempted_at: string | null
    reactivation_count: number | null
    is_active: boolean | null
    plan_tier: string | null
  }

  let attempted = 0
  let skipped = 0

  for (const p of (cancelled ?? []) as Row[]) {
    if (p.is_active) { skipped++; continue }
    const daysSinceCancel = (now - new Date(p.cancelled_at).getTime()) / day
    const lastAttempt = p.reactivation_attempted_at ? new Date(p.reactivation_attempted_at).getTime() : 0
    const daysSinceLastAttempt = lastAttempt > 0 ? (now - lastAttempt) / day : 999
    const attemptCount = p.reactivation_count ?? 0

    let dueAttempt = 0
    if (attemptCount === 0 && daysSinceCancel >= 7 && daysSinceCancel <= 14)      dueAttempt = 1
    else if (attemptCount === 1 && daysSinceCancel >= 30 && daysSinceLastAttempt >= 14) dueAttempt = 2
    else if (attemptCount === 2 && daysSinceCancel >= 85 && daysSinceLastAttempt >= 30) dueAttempt = 3

    if (dueAttempt === 0) { skipped++; continue }

    try {
      await twilioClient.messages.create({
        body: buildWinback(dueAttempt, p.owner_first_name || ''),
        from: FROM,
        to: p.owner_phone!,
      })
      await supabase
        .from('profiles')
        .update({
          reactivation_attempted_at: new Date().toISOString(),
          reactivation_count: dueAttempt,
        })
        .eq('user_id', p.user_id)
      attempted++
    } catch (e) {
      console.warn(`[reactivation-sweep] SMS failed for ${p.user_id}:`, (e as Error).message)
      skipped++
    }
  }

  return NextResponse.json({
    ok: true,
    checked: cancelled?.length ?? 0,
    attempted,
    skipped,
  })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
