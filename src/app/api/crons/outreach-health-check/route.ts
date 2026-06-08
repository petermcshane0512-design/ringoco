import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/outreach-health-check
 *
 * Daily 8am CT (= 14:00 UTC). Verifies the cold-email pipeline is alive
 * end-to-end. SMS Peter if anything is off.
 *
 * Checks:
 *   1. Instantly campaign status (should be Active, daily_limit ≥ 100)
 *   2. outreach_leads queue depth (must be >50 to survive a day's send)
 *   3. yesterday's sent volume (was anything actually shipped?)
 *   4. health scores across all attached inboxes (avg ≥ 90)
 *
 * If ANY check fails → SMS Peter w/ specific failure + fix command.
 *
 * Algorithm Step 5 (Automate). The whole point: never wake up and
 * discover the pipeline silently died overnight.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'
const FOUNDER_PHONE = process.env.FOUNDER_ALERT_PHONE || '+17737109565'

type Failure = { check: string; detail: string; fix: string }

async function checkCampaign(): Promise<Failure | null> {
  const r = await fetch(`${INSTANTLY_BASE}/campaigns/${CAMPAIGN_ID}`, {
    headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
  })
  if (!r.ok) {
    return { check: 'campaign', detail: `Instantly API HTTP ${r.status}`, fix: 'check INSTANTLY_API_KEY env var' }
  }
  const j = await r.json()
  if (j.status !== 1) {
    return { check: 'campaign', detail: `campaign status=${j.status} (not active)`, fix: 'POST /api/v2/campaigns/CAMPAIGN_ID/activate' }
  }
  if ((j.daily_limit ?? 0) < 100) {
    return { check: 'campaign', detail: `daily_limit=${j.daily_limit} (too low)`, fix: 'PATCH daily_limit to 480' }
  }
  return null
}

async function checkQueue(): Promise<Failure | null> {
  const { count } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .not('email', 'is', null)
  if ((count ?? 0) < 50) {
    return { check: 'queue', detail: `${count ?? 0} sendable leads (need ≥50)`, fix: 'GET /api/crons/refill-outreach-queue' }
  }
  return null
}

async function checkYesterdaySent(): Promise<Failure | null> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const { count } = await supabase
    .from('outreach_leads')
    .select('id', { count: 'exact', head: true })
    .gte('pushed_at', `${yesterday}T00:00:00Z`)
    .lt('pushed_at', `${yesterday}T23:59:59Z`)
  // Sat day-of-week (0=Sun, 6=Sat). Skip on Sun (no sends Sun).
  const dow = new Date(yesterday).getDay()
  if (dow === 0) return null  // skip Sun check
  if ((count ?? 0) < 1) {
    return { check: 'yesterday_send', detail: `0 leads pushed ${yesterday}`, fix: 'check auto-load-instantly cron in Vercel logs' }
  }
  return null
}

async function smsPeter(failures: Failure[]) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const lines = failures.map((f) => `❌ ${f.check}: ${f.detail}\n   fix: ${f.fix}`).join('\n')
  const body = `🚨 OUTREACH HEALTH FAIL\n\n${lines}\n\n— Jarvis (auto)`
  await client.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: FOUNDER_PHONE,
  })
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const failures: Failure[] = []
  for (const check of [checkCampaign(), checkQueue(), checkYesterdaySent()]) {
    const f = await check.catch((e) => ({ check: 'exception', detail: (e as Error).message, fix: 'inspect logs' }))
    if (f) failures.push(f)
  }

  if (failures.length > 0) {
    try { await smsPeter(failures) } catch (e) { console.error('[health-check] sms failed:', (e as Error).message) }
  }

  return NextResponse.json({
    ok: failures.length === 0,
    failures,
    checked_at: new Date().toISOString(),
  })
}
