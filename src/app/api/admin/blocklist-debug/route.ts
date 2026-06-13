import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/blocklist-debug — probe the Instantly v2 block-list API to
 * find the correct list + delete endpoints (the add worked via POST
 * /block-lists-entries but the delete 400'd). One-off diagnostic.
 */
const BASE = 'https://api.instantly.ai/api/v2'

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const H = { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }
  const out: Record<string, unknown> = {}

  // Try a few candidate list endpoints; report status + first item shape.
  for (const path of ['/block-lists-entries?limit=3', '/block-lists?limit=3', '/blocklist-entries?limit=3']) {
    try {
      const r = await fetch(`${BASE}${path}`, { headers: H })
      const body = await r.json().catch(() => null)
      const items = (body?.items ?? body?.data ?? body) as unknown
      const first = Array.isArray(items) ? items[0] : (items as { items?: unknown[] })?.items?.[0]
      out[path] = { status: r.status, count: Array.isArray(items) ? items.length : '?', first_keys: first && typeof first === 'object' ? Object.keys(first) : null, first }
    } catch (e) {
      out[path] = { error: (e as Error).message }
    }
  }
  return NextResponse.json({ ok: true, probes: out })
}
