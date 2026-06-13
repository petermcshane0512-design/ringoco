import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/instantly-raw — diagnostic (2026-06-13). Dumps the RAW
 * Instantly v2 analytics + daily + a sample of per-lead engagement counts so
 * we can see the ACTUAL field names. Built because the call board reports
 * "0 clicks" despite link_tracking=ON — the suspicion is we read the wrong
 * key (e.g. link_click_count vs clicks vs link_clicks). This shows truth.
 * Admin-gated, read-only. Safe to delete after the field mapping is fixed.
 */

const BASE = 'https://api.instantly.ai/api/v2'
const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return NextResponse.json({ ok: false, error: 'INSTANTLY_API_KEY not set' }, { status: 503 })
  const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  const today = new Date().toISOString().slice(0, 10)
  const out: Record<string, unknown> = { campaign: CAMPAIGN, today }

  // 1. overall analytics (per-campaign totals)
  try {
    const r = await fetch(`${BASE}/campaigns/analytics`, { headers })
    const j = await r.json()
    const rows = (Array.isArray(j) ? j : j.data ?? []) as Array<Record<string, unknown>>
    const mine = rows.find((c) => c.campaign_id === CAMPAIGN || c.id === CAMPAIGN) ?? rows[0] ?? null
    out.analytics_status = r.status
    out.analytics_keys = mine ? Object.keys(mine) : null
    out.analytics_row = mine
  } catch (e) { out.analytics_error = (e as Error).message }

  // 2. daily analytics (today) — full row so we see sent/opened/clicks keys
  try {
    const r = await fetch(`${BASE}/campaigns/analytics/daily?start_date=${today}&end_date=${today}`, { headers })
    const j = await r.json()
    const rows = (Array.isArray(j) ? j : j.data ?? []) as Array<Record<string, unknown>>
    out.daily_status = r.status
    out.daily_keys = rows[0] ? Object.keys(rows[0]) : null
    out.daily_rows = rows
  } catch (e) { out.daily_error = (e as Error).message }

  // 3. per-lead engagement sample — anyone with click/open counts
  try {
    const r = await fetch(`${BASE}/leads/list`, {
      method: 'POST', headers,
      body: JSON.stringify({ campaign: CAMPAIGN, limit: 100 }),
    })
    const j = await r.json() as { items?: Array<Record<string, unknown>> }
    const items = j.items ?? []
    out.lead_sample_count = items.length
    out.lead_keys = items[0] ? Object.keys(items[0]) : null
    // surface any lead whose any *click* or *open* field is > 0
    const engaged = items
      .map((l) => {
        const e: Record<string, unknown> = { email: l.email }
        for (const k of Object.keys(l)) if (/click|open|reply|sent/i.test(k)) e[k] = l[k]
        return e
      })
      .filter((e) => Object.entries(e).some(([k, v]) => k !== 'email' && Number(v) > 0))
    out.engaged_leads = engaged
    // also show one full lead so we can read free_lead_url / custom vars
    out.one_full_lead = items[0] ?? null
  } catch (e) { out.leads_error = (e as Error).message }

  return NextResponse.json(out)
}
