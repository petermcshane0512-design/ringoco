/**
 * Email helper — wraps Resend with graceful fallback.
 *
 * If RESEND_API_KEY is missing, all sends become silent no-ops (logged
 * to console) so dev environments and pre-Resend-signup states don't
 * crash. As soon as the env var lands, emails start delivering.
 *
 * Sender: bellavego.com is the verified Resend domain (verified 2026-05-21).
 * All transactional email goes FROM `alerts@bellavego.com`. Override the
 * default by setting RESEND_FROM_EMAIL. Reply-to is bellavegollc@gmail.com
 * so contractors hitting Reply reach a real inbox.
 */

const RESEND_KEY = process.env.RESEND_API_KEY
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'BellAveGo <alerts@bellavego.com>'
const REPLY_TO = process.env.RESEND_REPLY_TO || 'bellavegollc@gmail.com'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
}

export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping send. Subject:', args.subject)
    return { ok: false, error: 'RESEND_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: args.from || DEFAULT_FROM,
        to: Array.isArray(args.to) ? args.to : [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo || REPLY_TO,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[email] Resend ${res.status}: ${body.slice(0, 200)}`)
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` }
    }
    const data = (await res.json()) as { id?: string }
    return { ok: true, id: data.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[email] send threw:', msg)
    return { ok: false, error: msg }
  }
}

/**
 * Lead-alert email template — shipped to Peter on every customer call so he
 * can manually forward via iMessage during the A2P registration period.
 * The subject line is iPhone-notification-optimized (key info up front).
 */
export type LeadAlertEmailArgs = {
  toEmail: string                  // Peter (or contractor)
  contractorBusinessName: string
  contractorOwnerName: string
  contractorPhone: string
  callerName: string
  callerPhone: string | null
  callerMessage: string
  urgency: 'emergency' | 'soon' | 'whenever' | string
  twilioNumberCalled: string | null
  callTimeISO: string
  forwardPageUrl?: string          // link to /admin/forward
}

export function renderLeadAlertEmail(args: LeadAlertEmailArgs): { subject: string; html: string; text: string } {
  const urgencyIcon = args.urgency === 'emergency' ? '🚨' : args.urgency === 'soon' ? '⚡' : '🕓'
  const urgencyLabel = args.urgency === 'emergency' ? 'EMERGENCY' : args.urgency === 'soon' ? 'Soon' : 'Whenever'
  const callerPhonePretty = args.callerPhone ? formatUSPhone(args.callerPhone) : 'no phone'
  const contractorPhonePretty = formatUSPhone(args.contractorPhone)
  const time = new Date(args.callTimeISO).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const subject = `${urgencyIcon} Lead for ${args.contractorBusinessName} — ${args.callerName}`

  const text =
    `${urgencyIcon} BellAveGo lead — ${args.contractorBusinessName}\n\n` +
    `Caller: ${args.callerName}\n` +
    `Caller phone: ${callerPhonePretty}\n` +
    `Message: ${args.callerMessage}\n` +
    `Urgency: ${urgencyLabel}\n` +
    `Time: ${time}\n\n` +
    `Forward to ${args.contractorOwnerName} at ${contractorPhonePretty}\n` +
    (args.forwardPageUrl ? `\nTap-to-forward: ${args.forwardPageUrl}\n` : '') +
    `\n— BellAveGo`

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F2F9F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1F3A;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border:1px solid rgba(232,116,43,0.18);border-radius:16px;overflow:hidden;box-shadow:0 4px 22px rgba(11,31,58,0.08);">
      <div style="background:linear-gradient(135deg,#FF9D5A 0%,#E8742B 100%);padding:18px 22px;color:#fff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;opacity:0.9;">BellAveGo Lead</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-0.4px;margin-top:6px;">${escapeHtml(args.contractorBusinessName)}</div>
        <div style="font-size:13px;opacity:0.92;margin-top:4px;">${urgencyIcon} ${urgencyLabel} · ${time}</div>
      </div>
      <div style="padding:22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;" width="120">Caller</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(args.callerName)}</td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Caller phone</td><td style="padding:8px 0;"><a href="tel:${escapeHtml(args.callerPhone || '')}" style="color:#0AA89F;font-weight:700;text-decoration:none;">${callerPhonePretty}</a></td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;vertical-align:top;">Message</td><td style="padding:8px 0;line-height:1.5;">${escapeHtml(args.callerMessage)}</td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Forward to</td><td style="padding:8px 0;">${escapeHtml(args.contractorOwnerName)} at <a href="tel:${escapeHtml(args.contractorPhone)}" style="color:#0AA89F;font-weight:700;text-decoration:none;">${contractorPhonePretty}</a></td></tr>
        </table>
        ${args.forwardPageUrl ? `
        <div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(232,116,43,0.16);text-align:center;">
          <a href="${escapeHtml(args.forwardPageUrl)}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,#FF9D5A,#E8742B);color:#fff;font-weight:800;font-size:14px;text-decoration:none;box-shadow:0 6px 18px rgba(232,116,43,0.32);">📱 Open forward page</a>
          <div style="font-size:11px;color:#7AAAB2;margin-top:10px;">One tap → iMessage opens pre-filled to ${escapeHtml(args.contractorOwnerName)}</div>
        </div>
        ` : ''}
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#7AAAB2;margin-top:18px;">BellAveGo · AI receptionist for home-service contractors</div>
  </div>
