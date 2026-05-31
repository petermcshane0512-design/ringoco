/**
 * Hunter.io email verification adapter.
 *
 * Given an email, returns whether it's deliverable. Used to pre-filter
 * the cold-email queue before sending — drops bounce rate from ~7% to
 * ~1.5%. Worth $49/mo + ~$0.05/lead = saves Gmail reputation.
 *
 * USAGE
 *   import { verifyEmail, verifyBatch } from '@/lib/hunter/verify'
 *   const result = await verifyEmail('peter@bellavego.com')
 *
 * If HUNTER_API_KEY not set, returns a passthrough result with status
 * 'unknown' so the pipeline doesn't break. When Peter's card lands, he
 * sets the env var and verification activates automatically.
 */

export type HunterVerifyResult = {
  email: string
  status: 'deliverable' | 'undeliverable' | 'risky' | 'unknown' | 'accept_all'
  result: 'valid' | 'invalid' | 'unknown'
  score: number // 0-100
  smtp_check: boolean
  mx_records: boolean
  webmail: boolean
  block: boolean
  disposable: boolean
  source: 'hunter' | 'fallback'
  raw?: any
}

const HUNTER_BASE = 'https://api.hunter.io/v2'

export async function verifyEmail(email: string): Promise<HunterVerifyResult> {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) {
    return {
      email, status: 'unknown', result: 'unknown', score: 0,
      smtp_check: false, mx_records: false, webmail: false, block: false, disposable: false,
      source: 'fallback',
    }
  }
  const url = `${HUNTER_BASE}/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) {
    const txt = await res.text().catch(() => '<no body>')
    throw new Error(`Hunter verify failed: ${res.status} ${txt.slice(0, 200)}`)
  }
  const json = await res.json() as any
  const d = json?.data ?? {}
  return {
    email,
    status: d.status ?? 'unknown',
    result: d.result ?? 'unknown',
    score: d.score ?? 0,
    smtp_check: !!d.smtp_check,
    mx_records: !!d.mx_records,
    webmail: !!d.webmail,
    block: !!d.block,
    disposable: !!d.disposable,
    source: 'hunter',
    raw: d,
  }
}

/**
 * Batch verify with concurrency + rate limit guard.
 * Hunter free tier: 25/mo. Starter: 1000/mo. Growth: 5000/mo.
 * At 900/day cold sends, monthly need ~27K — use Growth+ tier.
 */
export async function verifyBatch(emails: string[], concurrency = 5): Promise<HunterVerifyResult[]> {
  const out: HunterVerifyResult[] = []
  let idx = 0
  async function worker() {
    while (idx < emails.length) {
      const i = idx++
      const e = emails[i]
      try {
        out[i] = await verifyEmail(e)
      } catch (err) {
        out[i] = {
          email: e, status: 'unknown', result: 'unknown', score: 0,
          smtp_check: false, mx_records: false, webmail: false, block: false, disposable: false,
          source: 'fallback', raw: { error: err instanceof Error ? err.message : String(err) },
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, () => worker()))
  return out
}

/**
 * Send-time deliverability gate. Returns true if email passes verification.
 */
export function isSendable(r: HunterVerifyResult): boolean {
  if (r.block || r.disposable) return false
  if (r.status === 'undeliverable') return false
  if (r.status === 'unknown' && r.source === 'hunter') return false // explicitly checked + unknown
  // 'risky' is borderline — accept but downweight
  if (r.status === 'risky' && r.score < 50) return false
  return true
}
