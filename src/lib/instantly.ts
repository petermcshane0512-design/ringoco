import type { InstantlyLeadPayload } from './leadTypes'

const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

/**
 * Push enriched + personalized leads into a named Instantly campaign.
 * No-op (logs only) when INSTANTLY_API_KEY is missing — lets the
 * orchestrator run end-to-end without keys for testing.
 *
 * Returns count of leads successfully pushed.
 */
export async function pushLeadsToInstantly(opts: {
  campaignId: string
  leads: InstantlyLeadPayload[]
}): Promise<{ pushed: number; errors: number }> {
  if (!INSTANTLY_KEY) {
    console.log(`[instantly mock] would push ${opts.leads.length} leads to campaign ${opts.campaignId}`)
    return { pushed: opts.leads.length, errors: 0 }
  }

  let pushed = 0
  let errors = 0

  // Instantly v2 supports bulk add via POST /leads with up to 100 per batch
  const batchSize = 100
  for (let i = 0; i < opts.leads.length; i += batchSize) {
    const batch = opts.leads.slice(i, i + batchSize)
    try {
      const res = await fetch(`${INSTANTLY_BASE}/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${INSTANTLY_KEY}`,
        },
        body: JSON.stringify({
          campaign: opts.campaignId,
          leads: batch.map((l) => ({
            email: l.email,
            first_name: l.first_name,
            last_name: l.last_name,
            company_name: l.company_name,
            personalization: l.custom_variables.ai_opening,
            custom_variables: l.custom_variables,
          })),
          skip_if_in_workspace: true,
          skip_if_in_campaign: true,
          verify_leads_for_lead_finder: false,
        }),
      })
      if (!res.ok) {
        errors += batch.length
        console.error(`[instantly] batch failed ${res.status}:`, await res.text())
      } else {
        pushed += batch.length
      }
    } catch (e) {
      errors += batch.length
      console.error('[instantly] batch threw:', e)
    }
  }

  return { pushed, errors }
}

/** Verify Instantly webhook signature (HMAC-SHA256 of raw body with INSTANTLY_WEBHOOK_SECRET).
 *
 * Fails CLOSED. If INSTANTLY_WEBHOOK_SECRET is unset:
 *   - In NODE_ENV=development, allow (local dev convenience).
 *   - In any other env, REJECT. Previously returned true when unset which
 *     meant a single missed env var made the production endpoint accept
 *     unsigned webhooks. Security audit 2026-05-27. */
export async function verifyInstantlyWebhook(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = process.env.INSTANTLY_WEBHOOK_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[instantly] INSTANTLY_WEBHOOK_SECRET unset — allowing in dev only')
      return true
    }
    console.error('[instantly] INSTANTLY_WEBHOOK_SECRET unset in non-dev env — rejecting webhook')
    return false
  }
  if (!signatureHeader) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
  const computedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  // Constant-time compare to avoid timing-leak on the prefix
  const expected = signatureHeader.replace(/^sha256=/, '')
  if (computedHex.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < computedHex.length; i++) mismatch |= computedHex.charCodeAt(i) ^ expected.charCodeAt(i)
  return mismatch === 0
}
