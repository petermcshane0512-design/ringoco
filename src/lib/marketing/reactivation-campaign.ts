/**
 * Past-customer reactivation. Pulls customers whose last completed job is more
 * than `minDormantDays` ago, sends one SMS via Twilio with a trigger-specific hook.
 *
 * Triggers:
 *   - 'seasonal'  → bi-annual HVAC tune-up, spring drain cleaning, etc.
 *   - 'weather'   → after severe weather event in the area (most powerful)
 *   - 'milestone' → one-year-since-service nudge
 *
 * Writes each send to reactivation_drips for audit + suppression (don't send twice in 90 days).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

export type ReactivationTrigger = 'seasonal' | 'weather' | 'milestone'

export type CampaignResult = { sent: number; suppressed: number; failed: number }

export async function runReactivationCampaign(args: {
  supabase: SupabaseClient
  userId: string
  trigger: ReactivationTrigger
  contextHook: string  // e.g. "Severe storm just hit Atlanta — checking on your roof"
  businessName: string
  fromNumber: string
  minDormantDays?: number
  maxRecipients?: number
}): Promise<CampaignResult> {
  const minDormantDays = args.minDormantDays ?? 90
  const maxRecipients = args.maxRecipients ?? 50

  // Find candidate past customers (most-recent completed job > minDormantDays ago).
  const dormantBefore = new Date(Date.now() - minDormantDays * 24 * 3600_000).toISOString()
  const { data: candidates } = await args.supabase
    .from('jobs')
    .select('customer_name, customer_phone, completed_at')
    .eq('user_id', args.userId)
    .eq('status', 'completed')
    .lt('completed_at', dormantBefore)
    .order('completed_at', { ascending: false })
    .limit(maxRecipients * 3)

  if (!candidates || candidates.length === 0) return { sent: 0, suppressed: 0, failed: 0 }

  // De-duplicate by phone, keep most recent job per phone.
  const byPhone = new Map<string, { name: string; phone: string; completedAt: string }>()
  for (const c of candidates) {
    const phone = (c as { customer_phone?: string }).customer_phone
    if (!phone) continue
    if (!byPhone.has(phone)) {
      byPhone.set(phone, {
        name: (c as { customer_name?: string }).customer_name ?? 'there',
        phone,
        completedAt: (c as { completed_at?: string }).completed_at ?? '',
      })
    }
  }

  // Suppression: skip anyone we drip-messaged in the last 90 days.
  const suppressionCutoff = new Date(Date.now() - 90 * 24 * 3600_000).toISOString()
  const { data: recentDrips } = await args.supabase
    .from('reactivation_drips')
    .select('customer_phone')
    .eq('user_id', args.userId)
    .gte('sent_at', suppressionCutoff)
  const suppressed = new Set((recentDrips ?? []).map(d => (d as { customer_phone: string }).customer_phone))

  const targets = Array.from(byPhone.values()).filter(t => !suppressed.has(t.phone)).slice(0, maxRecipients)
  let sent = 0
  let failed = 0

  for (const t of targets) {
    const firstName = t.name.split(' ')[0]
    const message = `Hi ${firstName}, ${args.businessName} here — ${args.contextHook}. Want us to swing by? Reply YES and we'll text scheduling, or STOP to opt out.`
    try {
      await twilioClient.messages.create({ body: message, from: args.fromNumber, to: t.phone })
      await args.supabase.from('reactivation_drips').insert({
        user_id: args.userId,
        customer_phone: t.phone,
        customer_name: t.name,
        last_job_at: t.completedAt.split('T')[0],
        trigger: args.trigger,
        message_sent: message,
      })
      sent++
    } catch (e) {
      console.error('[reactivation-campaign] sms failed:', e)
      failed++
    }
    await new Promise(r => setTimeout(r, 250))  // gentle pacing on Twilio
  }
  return { sent, suppressed: suppressed.size, failed }
}
