import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/scrape-census-aging
 *
 * Universal US-coverage lead source. Pulls Census ACS 5-year housing data,
 * scores every ZIP by median home age + owner-occupied density, generates
 * "aging-HVAC" leads for ZIPs likely to have units past their 15-20yr
 * lifespan. Same data fuels plumbing leads (old pipes) + roofing (old
 * roofs).
 *
 * Why this matters:
 *   Permits + storms only cover specific metros. Census ACS covers
 *   every US ZIP for free. This is the floor that guarantees any
 *   customer in any ZIP gets leads on day 1.
 *
 * Strategy:
 *   1. For each tenant's home ZIPs (+ radius), pull median_home_age
 *      from zip_centroids if cached; otherwise skip (run separate
 *      Census-load cron monthly).
 *   2. Within those ZIPs, generate `households × 0.02` leads/yr (2%
 *      annual HVAC replacement rate per Energy Star data).
 *   3. Lead score = function(home_age, recency, density).
 *
 * Runs weekly. Free public API (Census ACS 5-year). No key required
 * but rate-limited to 50/min — we batch by state.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ACS 5-year subject table — median year built for ZCTAs.
// B25035_001E = Median Year Structure Built (whole pop)
// B25002_001E = Total housing units
// API: https://api.census.gov/data/2022/acs/acs5
//
// Requires a free Census API key (register at https://api.census.gov/data/key_signup.html).
// Without CENSUS_API_KEY env var, the cron exits early with a 200 noop so
// it doesn't fire-and-fail every week. Set the env var in Vercel to enable.
const CENSUS_BASE = 'https://api.census.gov/data/2022/acs/acs5'

// HVAC replacement rate per year (Energy Star: avg unit lives 15-20yr,
// so ~5-7% replace annually). We pick 2% to stay conservative + because
// we only surface homes likely past lifespan.
const HVAC_ANNUAL_RATE = 0.02

type CensusRow = {
  zip: string
  median_year_built: number | null
  total_units: number | null
}