</body></html>`.trim()

  return { subject, html, text }
}

/**
 * Contractor-facing lead-alert email — sent directly to the BellAveGo customer
 * (the contractor) every time their AI receptionist captures a callback.
 * Built as an SMS-replacement while A2P 10DLC is in registration: carriers
 * routinely drop our outbound SMS (error 30034), so the contractor gets the
 * same lead details via email and can tap-to-call back from their phone.
 *
 * Visually differentiated from the Peter-forward email: no "forward to" row,
 * primary CTA is tap-to-call the customer, secondary CTA is the dashboard.
 */
export type ContractorLeadEmailArgs = {
  toEmail: string
  contractorBusinessName: string
  callerName: string
  callerPhone: string | null
  callerMessage: string
  urgency: 'emergency' | 'soon' | 'whenever' | string
  callTimeISO: string
  smartInsight?: string | null
  dashboardUrl: string
}

export function renderContractorLeadEmail(args: ContractorLeadEmailArgs): { subject: string; html: string; text: string } {
  const urgencyIcon = args.urgency === 'emergency' ? '🚨' : args.urgency === 'soon' ? '⚡' : '🕓'
  const urgencyLabel = args.urgency === 'emergency' ? 'EMERGENCY' : args.urgency === 'soon' ? 'Soon' : 'Whenever'
  const callerPhonePretty = args.callerPhone ? formatUSPhone(args.callerPhone) : 'no phone'
  const time = new Date(args.callTimeISO).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const subject = `${urgencyIcon} New lead — ${args.callerName} (${urgencyLabel})`

  const text =
    `${urgencyIcon} New lead via BellAveGo\n\n` +
    `Caller: ${args.callerName}\n` +
    `Caller phone: ${callerPhonePretty}\n` +
    `Message: ${args.callerMessage}\n` +
    `Urgency: ${urgencyLabel}\n` +
    `Time: ${time}\n` +
    (args.smartInsight ? `\n${args.smartInsight}\n` : '') +
    (args.callerPhone ? `\nTap to call back: ${args.callerPhone}\n` : '') +
    `\nDashboard: ${args.dashboardUrl}\n` +
    `\n— BellAveGo`

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F2F9F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1F3A;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border:1px solid rgba(10,168,159,0.18);border-radius:16px;overflow:hidden;box-shadow:0 4px 22px rgba(11,31,58,0.08);">
      <div style="background:linear-gradient(135deg,#0AA89F 0%,#0D8F87 100%);padding:18px 22px;color:#fff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;opacity:0.9;">New Lead via BellAveGo</div>
        <div style="font-size:22px;font-weight:900;letter-spacing:-0.4px;margin-top:6px;">${escapeHtml(args.callerName)}</div>
        <div style="font-size:13px;opacity:0.92;margin-top:4px;">${urgencyIcon} ${urgencyLabel} · ${time}</div>
      </div>
      <div style="padding:22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;" width="120">Phone</td><td style="padding:8px 0;"><a href="tel:${escapeHtml(args.callerPhone || '')}" style="color:#0AA89F;font-weight:700;text-decoration:none;">${callerPhonePretty}</a></td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;vertical-align:top;">Message</td><td style="padding:8px 0;line-height:1.5;">${escapeHtml(args.callerMessage)}</td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Urgency</td><td style="padding:8px 0;font-weight:700;">${urgencyIcon} ${urgencyLabel}</td></tr>
          ${args.smartInsight ? `<tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;vertical-align:top;">Smart insight</td><td style="padding:8px 0;line-height:1.5;color:#0B1F3A;">${escapeHtml(args.smartInsight)}</td></tr>` : ''}
        </table>
        <div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(10,168,159,0.16);text-align:center;">
          ${args.callerPhone ? `<a href="tel:${escapeHtml(args.callerPhone)}" style="display:inline-block;padding:12px 28px;border-radius:10px;background:linear-gradient(135deg,#0AA89F,#0D8F87);color:#fff;font-weight:800;font-size:14px;text-decoration:none;box-shadow:0 6px 18px rgba(10,168,159,0.32);">📞 Call ${escapeHtml(args.callerName)} back</a>` : ''}
          <div style="margin-top:12px;"><a href="${escapeHtml(args.dashboardUrl)}" style="color:#7AAAB2;font-size:12px;font-weight:600;text-decoration:none;">Open in dashboard →</a></div>
        </div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#7AAAB2;margin-top:18px;">${escapeHtml(args.contractorBusinessName)} · Sent by BellAveGo</div>
  </div>
