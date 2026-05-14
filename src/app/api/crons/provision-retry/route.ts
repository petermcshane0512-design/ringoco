import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { provisionNumberForUser } from '@/lib/provisionNumber'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const MAX_ATTEMPTS = 5
// Exponential backoff: 5min, 15min, 1h, 6h, 24h
const BACKOFF_MS = [5, 15, 60, 360, 1440].map(m => m * 60 * 1000)

/**
 * Provision-retry cron — runs every 30 minutes.
 *
 * Picks up rows in provisioning_failures (status='pending') whose next_retry_at
 * has passed and re-runs provisionNumberForUser. On success: marks resolved.
 * On failure: increments attempts, schedules next retry. After MAX_ATTEMPTS,
 * escalates to manual_review and SMS Peter again with full context.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (cronSecret && auth && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const stats = { attempted: 0, resolved: 0, retrying: 0, escalated: 0 }

  const { data: failures } = await supabase
    .from('provisioning_failures')
    .select('*')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .limit(50)

  for (const f of failures ?? []) {
    stats.attempted++

    let result: { ok: true; phoneNumber: string } | { ok: false; error: string }
    try {
      const r = await provisionNumberForUser(f.user_id)
      result = r.ok ? { ok: true, phoneNumber: r.phoneNumber } : { ok: false, error: r.error }
    } catch (e) {
      result = { ok: false, error: (e as Error).message }
    }

    if (result.ok) {
      await supabase
        .from('provisioning_failures')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', f.id)
      stats.resolved++

      // Send the welcome SMS that was skipped during the original webhook failure
      try {
        const { data: contractor } = await supabase
          .from('profiles')
          .select('owner_phone, business_name, welcomed_at')
          .eq('user_id', f.user_id)
          .maybeSingle()

        if (contractor?.owner_phone && !contractor.welcomed_at) {
          await twilioClient.messages.create({
            body: `Welcome to BellAveGo, ${contractor.business_name || 'partner'}! Your AI receptionist is now live at ${result.phoneNumber}. Next step: set up call forwarding so missed calls ring through. Walkthrough: https://www.bellavego.com/dashboard/forwarding — Peter`,
            from: result.phoneNumber,
            to: contractor.owner_phone,
          })
          await supabase.from('profiles').update({ welcomed_at: new Date().toISOString() }).eq('user_id', f.user_id)
        }
      } catch (e) {
        console.error('post-retry welcome SMS failed:', e)
      }
      continue
    }

    // Failure — bump attempts + schedule next retry, or escalate.
    const nextAttempts = (f.attempts ?? 1) + 1
    if (nextAttempts > MAX_ATTEMPTS) {
      await supabase
        .from('provisioning_failures')
        .update({
          status: 'manual_review',
          last_error: result.error,
          attempts: nextAttempts,
          updated_at: new Date().toISOString(),
        })
        .eq('id', f.id)
      stats.escalated++

      // Tell Peter — this one needs hands-on
      try {
        await twilioClient.messages.create({
          body:
            `🆘 Provisioning STILL failing after ${MAX_ATTEMPTS} retries — ${f.business_name || f.user_id}\n\n` +
            `Last error: ${result.error}\n\n` +
            `Customer is paid but stuck. Manual override needed: https://www.bellavego.com/admin/provisioning`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
        })
      } catch (e) {
        console.error('escalation SMS failed:', e)
      }
    } else {
      const backoff = BACKOFF_MS[Math.min(nextAttempts - 1, BACKOFF_MS.length - 1)]
      await supabase
        .from('provisioning_failures')
        .update({
          attempts: nextAttempts,
          last_error: result.error,
          next_retry_at: new Date(Date.now() + backoff).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', f.id)
      stats.retrying++
    }
  }

  await supabase.from('agent_runs').insert({
    agent: 'provision-retry',
    notes: JSON.stringify(stats),
  })

  return NextResponse.json({ ok: true, ...stats })
}
