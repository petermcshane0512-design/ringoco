import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/ingest-enforcement-registry — universal enforcement-data
 * ingest (2026-06-13 per Peter).
 *
 * Replaces the "one cron file per city" pattern with a registry-driven
 * universal ingest. Loops every active row in `enforcement_sources`,
 * fetches its city's recent code violations, normalizes the response
 * into our `leads` table with source='enforcement'.
 *
 * Adding a 15th, 50th, 100th city = 1 SQL INSERT into enforcement_sources.
 * No new code. No new cron file. Elon step 2 (delete) + step 5 (automate)
 * applied together.
 *
 * Schedule: 0 4 * * * (4am UTC = midnight ET) — runs before the dawn
 * sweep of auto-load-instantly + refill-outreach-queue so the day's cold
 * email send targets contractors near zips that JUST got new violations.
 *
 * Trade tagging: each source carries trade_keywords; the universal handler
 * matches the violation text against those keywords + tags the lead so
 * downstream cohort filters can route roofing leads to roofers, etc.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type EnforcementSource = {
  id: number
  city: string
  state: string
  endpoint_url: string
  api_type: 'soda' | 'ckan' | 'arcgis' | 'custom'
  api_app_token_env_var: string | null
  trade_keywords: string[]
  field_map: Record<string, string>
  lookback_days: number
  max_per_run: number
}

type RawRecord = Record<string, unknown>

/**
 * Extract a value from a possibly-nested JSON record using a dot-path.
 * Field maps support paths like "properties.address" (ArcGIS) or
 * "geometry.coordinates.1" (GeoJSON latitude).
 */
function getPath(obj: unknown, path: string): unknown {
  if (!path) return null
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur == null) return null
    if (typeof cur !== 'object') return null
    // Array index in path (GeoJSON "coordinates.0" / "coordinates.1")
    if (/^\d+$/.test(part) && Array.isArray(cur)) {
      cur = cur[Number(part)]
    } else {
      cur = (cur as Record<string, unknown>)[part]
    }
  }
  return cur
}

function toStr(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number') return String(v)
  return null
}

function toNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Trade-classifier. Multi-trade matching — a roof-leak violation also
 * implies handyman/general; a façade-cracking violation implies masonry.
 * Returns lowercased trade slugs that match the violation text.
 */
const TRADE_PATTERNS: Record<string, RegExp> = {
  roofing: /\b(roof|shingle|gutter|flash|leak.{0,15}roof|moisture damage|water damage.{0,15}ceiling)\b/i,
  masonry: /\b(brick|stucco|cement|mortar|fa[çc]ade|parapet|chimney|spalling|cracked wall|tuck.?point|masonry)\b/i,
  hvac: /\b(heat|heating|cool|furnace|boiler|hvac|hot water|ventilation|no heat|inadequate heat|temperature)\b/i,
  plumbing: /\b(plumb|leak|drain|sewer|water (main|supply|pipe)|backflow|fixture|water shut)\b/i,
  electrical: /\b(electric|wiring|outlet|circuit|panel|gfci|service drop|illegal wiring)\b/i,
  painting: /\b(paint|lead.based paint|peeling|surface coat)\b/i,
  handyman: /\b(window|door|stair|deck|railing|porch|fence|exterior repair|interior repair)\b/i,
}

function classifyTrades(violationText: string, keywords: string[]): string[] {
  const matches = new Set<string>()
  for (const slug of keywords) {
    const re = TRADE_PATTERNS[slug.toLowerCase()]
    if (re && re.test(violationText)) matches.add(slug.toLowerCase())
  }
  // Always fall back to "handyman" if nothing else matched — at minimum
  // every flagged property is a general-repair lead.
  if (matches.size === 0) matches.add('handyman')
  return [...matches]
}

/**
 * Fetch + parse one source. Returns normalized records ready to upsert
 * into the `leads` table.
 */
async function fetchSource(src: EnforcementSource): Promise<RawRecord[]> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'BellAveGo-Enforcement-Ingest/1.0',
  }
  const tokenEnv = src.api_app_token_env_var || ''
  if (tokenEnv) {
    const tok = process.env[tokenEnv]
    if (tok) headers['X-App-Token'] = tok
  } else if (src.api_type === 'soda' && process.env.SOCRATA_APP_TOKEN) {
    headers['X-App-Token'] = process.env.SOCRATA_APP_TOKEN
  }

  const url = src.endpoint_url
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('json')) {
    const j = await res.json() as unknown
    // Various envelope shapes:
    //   SODA       → bare array
    //   CKAN       → { result: { records: [...] } }
    //   ArcGIS GeoJSON → { features: [...] }
    //   Custom SQL → { rows: [...] }
    if (Array.isArray(j)) return j as RawRecord[]
    const obj = j as Record<string, unknown>
    if (Array.isArray(obj.features)) return obj.features as RawRecord[]
    if (obj.result && typeof obj.result === 'object' && Array.isArray((obj.result as { records?: unknown }).records)) {
      return (obj.result as { records: RawRecord[] }).records
    }
    if (Array.isArray(obj.rows)) return obj.rows as RawRecord[]
    return []
  }
  // CSV fallback (e.g. St. Louis dumps a CSV) — minimal parser, comma-only.
  const text = await res.text()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headersLine = lines[0].split(',').map((h) => h.trim())
  return lines.slice(1).slice(0, src.max_per_run).map((line) => {
    const cells = line.split(',')
    const r: RawRecord = {}
    headersLine.forEach((h, i) => { r[h] = cells[i] })
    return r
  })
}

