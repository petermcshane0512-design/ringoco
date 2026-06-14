import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/maximize-inboxes — squeeze every SAFE send for tomorrow
 * (2026-06-13 per Peter "send as many as possible"). Does NOT fight warmup —
 * it only recovers inboxes that are misconfigured BELOW their healthy peers.
 *
 * Logic: peers are at daily_limit=30. Any CONNECTED (status=1) inbox sitting
 * below the target gets bumped to it. Inboxes that are disconnected / erroring
 * are LEFT ALONE (bumping a sick inbox = spam risk). GET = dry report only.
 *
 * Note: 30 is the per-inbox CAP, not actual output — Instantly's warmup still
 * throttles real sends below it. This just stops 2 inboxes wasting at 0.
 */

const BASE = 'https://api.instantly.ai/api/v2'
const TARGET_LIMIT = 30

function H() {
  return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }
}

type Acct = { email: string; status?: number; warmup_status?: number; daily_limit?: number }

async function listAccounts(): Promise<Acct[]> {
  const out: Acct[] = []
  let cursor: string | undefined
  for (let p = 0; p < 6; p++) {
    const url = new URL(`${BASE}/accounts`)
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('starting_after', cursor)
    const r = await fetch(url, { headers: H() })
    if (!r.ok) break
    const j = await r.json() as { items?: Acct[]; next_starting_after?: string }
    for (const a of j.items ?? []) out.push(a)
    cursor = j.next_starting_after
    if (!cursor) break
  }
  return out
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) return NextResponse.json({ ok: false, error: 'no key' }, { status: 503 })
  const accts = await listAccounts()
  const configuredCap = accts.reduce((s, a) => s + (a.status === 1 ? (a.daily_limit ?? 0) : 0), 0)
  const wasting = accts.filter((a) => a.status === 1 && (a.daily_limit ?? 0) < TARGET_LIMIT)
  return NextResponse.json({
    ok: true,
    total: accts.length,
    active: accts.filter((a) => a.status === 1).length,
    configured_daily_cap: configuredCap,
    below_target: wasting.map((a) => ({ email: a.email, daily_limit: a.daily_limit, warmup: a.warmup_status })),
    accounts: accts.map((a) => ({ email: a.email, status: a.status, warmup: a.warmup_status, daily_limit: a.daily_limit })),
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) return NextResponse.json({ ok: false, error: 'no key' }, { status: 503 })
  const dry = req.nextUrl.searchParams.get('dry') === '1'

  const accts = await listAccounts()
  // Only touch CONNECTED inboxes below target. Never a disconnected/sick one.
  const targets = accts.filter((a) => a.status === 1 && (a.daily_limit ?? 0) < TARGET_LIMIT)

  const results: Array<{ email: string; from: number | undefined; to: number; ok: boolean; error?: string }> = []
  for (const a of targets) {
    if (dry) { results.push({ email: a.email, from: a.daily_limit, to: TARGET_LIMIT, ok: true }); continue }
    // Instantly v2: update the account's daily_limit.
    const r = await fetch(`${BASE}/accounts/${encodeURIComponent(a.email)}`, {
      method: 'PATCH', headers: H(), body: JSON.stringify({ daily_limit: TARGET_LIMIT }),
    })
    const ok = r.ok
    results.push({ email: a.email, from: a.daily_limit, to: TARGET_LIMIT, ok, error: ok ? undefined : `HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 120)}` })
  }

  const newCap = accts.reduce((s, a) => {
    if (a.status !== 1) return s
    const bumped = targets.find((t) => t.email === a.email)
    return s + (bumped ? TARGET_LIMIT : (a.daily_limit ?? 0))
  }, 0)

  return NextResponse.json({ ok: true, dry, bumped: results.length, results, new_configured_cap: newCap })
}
