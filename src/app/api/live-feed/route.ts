import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const revalidate = 0

/**
 * GET /api/live-feed — public, ZIP-level lead-discovery events for the
 * homepage LiveLeadFeed ticker.
 *
 * HONESTY CONTRACT (Peter rule 2026-06-10: no fabricated counts/events on
 * customer-facing surfaces): every row returned here is a REAL row from
 * the `leads` table written by the permit/storm/MLS scrapers or BatchData
 * discovery. No PII leaves this route — ZIP + signal type + truncated
 * work description only. Never street_address, owner name, or phone.
 *
 * The ticker component hides itself when this returns < 6 rows, so an
 * empty pool never renders an empty/fake feed.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type FeedRow = {
  zip: string
  source: string
  trade_match: string[] | null
  source_details: Record<string, unknown> | null
  created_at: string
}

function labelFor(row: FeedRow): string {
  const d = row.source_details || {}
  if (row.source === 'permit') {
    const work = (d.work_description as string) || (d.permit_type as string) || ''
    return work ? `Permit filed · ${work.slice(0, 48)}` : 'Building permit filed'
  }
  if (row.source === 'noaa_storm') {
    const mag = (d.magnitude as string) || ''
    return mag ? `NOAA storm verified · ${mag}` : 'NOAA storm strike verified'
  }
  if (row.source === 'mls_movein' || row.source === 'move_in') {
    return 'New homeowner · recent sale recorded'
  }
  if (row.source === 'batchdata') {
    return 'Owner-occupied home matched'
  }
  return 'Homeowner signal detected'
}

export async function GET() {
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const [feed, pool, fresh] = await Promise.all([
    supabase
      .from('leads')
      .select('zip, source, trade_match, source_details, created_at')
      .neq('source', 'aging_hvac')
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .neq('source', 'aging_hvac'),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .neq('source', 'aging_hvac')
      .gte('created_at', since24h),
  ])

  if (feed.error || !feed.data) {
    return NextResponse.json({ ok: false, events: [], stats: null }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  }

  // Dedupe identical-looking ticker items. The scrapers write many permit
  // rows with no work_description, all of which collapse to the generic
  // "Building permit filed" label — rendering a wall of repeats. Keep the
  // newest occurrence of each distinct zip+label signal. Rows are already
  // sorted newest-first, so first-seen wins.
  const seen = new Set<string>()
  const events: { zip: string; label: string; trade: string | null; at: string }[] = []
  for (const row of feed.data as FeedRow[]) {
    const label = labelFor(row)
    const key = `${row.zip}|${label}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push({
      zip: row.zip,
      label,
      trade: (row.trade_match && row.trade_match[0]) || null,
      at: row.created_at,
    })
    if (events.length >= 24) break
  }

  // Real counts only — UI hides any stat that comes back null/0.
  const stats = {
    pool: pool.count ?? null,
    last_24h: fresh.count ?? null,
  }

  return NextResponse.json({ ok: true, events, stats }, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
  })
}
