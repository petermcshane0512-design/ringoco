import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/debug-hand-raises
 *
 * Diagnostic — hits Instantly v2 leads/list from PRODUCTION and returns
 * raw counts so we can verify what the /admin/hand-raises page sees.
 *
 * Usage from terminal:
 *   curl -H "x-admin-secret: $ADMIN_API_SECRET" https://www.bellavego.com/api/admin/debug-hand-raises
 */

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return NextResponse.json({ ok: false, error: 'INSTANTLY_API_KEY missing on Vercel' }, { status: 500 })

  const all: Array<{ email?: string; email_open_count?: number; email_click_count?: number; email_reply_count?: number; campaign?: string; id?: string; company_name?: string }> = []
  const pageMeta: Array<{ page: number; status: number; count: number; cursor: string | null }> = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = { limit: 100 }
    if (cursor) body.starting_after = cursor
    const r = await fetch('https://api.instantly.ai/api/v2/leads/list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      pageMeta.push({ page, status: r.status, count: 0, cursor: cursor ?? null })
      break
    }
    const j = await r.json()
    const batch = (j.items || j.data || []) as typeof all
    all.push(...batch)
    pageMeta.push({ page, status: r.status, count: batch.length, cursor: (cursor ?? null) })
    cursor = j.next_starting_after as string | undefined
    if (!cursor) break
  }

  const ours = all.filter((l) => l.campaign === CAMPAIGN_ID)
  const hot = ours.filter((l) => (l.email_open_count || 0) >= 3 || (l.email_click_count || 0) >= 1)
  const clickers = ours.filter((l) => (l.email_click_count || 0) >= 1)

  return NextResponse.json({
    ok: true,
    instantly_key_set: !!KEY,
    campaign_id: CAMPAIGN_ID,
    page_meta: pageMeta,
    counts: {
      total_returned_all_campaigns: all.length,
      our_campaign: ours.length,
      hand_raisers: hot.length,
      clickers: clickers.length,
    },
    sample_hot: hot.slice(0, 5).map((l) => ({
      email: l.email,
      business: l.company_name,
      opens: l.email_open_count,
      clicks: l.email_click_count,
      replies: l.email_reply_count,
    })),
  })
}
