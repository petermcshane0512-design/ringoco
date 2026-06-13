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

// Philly L&I standardized titles → engine trade(s) + urgency tier.
// tier 1 = imminent/unsafe, 2 = active structural defect, 3 = exterior/cosmetic.
const TITLE_MAP: Record<string, { trades: string[]; tier: 1 | 2 | 3 }> = {
  'Unsafe Structure':                          { trades: ['handyman', 'roofing'], tier: 1 },
  'Imminently Dangerous':                      { trades: ['handyman', 'roofing'], tier: 1 },
  'Roof Deficiencies':                         { trades: ['roofing'], tier: 2 },
  'Exterior Roof Drainage':                    { trades: ['roofing'], tier: 3 },
  'Exterior Walls':                            { trades: ['handyman'], tier: 2 },          // masonry/tuckpointing
  'Exterior Structure Protective Treatment':   { trades: ['handyman'], tier: 3 },          // painting/sealing
  'Exterior Windows, Skylights, Door Frames':  { trades: ['handyman'], tier: 3 },
  'Interior Surfaces':                         { trades: ['handyman'], tier: 3 },          // painting/plaster
  'Plumbing Systems - General':                { trades: ['plumbing'], tier: 2 },
  'Electrical Systems - General':              { trades: ['electrical'], tier: 2 },
  'Heating Facilities':                        { trades: ['hvac'], tier: 1 },              // no-heat = mandated
  'Mechanical Systems':                        { trades: ['hvac'], tier: 2 },
  'Vacant Structure & Land':                   { trades: ['handyman'], tier: 3 },
  'Alter Interior Portion':                    { trades: ['handyman'], tier: 3 },
}

type CartoRow = {
  address?: string; zip?: string
  geocode_x?: number | string | null; geocode_y?: number | string | null
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

  // Pull only the trade-relevant titles, open-ish cases, recent.
  const titles = Object.keys(TITLE_MAP).map((t) => `'${t.replace(/'/g, "''")}'`).join(',')
  const sql = `SELECT address, zip, geocode_x, geocode_y, violationcodetitle, violationdate, casestatus, opa_owner ` +
    `FROM violations WHERE violationdate > '${since}' AND violationcodetitle IN (${titles}) ` +
    `AND casestatus NOT IN ('CLOSED','COMPLIED') ORDER BY violationdate DESC LIMIT ${limit}`

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
    const map = TITLE_MAP[r.violationcodetitle ?? '']
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
    const lat = row.geocode_y != null && row.geocode_y !== '' ? Number(row.geocode_y) : null
    const lng = row.geocode_x != null && row.geocode_x !== '' ? Number(row.geocode_x) : null
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
