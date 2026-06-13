import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

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

// Resilient field extractor: tries the configured field_map path FIRST,
// then falls back to common alternates across all US open-data portals.
// Most cities use one of these 4-6 names for each concept. Makes the
// ingest robust to schema drift without per-city debugging.
const ADDRESS_FALLBACKS = ['address', 'street_address', 'violation_street', 'street', 'address_line_1', 'site_address', 'property_address', 'violation_address', 'housenumber', 'street_name', 'location_address']
const ZIP_FALLBACKS = ['zip', 'zipcode', 'zip_code', 'violation_zip', 'property_zip', 'postal_code', 'postalcode', 'zip5']
const LAT_FALLBACKS = ['latitude', 'lat', 'y', 'violation_latitude', 'property_latitude']
const LNG_FALLBACKS = ['longitude', 'lng', 'long', 'x', 'violation_longitude', 'property_longitude']
const VIOL_FALLBACKS = ['violation_description', 'description', 'violation', 'violation_type', 'novdescription', 'order_type', 'violationtype']
const STATUS_FALLBACKS = ['status', 'violation_status', 'current_status', 'casestatus', 'disposition']
const DATE_FALLBACKS = ['violation_date', 'date_issued', 'inspection_date', 'inspectiondate', 'casecreateddate', 'status_dttm', 'opened_date', 'date', 'order_date']

function tryFields(rec: RawRecord, primary: string | undefined, fallbacks: string[]): unknown {
  if (primary) {
    const v = getPath(rec, primary)
    if (v != null && v !== '') return v
  }
  // Try top-level + properties.* for ArcGIS shapes — the same record might
  // be flat or wrapped. Each fallback name gets BOTH treatments.
  for (const f of fallbacks) {
    const v1 = getPath(rec, f)
    if (v1 != null && v1 !== '') return v1
    const v2 = getPath(rec, `properties.${f}`)
    if (v2 != null && v2 !== '') return v2
  }
  return null
}

/**
 * Normalize one raw source record into our `leads` shape using the
 * city's field_map (with resilient fallbacks). Skip records without a
 * usable address+zip.
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
  const street = toStr(tryFields(rec, m.address, ADDRESS_FALLBACKS))
  const rawZip = toStr(tryFields(rec, m.zip, ZIP_FALLBACKS))
  const zip = rawZip && rawZip.length >= 5 ? rawZip.replace(/\D/g, '').slice(0, 5) : null
  const lat = toNum(tryFields(rec, m.lat, LAT_FALLBACKS))
  const lng = toNum(tryFields(rec, m.lng, LNG_FALLBACKS))
  const violation = toStr(tryFields(rec, m.violation, VIOL_FALLBACKS)) || ''
  // Require address. zip is allowed null — runOne will backfill from
  // lat/lng for cities like Chicago that don't return zip in the API.
  if (!street) return null

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
      raw_status: toStr(tryFields(rec, m.status, STATUS_FALLBACKS)),
      raw_date: toStr(tryFields(rec, m.date, DATE_FALLBACKS)),
    },
    trade_match: classifyTrades(violation, src.trade_keywords),
  }
}

/**
 * Cache for lat/lng → zip lookups. Each registry run reuses the cache so
 * the 1000 Chicago records with similar coordinates don't trigger 1000
 * separate DB queries. Key = "lat3.lng3" (3-decimal precision = ~111m
 * grid). Reset per cron invocation.
 */
type LatLng = { lat: number; lng: number; zip: string }
const ZIP_CACHE = new Map<string, string>()

