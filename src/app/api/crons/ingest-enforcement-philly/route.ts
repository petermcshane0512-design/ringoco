import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyCronAuth, recordCronStart, recordCronFinish } from '@/lib/cronRuns'
import { scoreForTier, urgencyLabel, buildPitch, whyTags } from '@/lib/enforcementTriggers'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/ingest-enforcement-philly — 2026-06-13. Third enforcement
 * metro after Chicago + NYC (verified live before build: phl.carto.com L&I
 * violations returns readable titles, geocoded points, owner names, recent
 * dates — comparable richness to NYC HPD).
 *
 * Philadelphia is a massive rowhome market — masonry, roofing, structural,
 * exterior — exactly the trades enforcement leads convert best for. Source:
 * L&I Code Violations via the Carto SQL API (phl.carto.com/api/v2/sql).
 *
 * Philly uses STANDARDIZED violationcodetitle values (not free text), so we
 * map title -> engine trade + urgency tier explicitly (more reliable than
 * keyword-matching). Only trade-relevant, currently-open violations ingest;
 * weeds/rubbish/rental-license/zoning titles are skipped.
 *
 * Same model as NYC/Chicago: one lead per violation address, lat/lng for
 * day-one map pins, urgency label + legal-pressure pitch, dedup
 * (street_address+source UNIQUE), weekly cadence + drop-time skip-trace.
 *
 * Query params: ?days=120 lookback, ?limit=2000, ?trades=roofing,...
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CARTO = 'https://phl.carto.com/api/v2/sql'

// Philly L&I titles are UPPERCASE free-ish text with inconsistent spacing
// ("PLUMBING SYSTEMS- GENERAL", "REPLACE ROOF COVERING", "UNSAFE
// STRUCTURE") — so classify by KEYWORD, not exact match. Returns the
// engine trade + urgency tier, or null to skip (weeds/rubbish/license/etc).
// tier 1 = imminent/unsafe, 2 = active building-system defect, 3 = exterior.
function classifyPhilly(titleRaw: string): { trades: string[]; tier: 1 | 2 | 3 } | null {
  const t = (titleRaw || '').toUpperCase()
  // Nuisance/landscaping/admin citations are NOT building-trade work — drop
  // before the (greedy) EXTERIOR catch grabs "EXTERIOR AREA WEEDS" etc.
  if (/\b(WEED|RUBBISH|GARBAGE|SANITATION|TRASH|MOTOR VEHICLE|TREE|GRAFFITI|LICENSE|ZONING|POSTING|PERMIT|FEE|REGISTRATION|SIGN\b|INSURANCE)\b/.test(t)) return null
  const unsafe = /\b(UNSAFE|IMMINENT|DANGEROUS|HAZARD|COLLAPSE)\b/.test(t)
  // Order matters — most specific trade first.
  if (/\bROOF\b/.test(t))                                      return { trades: ['roofing'], tier: unsafe ? 1 : 2 }
  if (/\bPLUMB|SANITARY|WATER (HEAT|SUPPLY|GENERAL)|DRAIN/.test(t)) return { trades: ['plumbing'], tier: unsafe ? 1 : 2 }
  if (/\bELECTRIC/.test(t))                                    return { trades: ['electrical'], tier: unsafe ? 1 : 2 }
  if (/\b(HEAT|HVAC|MECHANIC|BOILER|FURNACE|FUEL)\b/.test(t))  return { trades: ['hvac'], tier: unsafe ? 1 : 2 }
  // Structural / masonry / exterior → handyman (covers masonry, tuckpointing,
  // facade, parapet, exterior walls, vacant-structure repair, paint, windows).
  if (/\b(STRUCTUR|EXTERIOR|MASONRY|FACADE|PARAPET|FOUNDATION|WALL|VACANT|WINDOW|DOOR|STAIR|INTERIOR SURFACE|PROTECTIVE TREATMENT|ALTER)\b/.test(t)) {
    return { trades: ['handyman'], tier: unsafe ? 1 : 3 }
  }
  return null
}
const ACTIVE_STATUS = ['IN VIOLATION', 'UNDER INVESTIGATION', 'IN VIOLATION - COURT', 'SVN ISSUED, BALANCE DUE']

type CartoRow = {
  address?: string; zip?: string
  lat?: number | string | null; lng?: number | string | null
  violationcodetitle?: string; violationdate?: string; casestatus?: string; opa_owner?: string
}

