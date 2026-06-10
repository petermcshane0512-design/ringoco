import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/crons/hot-lead-stalled-nudge
 *
 * Hourly Mon-Sat 9am-7pm CST. Catches hot leads that have been sitting
 * undialed for >STALL_HOURS so Peter doesn't lose the close window.
 * Idempotent: stamps stalled_nudge_sent_at so we only nudge once per
 * lead.
 *
 * SMS body intentionally short — Peter is on the move when this fires.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const STALL_HOURS = 2

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const stalledCutoff = new Date(Date.now() - STALL_HOURS * 3600 * 1000).toISOString()
  const { data: stalled, error } = await supabase
    .from('prospect_free_leads')
    .select('biz_id, email, city, state, zip, trade, visit_count')
    .not('hot_call_sms_sent_at', 'is', null)
    .is('hot_call_dialed_at', null)
    .is('signed_up_at', null)
    .is('stalled_nudge_sent_at', null)
    .lt('hot_call_sms_sent_at', stalledCutoff)
    .limit(20)
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  const rows = stalled || []
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, nudged: 0 })
  }

  const founderPhone = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
  const lines = rows.map((r) => {
    const loc = [r.city, r.state, r.zip].filter(Boolean).join(' ')
    return `• ${(r.trade || '').toUpperCase()} ${loc} (${r.visit_count}× — ${r.email || '—'})`
  }).join('\n')

  const sms =
    `⏰ ${rows.length} hot lead${rows.length === 1 ? '' : 's'} still uncalled (>${STALL_HOURS}hr)\n\n` +
    lines.slice(0, 1000) +
    `\n\nbellavego.com/admin/hot-leads`

  try {
    await twilioClient.messages.create({
      body: sms,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: founderPhone,
    })
  } catch (e) {
    console.error('[hot-lead-stalled-nudge] twilio send failed:', (e as Error).message)
    return NextResponse.json({ ok: false, error: 'twilio_failed' }, { status: 500 })
  }

  // Stamp all nudged rows in one update.
  const ids = rows.map((r) => r.biz_id)
  await supabase
    .from('prospect_free_leads')
    .update({ stalled_nudge_sent_at: new Date().toISOString() })
    .in('biz_id', ids)

  return NextResponse.json({ ok: true, nudged: rows.length })
}
