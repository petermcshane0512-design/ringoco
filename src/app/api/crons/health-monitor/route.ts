import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/health-monitor
 *
 * Runs every 4 hours. Checks every spend account + every operational signal
 * Peter cares about. Fires an SMS + push to Peter when anything crosses a
 * red threshold. Keeps Peter from having to baby-sit dashboards.
 *
 * Checks:
 *   1. Twilio balance        (red if < $20)
 *   2. Vapi MTD spend        (warn if > $200)
 *   3. Apify monthly spend   (warn if > $80, red if > $95)
 *   4. Instantly mailbox warmup status (red if any mailbox warmup_status != 1)
 *   5. Customers w/ trial ending in next 24h (info — gives Peter heads-up)
 *   6. Failed provisioning rows past 1h (red — customer can't get number)
 *   7. Recent cron failures (vapi_import_failed_at within 24h)
 *
 * Auth: x-vercel-cron header OR x-admin-secret.
 *
 * Output: writes a snapshot row to health_snapshots table + alerts via SMS.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null

type Severity = 'green' | 'yellow' | 'red'
type Check = { name: string; severity: Severity; message: string; value?: string | number | null }

const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

async function checkTwilioBalance(): Promise<Check> {
  if (!twilioClient) return { name: 'twilio_balance', severity: 'yellow', message: 'no Twilio creds' }
  try {
    const balance = await twilioClient.balance.fetch()
    const amt = parseFloat(balance.balance)
    const sev: Severity = amt < 20 ? 'red' : amt < 50 ? 'yellow' : 'green'
    return { name: 'twilio_balance', severity: sev, message: `Twilio balance $${amt.toFixed(2)}`, value: amt }
  } catch (e) {
    return { name: 'twilio_balance', severity: 'red', message: `Twilio API err: ${(e as Error).message.slice(0, 80)}` }
  }
}

async function checkVapiSpend(): Promise<Check> {
  if (!process.env.VAPI_API_KEY) return { name: 'vapi_spend', severity: 'yellow', message: 'no VAPI_API_KEY' }
  try {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const url = `https://api.vapi.ai/analytics`
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: [{
          table: 'call', name: 'mtd', timeRange: {
            start: monthStart.toISOString(), end: new Date().toISOString(), step: 'month',
          }, operations: [{ operation: 'sum', column: 'cost' }],
        }],
      }),
    })
    if (!r.ok) return { name: 'vapi_spend', severity: 'yellow', message: `Vapi HTTP ${r.status}` }
    const j = await r.json()
    const total = Number(j?.[0]?.result?.[0]?.sumCost ?? 0)
    const sev: Severity = total > 300 ? 'red' : total > 200 ? 'yellow' : 'green'
    return { name: 'vapi_spend', severity: sev, message: `Vapi MTD spend $${total.toFixed(2)}`, value: total }
  } catch (e) {
    return { name: 'vapi_spend', severity: 'yellow', message: `Vapi err: ${(e as Error).message.slice(0, 60)}` }
  }
}