async function nearestZip(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(3)}_${lng.toFixed(3)}`
  const cached = ZIP_CACHE.get(key)
  if (cached !== undefined) return cached || null

  // PostGIS would be ideal but zip_centroids is a plain table. We pull a
  // bounding-box subset (1° lat × 1° lng ≈ 110km × ~78km at mid-latitudes
  // = covers any nearby zip with margin) then haversine in JS to pick the
  // nearest. ~30-100 candidates per query — fast.
  const latMin = lat - 1, latMax = lat + 1
  const lngMin = lng - 1, lngMax = lng + 1
  const { data } = await supabase
    .from('zip_centroids')
    .select('zip, lat, lng')
    .gte('lat', latMin).lte('lat', latMax)
    .gte('lng', lngMin).lte('lng', lngMax)
    .limit(500)

  if (!data || data.length === 0) {
    ZIP_CACHE.set(key, '')
    return null
  }

  let bestZip = ''
  let bestDist = Infinity
  for (const row of data as LatLng[]) {
    const dLat = (row.lat - lat) * (Math.PI / 180)
    const dLng = (row.lng - lng) * (Math.PI / 180)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(row.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    const dist = Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    if (dist < bestDist) { bestDist = dist; bestZip = row.zip }
  }
  ZIP_CACHE.set(key, bestZip)
  return bestZip || null
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

    // Backfill zip from lat/lng for records that have coordinates but no
    // zip in the response (Chicago, Baltimore, Detroit, Cleveland,
    // Minneapolis all return lat/lng without an explicit zip field).
    for (const n of normalized) {
      if (!n.zip && n.lat != null && n.lng != null) {
        const z = await nearestZip(n.lat, n.lng)
        if (z) n.zip = z
      }
    }
    // Re-filter — drop any whose zip still null after the lat/lng lookup.
    const withZip = normalized.filter((n) => n.zip)
    const droppedNoZip = normalized.length - withZip.length

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
    if (withZip.length > 0) {
      // Insert only rows that have a usable zip (either from API or backfilled
      // from lat/lng → zip_centroids). source='enforcement' so this universal
      // ingest doesn't conflict with existing per-city crons that use
      // city-specific source strings (e.g. 'chicago_enforcement').
      const rows = withZip.map((n) => ({
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
      // 2026-06-13 — insert + select so we know what actually landed.
      // Prior version reported `count ?? rows.length` which lied when
      // Supabase silently rolled back the batch (RLS, trigger, partial
      // constraint violation). The select forces Postgres to return the
      // IDs of rows actually persisted. inserted = data.length is now
      // ground truth.
      //
      // We chunk to 500 because single batch of 1000+ JSONB-heavy rows
      // sometimes hits Supabase's body size limit + we want partial
      // success on a bad row (one bad row in a batch = whole batch
      // rolled back).
      const CHUNK = 500
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('leads')
          .insert(slice)
          .select('id')
        if (error) {
          // Common: unique-violation on a re-run. Try row-by-row to
          // salvage the rest of the batch instead of losing 500.
          if (error.message.toLowerCase().includes('duplicate')) {
            for (const single of slice) {
              const { data: one } = await supabase.from('leads').insert(single).select('id')
              if (one && one.length > 0) inserted += 1
            }
          } else {
            throw new Error(`leads insert (chunk ${i}): ${error.message}`)
          }
        } else {
          inserted += data?.length ?? 0
        }
      }
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
    // Self-pause endpoints that 4xx — the URL is dead, no point retrying
    // every night. Peter manually flips back to 'active' once the URL is
    // updated. Keeps the nightly run from burning HTTP requests on dead
    // sources + cleans up the by_city output.
    const is4xx = /HTTP 4\d\d/.test(msg)
    const update: Record<string, unknown> = {
      last_run_at: new Date().toISOString(),
      last_error: msg.slice(0, 1000),
    }
    if (is4xx) update.status = 'broken'
    await supabase.from('enforcement_sources').update(update).eq('id', src.id)
    return {
      source_id: src.id,
      city: src.city,
      fetched: 0,
      inserted: 0,
      skipped_no_address: 0,
      error: is4xx ? `${msg.slice(0, 100)} — auto-paused as 'broken'` : msg,
    }
  }
}

export async function GET(req: NextRequest) {
  // Triple auth: Vercel cron header (scheduled runs) OR x-admin-secret (curl
  // / CI / manual trigger from a script) OR Clerk admin session (Peter hits
  // the URL in browser to trigger the first ingest before the 4am cron).
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  const hasSecret = !!expected && adminSecret === expected
  if (!isCron && !hasSecret) {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const onlyCity = url.searchParams.get('city')
  const debug = url.searchParams.get('debug') === '1'

  let q = supabase.from('enforcement_sources').select('*').eq('status', 'active')
  if (onlyCity) q = q.eq('city', onlyCity)
  const { data: sources, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Debug mode: short-circuit — fetch each source, return the first raw
  // record so we can see what field names the API actually returns.
  // Used to diagnose field_map drift across city portals.
  if (debug) {
    const samples = []
    for (const src of (sources || []) as EnforcementSource[]) {
      try {
        const raw = await fetchSource(src)
        samples.push({
          city: src.city,
          fetched: raw.length,
          first_record: raw[0] ? Object.fromEntries(Object.entries(raw[0]).slice(0, 30)) : null,
          available_fields: raw[0] ? Object.keys(raw[0]) : [],
        })
      } catch (e) {
        samples.push({ city: src.city, error: (e as Error).message.slice(0, 200) })
      }
    }
    return NextResponse.json({ ok: true, debug: true, samples })
  }
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
