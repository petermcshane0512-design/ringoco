import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'

/**
 * GET /api/admin/send-report-sms?lead=<id>&phone=<override>&secret=<...>
 *
 * One-tap from the dial-list xlsx. Looks up the lead in outreach_leads,
 * builds the personalized /sample-report URL, sends it to the prospect's
 * phone via Twilio SMS from Peter's BellAveGo line.
 *
 * Use during cold call: prospect says "yeah send me that report" → Peter
 * taps the xlsx cell → browser hits this endpoint → SMS lands in 2 sec.
 *
 * Dual-auth: header x-admin-secret OR ?secret= query (so SMS deep-links
 * from cron + xlsx work without auth dance on mobile).
 *
 * Returns a simple HTML success page so Peter sees confirmation in the
 * browser when he tapped the xlsx link.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function htmlResponse(status: number, headline: string, body: string): NextResponse {
  const html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BellAveGo · ${headline}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0B1F3A; color: #E6EEF7; margin: 0; padding: 40px 24px; }
  .card { max-width: 480px; margin: 40px auto; background: #163356; border-radius: 18px; padding: 32px 28px; text-align: center; }
  h1 { color: #5EEAD4; margin: 0 0 16px; font-size: 26px; }
  p { line-height: 1.5; color: rgba(255,255,255,0.85); margin: 0 0 12px; font-size: 16px; }
  .ok { color: #22C55E; font-size: 60px; line-height: 1; margin-bottom: 12px; }
  .err { color: #EF4444; font-size: 60px; line-height: 1; margin-bottom: 12px; }
</style></head>
<body>
  <div class="card">
    <div class="${status === 200 ? 'ok' : 'err'}">${status === 200 ? '✅' : '⚠️'}</div>
    <h1>${headline}</h1>
    <p>${body}</p>
  </div>
</body></html>`
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const expected = process.env.ADMIN_API_SECRET
  if (!expected) return htmlResponse(500, 'Server Misconfig', 'ADMIN_API_SECRET not set on server.')

  const hdr = req.headers.get('x-admin-secret') || ''
  const qry = url.searchParams.get('secret') || ''
  const authed = (hdr && timingSafeEqual(hdr, expected)) || (qry && timingSafeEqual(qry, expected))
  if (!authed) return htmlResponse(401, 'Unauthorized', 'Bad secret. Are you signed in as admin?')

  const leadId = url.searchParams.get('lead')
  const phoneOverride = url.searchParams.get('phone')
  if (!leadId) return htmlResponse(400, 'Missing lead', 'No lead ID provided.')

  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    return htmlResponse(500, 'Twilio not configured', 'Cannot send SMS — TWILIO env missing.')
  }

  const { data: lead, error } = await supabase
    .from('outreach_leads')
    .select('id, business_name, owner_phone, owner_first_name, city, trade, state')
    .eq('id', leadId)
    .maybeSingle()
  if (error || !lead) {
    return htmlResponse(404, 'Lead not found', `Couldn't find lead ${leadId}.`)
  }

  const targetPhone = (phoneOverride || lead.owner_phone || '').replace(/[^\d+]/g, '')
  if (!targetPhone || targetPhone.length < 10) {
    return htmlResponse(400, 'No phone', `Lead ${lead.business_name} has no usable phone.`)
  }
  // Normalize to E.164
  const normalized = targetPhone.startsWith('+')
    ? targetPhone
    : targetPhone.length === 10
    ? `+1${targetPhone}`
    : `+${targetPhone}`

  const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'
  const reportQs = new URLSearchParams({
    for: lead.business_name || '',
    ...(lead.city && { city: lead.city }),
    ...(lead.trade && { type: lead.trade }),
  })
  const reportUrl = `${APP}/sample-report?${reportQs.toString()}`

  const ownerFirst = lead.owner_first_name || 'there'
  const businessName = lead.business_name || 'your business'
  const smsBody =
    `Hi ${ownerFirst}, just chatted — here's the BellAveGo market report I mentioned for ${businessName}:\n\n` +
    `${reportUrl}\n\n` +
    `Takes 30 seconds. Tells you who your top 4 competitors are and what you're losing in missed calls. — Peter, BellAveGo`

  try {
    await twilioClient.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized,
      body: smsBody,
    })
    // Log to outreach_leads metadata for tracking
    await supabase
      .from('outreach_leads')
      .update({
        last_report_sms_sent_at: new Date().toISOString(),
        status: 'report_sent',
      })
      .eq('id', leadId)

    return htmlResponse(
      200,
      'Report sent',
      `📲 Sent to ${normalized}<br><br>Business: <b>${businessName}</b><br>Report: ${reportUrl}`,
    )
  } catch (e) {
    return htmlResponse(500, 'SMS failed', `Twilio error: ${(e as Error).message}`)
  }
}