async function fetchCensusForState(stateFips: string, apiKey: string): Promise<CensusRow[]> {
  // Pull all ZCTAs in a state. Census uses 5-digit ZCTA as the geographic key.
  // Key is required as of late 2025 — anonymous calls return HTML error page.
  const url = `${CENSUS_BASE}?get=B25035_001E,B25002_001E&for=zip%20code%20tabulation%20area:*&in=state:${stateFips}&key=${apiKey}`
  const r = await fetch(url, {
    headers: { 'User-Agent': 'BellAveGo (peter@bellavego.com)' },
  })
  if (!r.ok) {
    console.warn(`[census-aging] state ${stateFips} returned HTTP ${r.status}`)
    return []
  }
  const ctype = r.headers.get('content-type') || ''
  if (!ctype.includes('json')) {
    // Census returns HTML on errors (bad key, missing key, etc.)
    console.warn(`[census-aging] state ${stateFips} returned non-JSON (likely auth error)`)
    return []
  }
  const raw = (await r.json()) as string[][]
  // First row is headers: ['B25035_001E', 'B25002_001E', 'state', 'zip code tabulation area']
  return raw.slice(1).map((row) => ({
    zip: row[3],
    median_year_built: row[0] && row[0] !== '0' ? Number(row[0]) : null,
    total_units: row[1] ? Number(row[1]) : null,
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
    // No key configured — return 200 noop so the cron doesn't show as
    // failing in Vercel. Register at https://api.census.gov/data/key_signup.html
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'CENSUS_API_KEY env var not set. Register at https://api.census.gov/data/key_signup.html',
    })
  }

  // Optional ?state=AZ to test one state. Default: pull all 50.
  const url = new URL(req.url)
  const stateFilter = url.searchParams.get('state')?.toUpperCase() || null

  // Get every state that has tenant home ZIPs — no point pulling Census
  // for states with no customers. Fall back to all-states for the first
  // bootstrap run.
  const { data: activeStates } = await supabase
    .from('profiles')
    .select('service_zips')
    .eq('is_active', true)
    .not('service_zips', 'is', null)

  const zipSet = new Set<string>()
  for (const row of activeStates || []) {
    for (const z of row.service_zips || []) if (z) zipSet.add(z)
  }

  let candidateStates: string[]
  if (stateFilter) {
    candidateStates = [stateFilter]
  } else if (zipSet.size > 0) {
    // Look up which states the tenant ZIPs are in
    const { data: stateLookup } = await supabase
      .from('zip_centroids')
      .select('state')
      .in('zip', [...zipSet])
    candidateStates = [...new Set((stateLookup || []).map((r) => r.state).filter(Boolean))]
  } else {
    // Bootstrap: pull every state. ~50 API hits, no key needed.
    candidateStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    ]
  }

  // FIPS codes for states (Census API uses 2-digit FIPS, not USPS)
  const FIPS: Record<string, string> = {
    AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09',
    DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17',
    IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24',
    MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
    NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
    OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
    TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
    WI: '55', WY: '56',
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  let totalZipsScanned = 0
  let totalLeadsInserted = 0
  let statesProcessed = 0

  for (const state of candidateStates) {
    const fips = FIPS[state]
    if (!fips) continue
    const rows = await fetchCensusForState(fips, censusKey)
    statesProcessed++

    // Update zip_centroids with median home age (for next lead-engine run)
    const centroidUpdates = rows
      .filter((r) => r.median_year_built && r.median_year_built > 1900)
      .map((r) => ({
        zip: r.zip,
        median_home_age: currentYear - (r.median_year_built as number),
        households: r.total_units,
      }))

    if (centroidUpdates.length > 0) {
      // Update in batches of 500 so we stay under Supabase's payload limits
      for (let i = 0; i < centroidUpdates.length; i += 500) {
        const batch = centroidUpdates.slice(i, i + 500)
        await supabase.from('zip_centroids').upsert(batch, { onConflict: 'zip' })
      }
    }

    // Generate aging-HVAC leads for ZIPs where median home is >=20yr old.
    // We seed one "neighborhood opportunity" lead per qualifying ZIP each
    // run; the lead-engine picks them up per tenant per radius.
    const agingZips = rows.filter((r) => {
      if (!r.median_year_built || !r.total_units) return false
      const age = currentYear - r.median_year_built
      return age >= 20 && r.total_units >= 200
    })

    const leadRows = agingZips.map((r) => {
      const age = currentYear - (r.median_year_built as number)
      // Score: older + denser = higher
      const ageScore = Math.min(40, Math.max(0, (age - 20) * 1.5))
      const densityScore = Math.min(30, Math.floor((r.total_units || 0) / 100))
      const baseScore = 30 + ageScore + densityScore
      // Annual replacement estimate (informational, shown to customer)
      const annualReplaceEst = Math.floor((r.total_units || 0) * HVAC_ANNUAL_RATE)
      return {
        street_address: `Aging HVAC opportunity · ZIP ${r.zip} · ${annualReplaceEst} est. units/yr need replacement`,
        zip: r.zip,
        source: 'census_aging' as const,
        source_event_date: now.toISOString(),
        source_details: {
          median_year_built: r.median_year_built,
          home_age_years: age,
          total_units: r.total_units,
          annual_replace_estimate: annualReplaceEst,
          source: 'US Census ACS 5-year',
        },
        lead_score: Math.min(100, Math.round(baseScore)),
        trade_match: ['hvac', 'plumbing', 'roofing'],
      }
    })

    totalZipsScanned += rows.length

    if (leadRows.length > 0) {
      // Batch insert with conflict-skip (street_address + source unique key
      // already exists; same census run on same day = no dupes)
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

    // Be a polite Census API citizen — 1s between states.
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return NextResponse.json({
    ok: true,
    source: 'census_acs_5yr',
    states_processed: statesProcessed,
    zips_scanned: totalZipsScanned,
    leads_inserted_or_dedup: totalLeadsInserted,
    checked_at: now.toISOString(),
  })
}
