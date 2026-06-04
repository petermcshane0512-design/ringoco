import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/scrape-census-aging
 *
 * Universal US-coverage lead floor. Pulls Census ACS 5-year housing data
 * for every ZCTA nationwide in ONE call, generates aging-HVAC "neighborhood
 * opportunity" leads for ZIPs where median home age >= 20yr.
 *
 * Why one nationwide call vs per-state: ACS dropped state-filtering for
 * ZCTAs in 2020. The only valid query is `for=zip code tabulation area:*`
 * with no `in=state:XX` clause. Returns all ~33K ZCTAs in one ~6MB JSON.
 *
 * Source: api.census.gov/data/2022/acs/acs5
 * Requires CENSUS_API_KEY env var (free, register at
 *   https://api.census.gov/data/key_signup.html).
 *
 * Runs weekly Monday 4am UTC. Idempotent — dedups via
 * (street_address, source) UNIQUE on leads.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ACS 5-year subject table fields:
//   B25035_001E = Median Year Structure Built
//   B25002_001E = Total housing units
const CENSUS_BASE = 'https://api.census.gov/data/2022/acs/acs5'

// HVAC replacement rate per year (Energy Star: avg unit lives 15-20yr).
// Conservative 2% — only surface homes likely past lifespan.
const HVAC_ANNUAL_RATE = 0.02

type CensusRow = {
  zip: string
  median_year_built: number | null
  total_units: number | null
}

async function fetchAllZCTAs(apiKey: string): Promise<CensusRow[]> {
  // Nationwide single-call. Census doesn't support state-filtered ZCTA
  // queries on ACS 5-year as of 2020 — must pull all and filter client-side.
  const url = `${CENSUS_BASE}?get=B25035_001E,B25002_001E&for=zip%20code%20tabulation%20area:*&key=${apiKey}`
  const r = await fetch(url, {
    headers: { 'User-Agent': 'BellAveGo (peter@bellavego.com)' },
  })
  if (!r.ok) {
    console.warn(`[census-aging] HTTP ${r.status}`)
    return []
  }
  const ctype = r.headers.get('content-type') || ''
  if (!ctype.includes('json')) {
    console.warn(`[census-aging] non-JSON response (likely auth error). First 200 chars:`)
    const txt = await r.text()
    console.warn(txt.slice(0, 200))
    return []
  }
  const raw = (await r.json()) as string[][]
  // Headers: ['B25035_001E', 'B25002_001E', 'zip code tabulation area']
  // Row format: [medianYearBuilt, totalUnits, zip]
  return raw.slice(1).map((row) => ({
    zip: row[2],
    median_year_built: row[0] && row[0] !== '0' && row[0] !== '-666666666' ? Number(row[0]) : null,
    total_units: row[1] && row[1] !== '-666666666' ? Number(row[1]) : null,
  }))
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const censusKey = process.env.CENSUS_API_KEY
  if (!censusKey) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'CENSUS_API_KEY env var not set. Register at https://api.census.gov/data/key_signup.html',
    })
  }

  // Debug mode — dump raw Census response so we can see WHY 0 rows.
  // Already past auth gate (admin secret matched or cron header set).
  const debugMode = new URL(req.url).searchParams.get('debug') === '1'
  if (debugMode) {
    const testUrl = `${CENSUS_BASE}?get=B25035_001E,B25002_001E&for=zip%20code%20tabulation%20area:60601&key=${censusKey}`
    const r = await fetch(testUrl, { headers: { 'User-Agent': 'BellAveGo debug' } })
    const ctype = r.headers.get('content-type') || ''
    const body = await r.text()
    return NextResponse.json({
      debug: true,
      key_present: true,
      key_len: censusKey.length,
      key_first4: censusKey.slice(0, 4),
      key_last4: censusKey.slice(-4),
      key_has_whitespace: /\s/.test(censusKey),
      test_url: testUrl.replace(censusKey, '***'),
      status: r.status,
      content_type: ctype,
      body_first_400: body.slice(0, 400),
    })
  }

  // Optional ?stateFilter=AZ caps generation to one state's ZIPs for testing.
  // Default: process every ZCTA Census returns.
  const url = new URL(req.url)
  const stateFilter = url.searchParams.get('state')?.toUpperCase() || null

  const now = new Date()
  const currentYear = now.getFullYear()

  const rows = await fetchAllZCTAs(censusKey)
  if (rows.length === 0) {
    return NextResponse.json({
      ok: false,
      reason: 'Census returned 0 rows — likely auth error. Check server logs for response body.',
      zips_scanned: 0,
    }, { status: 502 })
  }

  // If state filter set, look up ZIPs in that state via zip_centroids
  let allowedZips: Set<string> | null = null
  if (stateFilter) {
    const { data: stateZips } = await supabase
      .from('zip_centroids')
      .select('zip')
      .eq('state', stateFilter)
    allowedZips = new Set((stateZips || []).map((r) => r.zip))
  }

  const filtered = allowedZips
    ? rows.filter((r) => allowedZips!.has(r.zip))
    : rows

  // Update zip_centroids with median home age (for next lead-engine run).
  // ONLY for ZIPs that already exist in our centroid table — bulk upsert
  // was silently failing because Census returns ZCTAs not in our zipcodes
  // package, and the insert branch hit lat NOT NULL violation. UPDATE-only
  // path side-steps that.
  const centroidUpdates = filtered
    .filter((r) => r.median_year_built && r.median_year_built > 1900)
    .map((r) => ({
      zip: r.zip,
      median_home_age: currentYear - (r.median_year_built as number),
      households: r.total_units,
    }))

  let centroidUpdatesApplied = 0
  if (centroidUpdates.length > 0) {
    // Pre-fetch which ZIPs we actually have. Skip the rest.
    const allZips = centroidUpdates.map((u) => u.zip)
    const existingZips = new Set<string>()
    for (let i = 0; i < allZips.length; i += 1000) {
      const slice = allZips.slice(i, i + 1000)
      const { data } = await supabase
        .from('zip_centroids')
        .select('zip')
        .in('zip', slice)
      if (data) for (const r of data) existingZips.add(r.zip)
    }

    const updatable = centroidUpdates.filter((u) => existingZips.has(u.zip))
    // Use upsert with onConflict — every row now has a guaranteed match,
    // so it routes to UPDATE path only.
    for (let i = 0; i < updatable.length; i += 500) {
      const batch = updatable.slice(i, i + 500)
      const { error } = await supabase.from('zip_centroids').upsert(batch, { onConflict: 'zip' })
      if (!error) centroidUpdatesApplied += batch.length
      else console.warn(`[census-aging] centroid update err: ${error.message}`)
    }
  }

  // Generate one aging-HVAC opportunity lead per qualifying ZIP.
  // Floor: median home >= 20yr old AND at least 200 housing units.
  const agingZips = filtered.filter((r) => {
    if (!r.median_year_built || !r.total_units) return false
    const age = currentYear - r.median_year_built
    return age >= 20 && r.total_units >= 200
  })

  const leadRows = agingZips.map((r) => {
    const age = currentYear - (r.median_year_built as number)
    const ageScore = Math.min(40, Math.max(0, (age - 20) * 1.5))
    const densityScore = Math.min(30, Math.floor((r.total_units || 0) / 100))
    const baseScore = 30 + ageScore + densityScore
    const annualReplaceEst = Math.floor((r.total_units || 0) * HVAC_ANNUAL_RATE)
    return {
      street_address: `Aging HVAC opportunity · ZIP ${r.zip} · ${annualReplaceEst} est. units/yr need replacement`,
      zip: r.zip,
      source: 'aging_hvac' as const,
      source_event_date: now.toISOString(),
      source_details: {
        median_year_built: r.median_year_built,
        home_age_years: age,
        total_units: r.total_units,
        annual_replace_estimate: annualReplaceEst,
        source: 'US Census ACS 5-year (2022)',
      },
      lead_score: Math.min(100, Math.round(baseScore)),
      trade_match: ['hvac', 'plumbing', 'roofing'],
    }
  })

  let totalLeadsInserted = 0
  if (leadRows.length > 0) {
    for (let i = 0; i < leadRows.length; i += 500) {
      const batch = leadRows.slice(i, i + 500)
      const { error } = await supabase.from('leads').upsert(batch, {
        onConflict: 'street_address,source',
        ignoreDuplicates: true,
      })
      if (!error) totalLeadsInserted += batch.length
      else console.warn(`[census-aging] insert err: ${error.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    source: 'census_acs_5yr',
    state_filter: stateFilter,
    zips_returned_by_census: rows.length,
    zips_in_filter: filtered.length,
    centroid_updates_attempted: centroidUpdates.length,
    centroid_updates_applied: centroidUpdatesApplied,
    aging_zips_qualified: agingZips.length,
    leads_inserted_or_dedup: totalLeadsInserted,
    checked_at: now.toISOString(),
  })
}