export async function GET(req: NextRequest) {
  const startedAtMs = Date.now()
  const mode = classifyCronAuth(req, process.env.ADMIN_API_SECRET)
  const cronRunId = await recordCronStart('ingest-enforcement-philly', mode)
  if (mode === 'unauthorized') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '120', 10)
  const limit = Math.min(10000, parseInt(url.searchParams.get('limit') ?? '2000', 10))
  const tradeFilter = (url.searchParams.get('trades') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const counts = { fetched: 0, trade_matched: 0, skipped_no_geo: 0, skipped_no_trade: 0, errors: [] as string[] }

  // Pull recent ACTIVE violations; classify by keyword in code below.
  // geocode_x/geocode_y are PA State Plane (feet) and overflow lat/lng cols —
  // use ST_Y/ST_X(the_geom) which returns proper WGS84 lat/lng (Philly's
  // the_geom is EPSG:4326). NULL geom -> null coords (leads/list backfills).
  const statusList = ACTIVE_STATUS.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')
  const sql = `SELECT address, zip, ST_X(the_geom) AS lng, ST_Y(the_geom) AS lat, ` +
    `violationcodetitle, violationdate, casestatus, opa_owner ` +
    `FROM violations WHERE violationdate > '${since}' AND casestatus IN (${statusList}) ` +
    `ORDER BY violationdate DESC LIMIT ${limit}`

  let rows: CartoRow[] = []
  try {
    const r = await fetch(`${CARTO}?q=${encodeURIComponent(sql)}`)
    if (!r.ok) {
      await recordCronFinish(cronRunId, false, { http: r.status }, startedAtMs)
      return NextResponse.json({ error: `carto HTTP ${r.status}` }, { status: 502 })
    }
    const j = await r.json() as { rows?: CartoRow[]; error?: string[] }
    if (j.error) {
      await recordCronFinish(cronRunId, false, { carto_error: j.error }, startedAtMs)
      return NextResponse.json({ error: `carto: ${j.error.join('; ')}` }, { status: 502 })
    }
    rows = j.rows ?? []
  } catch (e) {
    await recordCronFinish(cronRunId, false, { fetch_err: (e as Error).message }, startedAtMs)
    return NextResponse.json({ error: `carto fetch err: ${(e as Error).message}` }, { status: 502 })
  }
  counts.fetched = rows.length

  // One lead per address, highest-severity (lowest tier number) wins.
  const byAddr = new Map<string, { row: CartoRow; trades: string[]; tier: 1 | 2 | 3 }>()
  for (const r of rows) {
    const map = classifyPhilly(r.violationcodetitle ?? '')
    if (!map) { counts.skipped_no_trade++; continue }
    if (tradeFilter.length && !map.trades.some((t) => tradeFilter.includes(t))) continue
    const addr = (r.address || '').replace(/\s+/g, ' ').trim()
    if (!addr) { counts.skipped_no_geo++; continue }
    const key = addr.toUpperCase()
    const existing = byAddr.get(key)
    if (!existing || map.tier < existing.tier) byAddr.set(key, { row: r, trades: map.trades, tier: map.tier })
    counts.trade_matched++
  }

  const rowsOut: Record<string, unknown>[] = []
  for (const { row, trades, tier } of byAddr.values()) {
    const addr = (row.address || '').replace(/\s+/g, ' ').trim()
    // Guard: only accept sane WGS84; anything else (null/state-plane leak) → null.
    const latN = row.lat != null && row.lat !== '' ? Number(row.lat) : null
    const lngN = row.lng != null && row.lng !== '' ? Number(row.lng) : null
    const lat = latN != null && latN >= -90 && latN <= 90 ? latN : null
    const lng = lngN != null && lngN >= -180 && lngN <= 180 ? lngN : null
    const title = row.violationcodetitle || 'Code violation'
    const desc = `${title} — ${row.casestatus || 'open'}`

    rowsOut.push({
      street_address: addr,
      city: 'Philadelphia',
      state: 'PA',
      zip: (row.zip || '').slice(0, 10),
      lat: Number.isFinite(lat as number) ? lat : null,
      lng: Number.isFinite(lng as number) ? lng : null,
      owner_name: row.opa_owner || null,   // redacted to "Verified homeowner" at showcase if entity
      source: 'permit',  // enum-safe; trigger_type carries the truth
      source_event_date: row.violationdate || new Date().toISOString(),
      source_details: {
        city: 'Philadelphia',
        provider: 'enforcement',
        market: 'philly',
        trigger_type: 'violation',
        urgency_tier: tier,
        urgency_label: urgencyLabel('violation', { date: row.violationdate ?? null, fine: null, tradeLabel: title }),
        violation_title: title,
        case_status: row.casestatus || null,
        description: desc.slice(0, 220),
        why_tags: whyTags('violation', { date: row.violationdate ?? null, desc: title }),
      },
      lead_score: scoreForTier(tier),
      pitch_script: buildPitch('violation', desc, { fine: null, date: row.violationdate ?? null }),
      trade_match: trades,
    })
  }

  let inserted = 0
  for (let i = 0; i < rowsOut.length; i += 100) {
    const batch = rowsOut.slice(i, i + 100)
    const { error } = await supabase.from('leads').upsert(batch, { onConflict: 'street_address,source', ignoreDuplicates: true })
    if (error) counts.errors.push(`upsert: ${error.message}`)
    else inserted += batch.length
  }

  const summary = {
    fetched: counts.fetched,
    trade_matched: counts.trade_matched,
    unique_addresses: byAddr.size,
    skipped_no_trade: counts.skipped_no_trade,
    skipped_no_geo: counts.skipped_no_geo,
    leads_upserted_or_dedup: inserted,
    errors: counts.errors,
  }
  await recordCronFinish(cronRunId, counts.errors.length === 0, summary, startedAtMs)
  return NextResponse.json({ ok: true, source: 'philly_li_enforcement', ...summary, checked_at: new Date().toISOString() })
}
