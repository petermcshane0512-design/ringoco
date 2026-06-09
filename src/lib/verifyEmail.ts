import { promises as dns } from 'node:dns'

/**
 * Cheap email verification — used by refill-outreach-queue to filter
 * obvious garbage before insert. Catches ~80% of bounces without external
 * service spend.
 *
 * Returns { ok: true } if email is plausibly deliverable.
 * Returns { ok: false, reason } if it's clearly bad.
 */

const BAD_PATTERNS = [
  /^(noreply|no-reply|donotreply|do-not-reply|abuse|postmaster|spam|webmaster|hostmaster|root|admin@.*\.local)/i,
  /\.test$/,
  /@example\./,
  /@localhost/,
  /\+spam@/,
]

const ROLE_INBOXES_LOW_VALUE = [
  /^(sales|marketing|hr|jobs|careers|billing|accounting|finance|legal)@/i,
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const mxCache = new Map<string, { hasMx: boolean; checkedAt: number }>()
const MX_CACHE_TTL_MS = 3_600_000  // 1 hr

export async function verifyEmail(email: string): Promise<{ ok: boolean; reason?: string }> {
  const e = (email || '').trim().toLowerCase()
  if (!e) return { ok: false, reason: 'empty' }
  if (!EMAIL_REGEX.test(e)) return { ok: false, reason: 'invalid format' }
  for (const re of BAD_PATTERNS) {
    if (re.test(e)) return { ok: false, reason: 'bad pattern' }
  }
  // Role-inbox is allowed (lots of HVAC owners use info@/contact@) but flagged
  // so caller can de-prioritize. Don't drop them — drop only the worst.
  for (const re of ROLE_INBOXES_LOW_VALUE) {
    if (re.test(e)) return { ok: false, reason: 'low-value role inbox' }
  }
  const domain = e.split('@')[1]
  if (!domain) return { ok: false, reason: 'no domain' }
  const cached = mxCache.get(domain)
  if (cached && Date.now() - cached.checkedAt < MX_CACHE_TTL_MS) {
    return cached.hasMx ? { ok: true } : { ok: false, reason: 'no MX (cached)' }
  }
  try {
    const records = await dns.resolveMx(domain)
    const hasMx = Array.isArray(records) && records.length > 0
    mxCache.set(domain, { hasMx, checkedAt: Date.now() })
    return hasMx ? { ok: true } : { ok: false, reason: 'no MX records' }
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      mxCache.set(domain, { hasMx: false, checkedAt: Date.now() })
      return { ok: false, reason: `dns ${code}` }
    }
    // Unknown error — fail open to avoid dropping good leads on network blip
    return { ok: true }
  }
}
