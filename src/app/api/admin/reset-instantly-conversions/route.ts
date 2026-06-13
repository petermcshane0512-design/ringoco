import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/reset-instantly-conversions — 2026-06-13 per Peter.
 *
 * Wipes any stale opportunity / conversion values on leads in the
 * HVAC Q3 campaign. The $147 placeholder showing on Analytics came from
 * a lead manually tagged weeks ago when Starter tier was $147; after the
 * pivot to $97/$497 those values are wrong.
 *
 * Goes forward: real Stripe webhook auto-stamps proper $97 / $497 via
 * lib/instantlyConversion.
 */

const BASE = 'https://api.instantly.ai/api/v2'
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

type LeadShape = {
  id?: string
  email?: string
  status?: number | string | null
  lead_status?: string | null
  interest_status?: number | string | null
  interest_value?: number | null
  payload?: Record<string, unknown> | null
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const key = process.env.INSTANTLY_API_KEY
  if (!key) return NextResponse.json({ ok: false, error: 'INSTANTLY_API_KEY not set' }, { status: 500 })

  let cursor: string | undefined
  let scanned = 0
  let reset = 0
  const errors: string[] = []

  for (let page = 0; page < 12; page++) {
    const r = await fetch(`${BASE}/leads/list`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaign: CAMPAIGN_ID,
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      }),
    })
    if (!r.ok) { errors.push(`list HTTP ${r.status}`); break }
    const j = (await r.json().catch(() => ({}))) as { items?: LeadShape[]; next_starting_after?: string }
    const items = j.items || []
    if (items.length === 0) break

    for (const it of items) {
      scanned++
      const payload = it.payload || {}
      const statusVal = it.status
      // 2026-06-13 — Instantly tracks "Opportunity" via the interest_status
      // field (the badge in the UI). Earlier reset only cleared payload
      // values + status, missing interest_status. Now nuke all 3 paths
      // so the campaign Analytics column actually resets.
      const isOpp =
        statusVal === 'OPPORTUNITY' || statusVal === 3
        || it.lead_status === 'OPPORTUNITY'
        || it.interest_status === 3 || it.interest_status === 'OPPORTUNITY'
        || (typeof it.interest_value === 'number' && it.interest_value > 0)
      const hasStaleAmount = typeof payload.opportunity_value === 'number'
        || typeof payload.conversion_value === 'number'
        || typeof payload.deal_value === 'number'
        || typeof payload.paid_amount_dollars === 'number'

      if (!isOpp && !hasStaleAmount) continue

      try {
        const cleared = { ...payload }
        delete cleared.opportunity_value
        delete cleared.conversion_value
        delete cleared.deal_value
        delete cleared.paid_amount_dollars
        delete cleared.paid_amount_cents
        delete cleared.paid_at
        delete cleared.is_first_paid

        const pr = await fetch(`${BASE}/leads/${it.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 1,                // ACTIVE
            lead_status: 'ACTIVE',
            interest_status: 0,       // unset opportunity badge
            interest_value: 0,        // strip the dollar tag
            payload: cleared,
          }),
        })
        if (pr.ok) reset++
        else if (errors.length < 10) errors.push(`${it.email}: PATCH ${pr.status}`)
      } catch (e) {
        if (errors.length < 10) errors.push(`${it.email}: ${(e as Error).message}`)
      }
      await new Promise((res) => setTimeout(res, 80))
    }

    cursor = j.next_starting_after
    if (!cursor) break
  }

  return NextResponse.json({
    ok: true,
    scanned,
    reset,
    errors: errors.length ? errors : undefined,
    next: 'Real Stripe payments will repopulate the analytics with actual $97 / $497 values via lib/instantlyConversion.',
  })
}