</body></html>`.trim()

  return { subject, html, text }
}

/**
 * Appointment-booked email template. Sent to the CONTRACTOR (BellAveGo customer)
 * the moment Emma successfully books an appointment in their calendar via the
 * book_appointment tool. Distinct visual treatment from the callback-request
 * email — green "BOOKED" header, calendar emoji, slot time prominent.
 *
 * Sent in addition to the SMS confirmation so the contractor has a permanent
 * record in their inbox even when Twilio drops the SMS (A2P 10DLC issues).
 */
export type AppointmentBookedEmailArgs = {
  toEmail: string
  contractorBusinessName: string
  callerName: string
  callerPhone: string | null
  serviceSummary: string
  slotLabel: string                 // "Tuesday, May 21, 2:00 PM"
  callTimeISO: string               // when the booking actually happened
  calendarEventUrl?: string | null  // Google Calendar / Cronofy link if available
  dashboardUrl: string
}

export function renderAppointmentBookedEmail(args: AppointmentBookedEmailArgs): { subject: string; html: string; text: string } {
  const callerPhonePretty = args.callerPhone ? formatUSPhone(args.callerPhone) : 'no phone'
  const bookedAt = new Date(args.callTimeISO).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const subject = `📅 BOOKED: ${args.callerName} — ${args.slotLabel}`

  const text =
    `📅 APPOINTMENT BOOKED via BellAveGo\n\n` +
    `Customer: ${args.callerName}\n` +
    `Phone: ${callerPhonePretty}\n` +
    `Service: ${args.serviceSummary}\n` +
    `When: ${args.slotLabel}\n` +
    `Booked: ${bookedAt}\n\n` +
    (args.calendarEventUrl ? `Calendar event: ${args.calendarEventUrl}\n` : '') +
    `Dashboard: ${args.dashboardUrl}\n` +
    `\n— BellAveGo`

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F2F9F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1F3A;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border:1px solid rgba(34,197,94,0.22);border-radius:16px;overflow:hidden;box-shadow:0 4px 22px rgba(11,31,58,0.08);">
      <div style="background:linear-gradient(135deg,#15803D 0%,#22C55E 100%);padding:18px 22px;color:#fff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;opacity:0.9;">📅 Appointment Booked</div>
        <div style="font-size:24px;font-weight:900;letter-spacing:-0.4px;margin-top:6px;">${escapeHtml(args.slotLabel)}</div>
        <div style="font-size:13px;opacity:0.92;margin-top:4px;">${escapeHtml(args.callerName)} · ${escapeHtml(args.serviceSummary)}</div>
      </div>
      <div style="padding:22px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;" width="120">Customer</td><td style="padding:8px 0;font-weight:700;">${escapeHtml(args.callerName)}</td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Phone</td><td style="padding:8px 0;"><a href="tel:${escapeHtml(args.callerPhone || '')}" style="color:#15803D;font-weight:700;text-decoration:none;">${callerPhonePretty}</a></td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;vertical-align:top;">Service</td><td style="padding:8px 0;line-height:1.5;">${escapeHtml(args.serviceSummary)}</td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">When</td><td style="padding:8px 0;font-weight:800;color:#15803D;">${escapeHtml(args.slotLabel)}</td></tr>
          <tr><td style="padding:8px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Booked</td><td style="padding:8px 0;color:#4A6670;">${escapeHtml(bookedAt)}</td></tr>
        </table>
        <div style="margin-top:22px;padding-top:18px;border-top:1px solid rgba(34,197,94,0.18);text-align:center;">
          ${args.calendarEventUrl ? `<a href="${escapeHtml(args.calendarEventUrl)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:linear-gradient(135deg,#15803D,#22C55E);color:#fff;font-weight:800;font-size:14px;text-decoration:none;box-shadow:0 6px 18px rgba(34,197,94,0.32);margin-right:8px;">📅 Open in Calendar</a>` : ''}
          <a href="${escapeHtml(args.dashboardUrl)}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:rgba(11,31,58,0.04);color:#0B1F3A;font-weight:700;font-size:13px;text-decoration:none;border:1px solid rgba(11,31,58,0.12);">View in dashboard</a>
        </div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#7AAAB2;margin-top:18px;">${escapeHtml(args.contractorBusinessName)} · Booked by BellAveGo AI</div>
  </div>
</body></html>`.trim()

  return { subject, html, text }
}

