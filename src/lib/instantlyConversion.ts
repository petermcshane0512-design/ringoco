/**
 * lib/instantlyConversion — wires real Stripe revenue into Instantly's
 * conversion-tracking column so campaign analytics show only the actual
 * amounts paid ($97 first month, $497 monthly thereafter) and never the
 * stale pre-pivot $147 placeholder.
 *
 * Behavior:
 *   1. Look up the lead in Instantly by email via /leads/list
 *   2. PATCH the lead with status='customer' + payload.paid_amount + paid_at
 *   3. Best-effort — failures log but never block the webhook
 *
 * Called from /api/stripe/webhook on invoice.payment_succeeded.
 */

const BASE = 'https://api.instantly.ai/api/v2'

type InstantlyLead = {
  id?: string
  email?: string
  payload?: Record<string, unknown>
}

export async function markInstantlyConversion(args: {
  email: string
  amountCents: number
  promoCode?: string
  isFirstPaid?: boolean
}): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.INSTANTLY_API_KEY
  if (!key) return { ok: false, reason: 'INSTANTLY_API_KEY not set' }
  if (!args.email) return { ok: false, reason: 'no email' }

  try {
    // 1) Find lead by email — Instantly v2 /leads/list supports a `search`
    //    filter that matches against email.
    const listRes = await fetch(`${BASE}/leads/list`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        search: args.email,
        limit: 10,
      }),
    })
    if (!listRes.ok) return { ok: false, reason: `list HTTP ${listRes.status}` }
    const listJson = (await listRes.json().catch(() => ({}))) as { items?: InstantlyLead[] }
    const items = listJson.items || []
    const match = items.find((it) => (it.email || '').toLowerCase() === args.email.toLowerCase())
    if (!match?.id) return { ok: false, reason: 'lead not in any Instantly campaign' }

    // 2) PATCH lead — mark as customer + stamp real amount. The combined
    //    keys cover Instantly's various analytics readouts (some surfaces
    //    read `status`, some read `lead_status`, some read payload).
    const amountDollars = Math.round(args.amountCents / 100)
    const patchBody = {
      // Instantly status enum approximations — some versions accept
      // numeric, some accept string. Send both.
      status: 4,             // 4 = CUSTOMER in older Instantly API
      lead_status: 'CUSTOMER',
      payload: {
        ...(match.payload || {}),
        paid_amount_cents: args.amountCents,
        paid_amount_dollars: amountDollars,
        paid_at: new Date().toISOString(),
        is_first_paid: !!args.isFirstPaid,
        promo_code: args.promoCode || '',
      },
    }

    const patchRes = await fetch(`${BASE}/leads/${match.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchBody),
    })
    if (!patchRes.ok) {
      const txt = await patchRes.text().catch(() => '')
      return { ok: false, reason: `patch HTTP ${patchRes.status}: ${txt.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}
