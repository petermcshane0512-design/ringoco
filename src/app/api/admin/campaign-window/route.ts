import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/admin/campaign-window?to=21:00&from=09:00 — widen the campaign's
 * daily send window (2026-06-12). The campaign was paused all morning, so
 * extending the window into the evening lets Instantly ship the rest of the
 * daily cap tonight instead of stopping at 5pm. Per-inbox 30/day still caps
 * volume, so this can't over-send — it only spreads the same cap over more
 * hours. Admin-gated.
 */
const CAMPAIGN = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const BASE = 'https://api.instantly.ai/api/v2'

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) return NextResponse.json({ ok: false, error: 'no key' }, { status: 503 })
  const headers = { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }

  const from = req.nextUrl.searchParams.get('from') || '09:00'
  const to = req.nextUrl.searchParams.get('to') || '21:00'
  // 2026-06-14 — ?days=all turns on all 7 days (Instantly day keys: 0=Sun..6=Sat).
  // Per Peter: send Sundays too ("might as well shoot"). Omit to preserve days.
  const daysParam = req.nextUrl.searchParams.get('days')

  // Read current schedule to preserve days + timezone + name.
  const cr = await fetch(`${BASE}/campaigns/${CAMPAIGN}`, { headers })
  if (!cr.ok) return NextResponse.json({ ok: false, error: `read HTTP ${cr.status}` }, { status: 502 })
  const c = await cr.json()
  const sched = c.campaign_schedule?.schedules?.[0]
  if (!sched) return NextResponse.json({ ok: false, error: 'no schedule found' }, { status: 422 })

  const days = daysParam === 'all'
    ? { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true }
    : sched.days

  const newSchedule = {
    schedules: [{
      ...sched,
      days,
      timing: { from, to },
    }],
  }

  const pr = await fetch(`${BASE}/campaigns/${CAMPAIGN}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ campaign_schedule: newSchedule }),
  })
  const body = await pr.text()
  if (!pr.ok) return NextResponse.json({ ok: false, error: `PATCH HTTP ${pr.status}`, body: body.slice(0, 300) }, { status: 502 })
  return NextResponse.json({
    ok: true,
    old_window: sched.timing,
    new_window: { from, to },
    old_days: sched.days,
    new_days: days,
    timezone: sched.timezone,
  })
}