/**
 * Normalize one raw source record into our `leads` shape using the
 * city's field_map. Skip records without a usable address+zip.
 */
function normalize(rec: RawRecord, src: EnforcementSource): {
  street_address: string | null
  city: string
  state: string
  zip: string | null
  lat: number | null
  lng: number | null
  violation: string | null
  source_details: Record<string, unknown>
  trade_match: string[]
} | null {
  const m = src.field_map
  const street = toStr(getPath(rec, m.address || 'address'))
  const zip = toStr(getPath(rec, m.zip || 'zip'))?.slice(0, 5) || null
  const lat = toNum(getPath(rec, m.lat || 'latitude'))
  const lng = toNum(getPath(rec, m.lng || 'longitude'))
  const violation = toStr(getPath(rec, m.violation || 'violation_description')) || ''
  if (!street || !zip) return null

  return {
    street_address: street,
    city: src.city,
    state: src.state,
    zip,
    lat,
    lng,
    violation: violation.slice(0, 500),
    source_details: {
      city: src.city,
      state: src.state,
      violation_text: violation.slice(0, 500),
      raw_status: toStr(getPath(rec, m.status || 'status')),
      raw_date: toStr(getPath(rec, m.date || 'date')),
    },
    trade_match: classifyTrades(violation, src.trade_keywords),
  }
}

async function runOne(src: EnforcementSource, dry: boolean): Promise<{
  source_id: number
  city: string
  fetched: number
  inserted: number
  skipped_no_address: number
  error?: string
}> {
  try {
    const raw = await fetchSource(src)
    const normalized = raw
      .map((r) => normalize(r, src))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, src.max_per_run)

    const skippedNoAddress = raw.length - normalized.length

    if (dry) {
      await supabase.from('enforcement_sources').update({
        last_run_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', src.id)
      return {
        source_id: src.id,
        city: src.city,
        fetched: raw.length,
        inserted: 0,
        skipped_no_address: skippedNoAddress,
      }
    }

    let inserted = 0
    if (normalized.length > 0) {
      // Upsert into leads. Unique key (source, street_address, zip) prevents
      // re-inserting the same violation on tomorrow's run. Onlu set source =
      // 'enforcement' so existing per-city crons that use different source
      // strings (e.g. 'permit') don't conflict.
      const rows = normalized.map((n) => ({
        source: 'enforcement',
        zip: n.zip,
        street_address: n.street_address,
        city: n.city,
        state: n.state,
        lat: n.lat,
        lng: n.lng,
        trade_match: n.trade_match,
        source_details: n.source_details,
      }))
      const { error } = await supabase
        .from('leads')
        .upsert(rows, { onConflict: 'source,street_address,zip', ignoreDuplicates: true })
      if (error) throw new Error(`leads upsert: ${error.message}`)
      inserted = rows.length
    }

    await supabase.from('enforcement_sources').update({
      last_run_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_inserted: inserted,
      last_error: null,
    }).eq('id', src.id)

    return {
      source_id: src.id,
      city: src.city,
      fetched: raw.length,
      inserted,
      skipped_no_address: skippedNoAddress,
    }
  } catch (e) {
    const msg = (e as Error).message
    await supabase.from('enforcement_sources').update({
      last_run_at: new Date().toISOString(),
      last_error: msg.slice(0, 1000),
    }).eq('id', src.id)
    return {
      source_id: src.id,
      city: src.city,
      fetched: 0,
      inserted: 0,
      skipped_no_address: 0,
      error: msg,
    }
  }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const onlyCity = url.searchParams.get('city')

  let q = supabase.from('enforcement_sources').select('*').eq('status', 'active')
  if (onlyCity) q = q.eq('city', onlyCity)
  const { data: sources, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!sources || sources.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, message: 'no active sources' })
  }

  // Run sources sequentially. Each is independent (different city's API,
  // different timeout characteristics); parallel would be faster but the
  // 300-second maxDuration is enough sequential and avoids hitting any
  // single state's portal too hard.
  const results = []
  let totalInserted = 0
  for (const src of sources as EnforcementSource[]) {
    const r = await runOne(src, dry)
    results.push(r)
    totalInserted += r.inserted
  }

  return NextResponse.json({
    ok: true,
    scanned: sources.length,
    total_inserted: totalInserted,
    dry,
    by_city: results,
  })
}
