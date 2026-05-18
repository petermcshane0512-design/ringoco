/**
 * Email helper — wraps Resend with graceful fallback.
 *
 * If RESEND_API_KEY is missing, all sends become silent no-ops (logged
 * to console) so dev environments and pre-Resend-signup states don't
 * crash. As soon as the env var lands, emails start delivering.
 *
 * Sender note: until DNS for bellavego.com is verified in Resend, all
 * emails go FROM `onboarding@resend.dev` (Resend's test-allowed sender).
 * Reply-to is set to bellavegollc@gmail.com so contractors hitting Reply
 * reach a real inbox. After DNS verification, swap FROM to
 * `alerts@bellavego.com`.
 */

const RESEND_KEY = process.env.RESEND_API_KEY
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'BellAveGo Alerts <onboarding@resend.dev>'
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
