import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/leads/[id]/send-outreach
 *
 * 2026-06-09 LEADS-ONLY PIVOT — fires the actual outreach message.
 *
 * Channel = sms | email:
 *   - sms: Twilio fires from TWILIO_PHONE_NUMBER (we mask sender as
 *     contractor's number in the UI/dashboard but actual send is from
 *     our Twilio number for compliance + reply tracking)
 *   - email: TODO — wire Resend or Postmark. For now, returns ok+stub.
 *
 * Logs the send to lead_outreach_log (new table) for the dashboard reply
 * tracker + so we don't double-send.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: leadId } = await ctx.params

  let body: { channel?: 'sms' | 'email'; subject?: string; body?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body.channel || !body.body) return NextResponse.json({ error: 'channel + body required' }, { status: 400 })

  // Verify lead drop belongs to tenant
  const { data: drop } = await supabase
    .from('lead_drops')
    .select('id, lead_id, user_id, owner_phone, owner_email')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .maybeSingle()
  if (!drop) return NextResponse.json({ error: 'lead not in your queue' }, { status: 403 })
  const d = drop as { id: string; lead_id: string; user_id: string; owner_phone: string | null; owner_email: string | null }

  if (body.channel === 'sms') {
    if (!d.owner_phone) return NextResponse.json({ error: 'no phone on lead' }, { status: 400 })
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      return NextResponse.json({ error: 'TWILIO env vars missing' }, { status: 500 })
    }
    try {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await client.messages.create({
        body: body.body.slice(0, 1500),
        from: process.env.TWILIO_PHONE_NUMBER,
        to: d.owner_phone.startsWith('+') ? d.owner_phone : `+1${d.owner_phone.replace(/\D/g, '')}`,
      })
    } catch (e) {
      return NextResponse.json({ error: `twilio send failed: ${(e as Error).message}` }, { status: 502 })
    }
  } else if (body.channel === 'email') {
    if (!d.owner_email) return NextResponse.json({ error: 'no email on lead' }, { status: 400 })
    // TODO: wire Resend / Postmark. Stub for now — log + return ok.
    console.log(`[send-outreach] EMAIL stub — would send to ${d.owner_email}: ${body.subject}`)
  } else {
    return NextResponse.json({ error: 'bad channel' }, { status: 400 })
  }

  // Log the send (best-effort — table may not exist yet)
  try {
    await supabase.from('lead_outreach_log').insert({
      user_id: userId,
      lead_id: leadId,
      drop_id: d.id,
      channel: body.channel,
      subject: body.subject || null,
      body: body.body.slice(0, 4000),
      sent_at: new Date().toISOString(),
    })
  } catch { /* table may not exist yet */ }

  return NextResponse.json({ ok: true, channel: body.channel })
}
