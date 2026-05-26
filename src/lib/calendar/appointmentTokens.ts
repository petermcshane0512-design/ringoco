/**
 * Public appointment tokens — HMAC-signed identifiers that let a customer
 * (homeowner) view their booked appointment without logging in.
 *
 * Token format: base64url(<appointmentId>.<expISO>.<hmacHex>)
 *   appointmentId: jobs.id (UUID)
 *   expISO:        ISO 8601 expiration (typically appointment_time + 7 days)
 *   hmacHex:       HMAC-SHA256(secret, `${appointmentId}.${expISO}`) hex
 *
 * Verification: recompute HMAC + check expiration. Tokens are stateless —
 * no DB lookup of token id needed. Revocation = bump the secret.
 *
 * Secret: APPOINTMENT_TOKEN_SECRET env var. Falls back to
 * CALENDAR_TOKEN_ENCRYPTION_KEY (already set in Vercel) if not present.
 */
import crypto from 'crypto'

function getSecret(): string {
  const s =
    process.env.APPOINTMENT_TOKEN_SECRET ||
    process.env.CALENDAR_TOKEN_ENCRYPTION_KEY ||
    ''
  if (!s) throw new Error('No token secret set (APPOINTMENT_TOKEN_SECRET or CALENDAR_TOKEN_ENCRYPTION_KEY required)')
  return s
}

function base64urlEncode(buf: Buffer | string): string {
  const s = typeof buf === 'string' ? Buffer.from(buf) : buf
  return s.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

/**
 * Sign a token for an appointment. Default expiration: 30 days from now
 * (lets the customer click their SMS link anytime up to a month after the
 * appointment, useful for late reschedule requests / disputes).
 */
export function signAppointmentToken(appointmentId: string, expiresInDays = 30): string {
  const expISO = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const payload = `${appointmentId}.${expISO}`
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  return base64urlEncode(`${payload}.${sig}`)
}

export type VerifiedAppointmentToken =
  | { ok: true; appointmentId: string; expISO: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'tampered' }

export function verifyAppointmentToken(token: string): VerifiedAppointmentToken {
  let raw: string
  try {
    raw = base64urlDecode(token).toString('utf8')
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  const parts = raw.split('.')
  if (parts.length !== 3) return { ok: false, reason: 'invalid' }
  const [appointmentId, expISO, sig] = parts
  const payload = `${appointmentId}.${expISO}`
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex')
  if (sig.length !== expected.length) return { ok: false, reason: 'tampered' }
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, reason: 'tampered' }
  }
  const exp = new Date(expISO).getTime()
  if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false, reason: 'expired' }
  return { ok: true, appointmentId, expISO }
}
