import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/inbox — today's send count + every reply with its body
 * (2026-06-12). Reads live Instantly: daily analytics for today's sends,
 * leads/list to find repliers, /emails to pull the actual reply text.
 * Admin-gated.
 */

const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const BASE = 'https://api.instantly.ai/api/v2'

function H() {
  return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ ok: false, error: 'INSTANTLY_API_KEY not set' }, { status: 503 })
  }

  // Today's sends — daily analytics. Range = today only (UTC).
  const today = new Date().toISOString().slice(0, 10)
  let sentToday: number | null = null
  let openedToday: number | null = null
  try {
    const r = await fetch(`${BASE}/campaigns/analytics/daily?campaign_id=${CAMPAIGN}&start_date=${today}&end_date=${today}`, { headers: H() })
    if (r.ok) {
      const j = await r.json()
      const rows = Array.isArray(j) ? j : j.data ?? j.days ?? []
      const todayRow = rows.find((x: Record<string, unknown>) => String(x.date ?? '').startsWith(today)) ?? rows[0]
      if (todayRow) {
        sentToday = Number(todayRow.sent ?? todayRow.emails_sent_count ?? todayRow.sent_count ?? 0)
        openedToday = Number(todayRow.opened ?? todayRow.open_count ?? 0)
      }
    }
  } catch { /* fall through */ }

  // Find repliers.
  const repliers: Array<{ email: string; company: string | null; replies: number }> = []
  let cursor: string | undefined
  for (let p = 0; p < 12; p++) {
    const r = await fetch(`${BASE}/leads/list`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ campaign: CAMPAIGN, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
    })
    if (!r.ok) break
    const j = await r.json()
    for (const l of j.items ?? []) {
      if ((l.email_reply_count ?? 0) > 0) {
        repliers.push({
          email: l.email,
          company: l.company_name ?? l.payload?.company_name ?? l.payload?.business_name ?? null,
          replies: l.email_reply_count,
        })
      }
    }
    cursor = j.next_starting_after
    if (!cursor) break
  }

  // Pull each replier's received email bodies.
  const replies: Array<{ email: string; company: string | null; subject: string | null; body: string; at: string | null }> = []
  for (const rl of repliers) {
    try {
      const er = await fetch(`${BASE}/emails?campaign_id=${CAMPAIGN}&lead=${encodeURIComponent(rl.email)}&email_type=received&limit=5`, { headers: H() })
      if (!er.ok) { replies.push({ email: rl.email, company: rl.company, subject: null, body: `(could not load — HTTP ${er.status})`, at: null }); continue }
      const ej = await er.json()
      const items = (ej.items ?? ej.data ?? []) as Array<Record<string, unknown>>
      for (const m of items.slice(0, 3)) {
        const bodyObj = (m.body ?? {}) as Record<string, unknown>
        const text = String(bodyObj.text ?? m.body_text ?? m.content_preview ?? m.snippet ?? '').replace(/\s+/g, ' ').trim()
        replies.push({
          email: rl.email,
          company: rl.company,
          subject: (m.subject as string) ?? null,
          body: text.slice(0, 1500),
          at: (m.timestamp_created as string) ?? (m.created_at as string) ?? null,
        })
      }
    } catch (e) {
      replies.push({ email: rl.email, company: rl.company, subject: null, body: `(error: ${(e as Error).message})`, at: null })
    }
  }

  return NextResponse.json({
    ok: true,
    sent_today: sentToday,
    opened_today: openedToday,
    replier_count: repliers.length,
    replies,
  })
}