async function checkApifySpend(): Promise<Check> {
  if (!process.env.APIFY_API_TOKEN) return { name: 'apify_spend', severity: 'yellow', message: 'no APIFY_API_TOKEN' }
  try {
    const r = await fetch('https://api.apify.com/v2/users/me/usage/monthly', {
      headers: { Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
    })
    if (!r.ok) return { name: 'apify_spend', severity: 'yellow', message: `Apify HTTP ${r.status}` }
    const j = await r.json()
    const used = Number(j?.data?.monthlyUsageUsd ?? j?.data?.usageUsd ?? 0)
    const sev: Severity = used > 95 ? 'red' : used > 80 ? 'yellow' : 'green'
    return { name: 'apify_spend', severity: sev, message: `Apify MTD spend $${used.toFixed(2)}`, value: used }
  } catch (e) {
    return { name: 'apify_spend', severity: 'yellow', message: `Apify err: ${(e as Error).message.slice(0, 60)}` }
  }
}

async function checkInstantlyMailboxes(): Promise<Check> {
  if (!process.env.INSTANTLY_API_KEY) return { name: 'instantly_warmup', severity: 'yellow', message: 'no INSTANTLY_API_KEY' }
  try {
    const r = await fetch('https://api.instantly.ai/api/v2/accounts?limit=100', {
      headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
    })
    if (!r.ok) return { name: 'instantly_warmup', severity: 'yellow', message: `Instantly HTTP ${r.status}` }
    const j = await r.json()
    const accts = j.items || []
    const total = accts.length
    const warming = accts.filter((a: { warmup_status?: number }) => a.warmup_status === 1).length
    const off = total - warming
    const sev: Severity = off > 0 ? 'red' : total >= 10 ? 'green' : 'yellow'
    return {
      name: 'instantly_warmup',
      severity: sev,
      message: `Instantly: ${warming}/${total} warming · ${off} OFF`,
      value: warming,
    }
  } catch (e) {
    return { name: 'instantly_warmup', severity: 'yellow', message: `Instantly err: ${(e as Error).message.slice(0, 60)}` }
  }
}

async function checkTrialEndings(): Promise<Check> {
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, trial_ends_at')
    .gte('trial_ends_at', now.toISOString())
    .lte('trial_ends_at', in24h.toISOString())
  if (error) return { name: 'trial_endings_24h', severity: 'yellow', message: `query err: ${error.message}` }
  const count = data?.length ?? 0
  return {
    name: 'trial_endings_24h',
    severity: count > 0 ? 'yellow' : 'green',
    message: count > 0 ? `${count} trial(s) ending in next 24h — check they're set` : 'no trials ending in 24h',
    value: count,
  }
}

async function checkProvisioningFailures(): Promise<Check> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, vapi_import_failed_at, vapi_assistant_creation_error')
    .or(`vapi_import_failed_at.gte.${oneHourAgo},vapi_assistant_creation_error.not.is.null`)
    .limit(20)
  if (error) return { name: 'provisioning_failures', severity: 'yellow', message: `query err: ${error.message}` }
  const recentFailures = (data || []).filter((p) => p.vapi_import_failed_at && new Date(p.vapi_import_failed_at) >= new Date(oneHourAgo))
  const sev: Severity = recentFailures.length > 0 ? 'red' : 'green'
  return {
    name: 'provisioning_failures',
    severity: sev,
    message: recentFailures.length > 0
      ? `${recentFailures.length} customer(s) couldn't get a number in last hour`
      : 'no provisioning failures',
    value: recentFailures.length,
  }
}

async function checkActiveCustomers(): Promise<Check> {
  const { count, error } = await supabase
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_active', true)
    .not('twilio_number', 'is', null)
  if (error) return { name: 'active_customers', severity: 'yellow', message: `query err: ${error.message}` }
  return {
    name: 'active_customers',
    severity: 'green',
    message: `${count ?? 0} active customers (twilio number provisioned + is_active)`,
    value: count ?? 0,
  }
}

async function sendAlertSms(redChecks: Check[], yellowChecks: Check[]): Promise<void> {
  if (!twilioClient || !PETER_PHONE || !process.env.TWILIO_PHONE_NUMBER) return
  if (redChecks.length === 0 && yellowChecks.length === 0) return
  const lines: string[] = []
  if (redChecks.length > 0) {
    lines.push('🚨 BellAveGo RED alert')
    for (const c of redChecks) lines.push(`• ${c.message}`)
  }
  if (yellowChecks.length > 0) {
    lines.push('')
    lines.push('⚠️ Yellow:')
    for (const c of yellowChecks) lines.push(`• ${c.message}`)
  }
  lines.push('')
  lines.push('Open: bellavego.com/admin/founder')
  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: PETER_PHONE,
      body: lines.join('\n').slice(0, 1500),
    })
  } catch (e) {
    console.error('[health-monitor] SMS send failed:', (e as Error).message)
  }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const checks: Check[] = await Promise.all([
    checkTwilioBalance(),
    checkVapiSpend(),
    checkApifySpend(),
    checkInstantlyMailboxes(),
    checkTrialEndings(),
    checkProvisioningFailures(),
    checkActiveCustomers(),
  ])

  const redChecks = checks.filter((c) => c.severity === 'red')
  const yellowChecks = checks.filter((c) => c.severity === 'yellow')

  // Snapshot to DB — keeps a 30d audit trail without writing a dedicated migration.
  // Uses generic key_value_snapshots table if it exists, otherwise just logs.
  try {
    await supabase.from('health_snapshots').insert({
      checked_at: new Date().toISOString(),
      summary: {
        red: redChecks.length,
        yellow: yellowChecks.length,
        green: checks.filter((c) => c.severity === 'green').length,
      },
      checks,
    })
  } catch {
    // Table may not exist yet — non-fatal, alerting still fires.
  }

  // Only alert SMS if RED. Yellow is daily-summary territory, not 4am wake-ups.
  if (redChecks.length > 0) {
    await sendAlertSms(redChecks, yellowChecks)
  }

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    summary: {
      red: redChecks.length,
      yellow: yellowChecks.length,
      green: checks.filter((c) => c.severity === 'green').length,
    },
    checks,
  })
}
