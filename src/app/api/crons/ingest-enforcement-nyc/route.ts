import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyCronAuth, recordCronStart, recordCronFinish } from '@/lib/cronRuns'
import { matchTrades, scoreForTier, urgencyLabel, buildPitch, whyTags, tradeRules } from '@/lib/enforcementTriggers'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/ingest-enforcement-nyc — 2026-06-12 per Peter ("build NYC,
 * most likely to convert first").
 *
 * NYC is the richest enforcement market in America. ONE feed — HPD Housing
 * Maintenance Code Violations (wvxf-dwi5) — covers HVAC (no-heat, legally
 * mandated), plumbing (hot water / leaks), electrical (hazards), and
 * painting/lead (Class C lead-paint = mandatory remediation). Every record
 * has lat/lng, a class severity, and the cited violation text.
 *
 * Class -> urgency tier (HPD severity, NOT the Chicago trigger taxonomy):
 *   C (immediately hazardous — heat, lead, no hot water) -> tier 1
 *   B (hazardous)                                        -> tier 2
 *   A (non-hazardous)                                    -> tier 3
 *
 * Same model as Chicago: trade-keyword match, exclusivity-ready leads with
 * lat/lng (map pins day one), urgency label + legal-pressure pitch, dedup
 * (street_address+source UNIQUE), weekly cadence, drop-time skip-trace.
 *
 * Query params: ?days=120 lookback, ?limit=2000 per pull, ?trades=hvac,...
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const HPD = 'https://data.cityofnewyork.us/resource/wvxf-dwi5.json'

type HpdRow = {
  housenumber?: string; streetname?: string; boro?: string; zip?: string
  latitude?: string; longitude?: string; class?: string
  novdescription?: string; inspectiondate?: string; violationstatus?: string
  violationid?: string; apartment?: string
}

function tierForClass(cls?: string): 1 | 2 | 3 | 4 {
  const c = (cls || '').toUpperCase()
  if (c === 'C') return 1
  if (c === 'B') return 2
  if (c === 'A') return 3
  return 3
}

function titleCaseBoro(b?: string): string {
  const s = (b || '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export async function GET(req: NextRequest) {
  const startedAtMs = Date.now()
  const mode = classifyCronAuth(req, process.env.ADMIN_API_SECRET)
  const cronRunId = await recordCronStart('ingest-enforcement-nyc', mode)
  if (mode === 'unauthorized') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '120', 10)
  const limit = Math.min(10000, parseInt(url.searchParams.get('limit') ?? '2000', 10))
  const tradeFilter = (url.searchParams.get('trades') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const counts = { fetched: 0, trade_matched: 0, skipped_no_geo: 0, skipped_no_trade: 0, errors: [] as string[] }
  const labelByKey = new Map(tradeRules().map((t) => [t.key, t.label]))

  let rows: HpdRow[] = []
  try {
    const where = `violationstatus='Open' AND inspectiondate >= '${since}'`
    const u = `${HPD}?$where=${encodeURIComponent(where)}&$order=inspectiondate DESC&$limit=${limit}`
    const r = await fetch(u)
    if (!r.ok) {
      await recordCronFinish(cronRunId, false, { http: r.status }, startedAtMs)
      return NextResponse.json({ error: `HPD HTTP ${r.status}` }, { status: 502 })
    }
    rows = await r.json()
  } catch (e) {
    await recordCronFinish(cronRunId, false, { fetch_err: (e as Error).message }, startedAtMs)
    return NextResponse.json({ error: `HPD fetch err: ${(e as Error).message}` }, { status: 502 })
  }
  counts.fetched = rows.length

  // One lead per VIOLATION address (dedup by street_address+source UNIQUE in
  // the leads table handles cross-run + cross-address dedup). We also collapse
  // same-address rows within this pull, keeping the highest-severity class.
  const byAddr = new Map<string, { row: HpdRow; tier: 1 | 2 | 3 | 4; engineTrades: string[]; tradeKeys: string[] }>()

  for (const r of rows) {
    const desc = r.novdescription || ''
    const trades = matchTrades(desc)
    if (trades.engineTrades.length === 0) { counts.skipped_no_trade++; continue }
    if (tradeFilter.length && !trades.engineTrades.some((t) => tradeFilter.includes(t)) && !trades.keys.some((k) => tradeFilter.includes(k))) continue
    const house = (r.housenumber || '').trim()
    const street = (r.streetname || '').trim()
    if (!house || !street) { counts.skipped_no_geo++; continue }
    const addr = `${house} ${street}`.replace(/\s+/g, ' ').trim()
    const key = addr.toUpperCase()
    const tier = tierForClass(r.class)
    const existing = byAddr.get(key)
    if (!existing || tier < existing.tier) {
      byAddr.set(key, { row: r, tier, engineTrades: trades.engineTrades, tradeKeys: trades.keys })
    }
    counts.trade_matched++
  }

  const rowsOut: Record<string, unknown>[] = []
  for (const { row, tier, engineTrades, tradeKeys } of byAddr.values()) {
    const house = (row.housenumber || '').trim()
    const street = (row.streetname || '').trim()
    const addr = `${house} ${street}`.replace(/\s+/g, ' ').trim()
    const boro = titleCaseBoro(row.boro)
    const lat = row.latitude ? Number(row.latitude) : null
    const lng = row.longitude ? Number(row.longitude) : null
    const desc = row.novdescription || ''
    const tradeLabel = labelByKey.get(tradeKeys[0]) ?? null

    rowsOut.push({
      street_address: addr,
      city: boro || 'New York',
      state: 'NY',
      zip: row.zip || '',
      lat, lng,
      source: 'permit',  // safest existing enum value; trigger_type carries the truth
      source_event_date: row.inspectiondate || new Date().toISOString(),
      source_details: {
        city: boro || 'New York',
        provider: 'enforcement',
        market: 'nyc',
        trigger_type: 'violation',
        urgency_tier: tier,
        urgency_label: urgencyLabel('violation', { date: row.inspectiondate, fine: null, tradeLabel }),
        hpd_class: row.class || null,
        description: desc.slice(0, 220),
        trade_keys: tradeKeys,
        why_tags: whyTags('violation', { date: row.inspectiondate, desc: desc.slice(0, 120) }),
      },
      lead_score: scoreForTier(tier),
      pitch_script: buildPitch('violation', desc, { fine: null, date: row.inspectiondate }),
      trade_match: engineTrades,
    })
  }

  let inserted = 0
  for (let i = 0; i < rowsOut.length; i += 100) {
    const batch = rowsOut.slice(i, i + 100)
    const { error } = await supabase
      .from('leads')
      .upsert(batch, { onConflict: 'street_address,source', ignoreDuplicates: true })
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
  return NextResponse.json({ ok: true, source: 'nyc_hpd_enforcement', ...summary, checked_at: new Date().toISOString() })
}