/**
 * Invoice / payment-link email — sent to the HOMEOWNER alongside the Twilio
 * SMS that carries the same Stripe payment link. Acts as the A2P-blocked-SMS
 * fallback so customers can pay even when carrier filters drop the SMS.
 *
 * Reply-to should be the contractor's email (passed in `replyTo` at the
 * sendEmail call site) so a customer's "what's this charge?" goes to the
 * actual seller, not to BellAveGo's catch-all inbox.
 */
export type InvoiceEmailArgs = {
  toEmail: string
  customerName: string
  contractorBusinessName: string
  serviceType: string
  amount: number               // dollars, not cents
  paymentLinkUrl: string
}

export function renderInvoiceEmail(args: InvoiceEmailArgs): { subject: string; html: string; text: string } {
  const amountPretty = `$${args.amount.toFixed(2)}`
  const subject = `Invoice from ${args.contractorBusinessName} — ${amountPretty} for ${args.serviceType}`

  const text =
    `Hi ${args.customerName},\n\n` +
    `Your invoice from ${args.contractorBusinessName} is ready:\n\n` +
    `Service: ${args.serviceType}\n` +
    `Amount: ${amountPretty}\n\n` +
    `Pay securely: ${args.paymentLinkUrl}\n\n` +
    `— ${args.contractorBusinessName} (via BellAveGo)`

  const html = `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F2F9F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0B1F3A;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border:1px solid rgba(10,168,159,0.18);border-radius:16px;overflow:hidden;box-shadow:0 4px 22px rgba(11,31,58,0.08);">
      <div style="background:linear-gradient(135deg,#0AA89F 0%,#0D8F87 100%);padding:20px 22px;color:#fff;">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;opacity:0.9;">Invoice from ${escapeHtml(args.contractorBusinessName)}</div>
        <div style="font-size:30px;font-weight:900;letter-spacing:-0.6px;margin-top:6px;">${amountPretty}</div>
        <div style="font-size:13px;opacity:0.92;margin-top:4px;">${escapeHtml(args.serviceType)}</div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:#3D5A62;">Hi ${escapeHtml(args.customerName)} — your invoice is ready. Tap the button below to pay securely.</p>
        <div style="text-align:center;margin:24px 0 12px;">
          <a href="${escapeHtml(args.paymentLinkUrl)}" style="display:inline-block;padding:14px 32px;border-radius:10px;background:linear-gradient(135deg,#0AA89F,#0D8F87);color:#fff;font-weight:800;font-size:15px;text-decoration:none;box-shadow:0 6px 18px rgba(10,168,159,0.32);">Pay ${amountPretty} →</a>
        </div>
        <p style="margin:18px 0 0;font-size:11px;color:#7AAAB2;text-align:center;line-height:1.5;">Secured by Stripe · Reply to this email to reach ${escapeHtml(args.contractorBusinessName)} directly.</p>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:#7AAAB2;margin-top:18px;">${escapeHtml(args.contractorBusinessName)} · Sent via BellAveGo</div>
  </div>
</body></html>`.trim()

  return { subject, html, text }
}

function formatUSPhone(p: string | null): string {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return p
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
