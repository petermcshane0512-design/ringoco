import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/admin/campaign-detail — dump the campaign's tracking settings +
 * sequence step bodies (2026-06-12) so we can see whether link-tracking is
 * on and read the actual CTA copy that prospects get. Admin-gated.
 */
const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const BASE = 'https://api.instantly.ai/api/v2'

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) return NextResponse.json({ ok: false, error: 'no key' }, { status: 503 })
  const headers = { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }

  const r = await fetch(`${BASE}/campaigns/${CAMPAIGN}`, { headers })
  if (!r.ok) return NextResponse.json({ ok: false, error: `HTTP ${r.status}`, body: (await r.text()).slice(0, 300) }, { status: 502 })
  const c = await r.json()

  // Pull the sequence step bodies — shapes vary across Instantly versions.
  const seq = c.sequences ?? c.campaign_schedule?.sequences ?? []
  const steps: Array<{ subject: string | null; body: string }> = []
  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return
    const o = obj as Record<string, unknown>
    if (typeof o.subject === 'string' || typeof o.body === 'string') {
      steps.push({
        subject: (o.subject as string) ?? null,
        body: String(o.body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
      })
    }
    for (const v of Object.values(o)) {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') walk(v)
    }
  }
  walk(seq)

  return NextResponse.json({
    ok: true,
    name: c.name,
    status: c.status,
    link_tracking: c.link_tracking ?? c.track_links ?? c.tracking?.links ?? null,
    open_tracking: c.open_tracking ?? c.track_opens ?? c.tracking?.opens ?? null,
    daily_limit: c.daily_limit ?? c.campaign_schedule?.daily_limit ?? null,
    raw_tracking_keys: Object.keys(c).filter((k) => /track|link|open|limit/i.test(k)),
    step_count: steps.length,
    steps,
  })
}
