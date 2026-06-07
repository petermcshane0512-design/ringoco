import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
// Chicago Socrata responses can be slow under load (especially the
// reverse-geocode-to-ZIP loop). Bumped from 60→300 after the 2026-06-06
// backfill test silently timed out with no response logged.
export const maxDuration = 300

/**
 * GET /api/crons/scrape-permits-chicago
 *
 * Pulls building permits from the City of Chicago Socrata API, filters
 * to the 5 trades we serve (HVAC, plumbing, electrical, roofing,
 * handyman), reverse-geocodes lat/lng → ZIP via zip_centroids, writes
 * each permit as a lead.
 *
 * Source: data.cityofchicago.org Permits (resource ydr8-5enu).
 * Address-level granularity, includes work_description + reported_cost.
 * Free, no key required.
 *
 * Runs daily 5am UTC. Idempotent — dedups via (street_address, source)
 * UNIQUE on leads.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CHICAGO_PERMITS_BASE = 'https://data.cityofchicago.org/resource/ydr8-5enu.json'

type RawPermit = {
  id?: string
  permit_?: string
  permit_type?: string
  work_description?: string
  issue_date?: string
  street_number?: string
  street_direction?: string
  street_name?: string
  reported_cost?: string | number
  latitude?: string | number
  longitude?: string | number
}

function classifyTrades(p: RawPermit): string[] {
  const blob = `${p.permit_type || ''} ${p.work_description || ''}`.toLowerCase()
  const trades = new Set<string>()
  if (/\b(hvac|mechanical|a\/?c|air condition|furnace|heat pump|cooling|boiler)\b/.test(blob)) trades.add('hvac')
  if (/\b(plumb|water heater|gas line|sewer|drain|toilet|bath)\b/.test(blob)) trades.add('plumbing')
  if (/\b(electric|panel|service upgrade|ev charger|solar|wiring|lighting)\b/.test(blob)) trades.add('electrical')
  if (/\b(roof|shingle|reroof|skylight|gutter)\b/.test(blob)) trades.add('roofing')
  if (/\b(porch|deck|fence|garage|handyman|general|repair|renovat|remodel)\b/.test(blob)) trades.add('handyman')
  // New SFR / multi-family new construction triggers HVAC + plumbing + electrical
  if (/\b(new construction|sfr|single family|multi-family|residential new)\b/.test(blob)) {
    trades.add('hvac')
    trades.add('plumbing')
    trades.add('electrical')
  }
  return [...trades]
}

function buildAddress(p: RawPermit): string {
  const parts = [p.street_number, p.street_direction, p.street_name].filter(Boolean)
  return parts.join(' ').trim() || `Chicago permit ${p.id || p.permit_ || 'unknown'}`
}

async function nearestZip(lat: number, lng: number): Promise<string | null> {
  // Find the closest zip_centroid via haversine. We bound the search by
  // a ±0.5° lat/lng box first (≈35mi) so we don't scan all 44K rows.
  const { data } = await supabase.rpc('zips_within_miles', { primary_zip: '60601', radius_mi: 30 })
  if (!data || !Array.isArray(data)) return null
  // Fall back to manual nearest-lookup if rpc helper doesn't cover this point
  const { data: candidates } = await supabase
    .from('zip_centroids')
    .select('zip, lat, lng')
    .gte('lat', lat - 0.5)
    .lte('lat', lat + 0.5)
    .gte('lng', lng - 0.5)
    .lte('lng', lng + 0.5)
  if (!candidates || candidates.length === 0) return null
  let bestZip: string | null = null
  let bestDist = Infinity
  for (const c of candidates as Array<{ zip: string; lat: number; lng: number }>) {
    const d = Math.hypot(c.lat - lat, c.lng - lng)
    if (d < bestDist) {
      bestDist = d
      bestZip = c.zip
    }
  }
  return bestZip
}

function scorePermit(p: RawPermit, trades: string[]): number {
  // Base 50. Boost by reported cost (size of job) + recency.
  let s = 50
  const cost = Number(p.reported_cost || 0)
  if (cost > 50000) s += 20
  else if (cost > 10000) s += 12
  else if (cost > 1000) s += 6
  // Recency: permit issued in last 30d = +15
  if (p.issue_date) {
    const ageDays = (Date.now() - new Date(p.issue_date).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays < 30) s += 15
    else if (ageDays < 90) s += 8
  }
  if (trades.length >= 3) s += 5
  return Math.min(100, s)
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Pull permits issued in the last 14 days (default) — covers daily cron
  // safely with overlap-dedup. Socrata $where SoQL accepts ISO timestamps.
  const url = new URL(req.url)
  const lookbackDays = parseInt(url.searchParams.get('days') ?? '14', 10)
  const limit = Math.min(2000, parseInt(url.searchParams.get('limit') ?? '500', 10))
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const soqlWhere = `issue_date >= '${since}'`
  const fetchUrl = `${CHICAGO_PERMITS_BASE}?$where=${encodeURIComponent(soqlWhere)}&$limit=${limit}&$order=issue_date DESC`

  let raw: RawPermit[] = []
  try {
    const r = await fetch(fetchUrl)
    if (!r.ok) return NextResponse.json({ error: `Chicago HTTP ${r.status}` }, { status: 502 })
    raw = await r.json()
  } catch (e) {
    return NextResponse.json({ error: `Chicago fetch err: ${(e as Error).message}` }, { status: 502 })
  }

  let classified = 0
  let inserted = 0
  let skippedNoTrade = 0
  let skippedNoGeo = 0

  // Batch lead rows so we make one upsert per ~100 permits, not one per.
  const leadRows: Array<{
    street_address: string
    zip: string
    source: string
    source_event_date: string
    source_details: Record<string, unknown>
    lead_score: number
    trade_match: string[]
  }> = []

  for (const p of raw) {
    const trades = classifyTrades(p)
    if (trades.length === 0) { skippedNoTrade++; continue }
    const lat = Number(p.latitude)
    const lng = Number(p.longitude)
    if (!isFinite(lat) || !isFinite(lng)) { skippedNoGeo++; continue }

    const zip = await nearestZip(lat, lng)
    if (!zip) { skippedNoGeo++; continue }

    classified++
    leadRows.push({
      street_address: `${buildAddress(p)} · Chicago IL`,
      zip,
      source: 'permit',
      source_event_date: p.issue_date || new Date().toISOString(),
      source_details: {
        city: 'Chicago',
        permit_id: p.id || p.permit_ || null,
        permit_type: p.permit_type || null,
        work_description: (p.work_description || '').slice(0, 240),
        reported_cost: p.reported_cost ? Number(p.reported_cost) : null,
        issue_date: p.issue_date || null,
      },
      lead_score: scorePermit(p, trades),
      trade_match: trades,
    })

    // Flush every 100
    if (leadRows.length >= 100) {
      const { error } = await supabase
        .from('leads')
        .upsert(leadRows.splice(0), { onConflict: 'street_address,source', ignoreDuplicates: true })
      if (!error) inserted += 100
    }
  }

  // Final flush
  if (leadRows.length > 0) {
    const count = leadRows.length
    const { error } = await supabase
      .from('leads')
      .upsert(leadRows, { onConflict: 'street_address,source', ignoreDuplicates: true })
    if (!error) inserted += count
  }

  return NextResponse.json({
    ok: true,
    source: 'chicago_permits',
    permits_fetched: raw.length,
    permits_classified: classified,
    skipped_no_trade: skippedNoTrade,
    skipped_no_geo: skippedNoGeo,
    leads_inserted_or_dedup: inserted,
    checked_at: new Date().toISOString(),
  })
}
