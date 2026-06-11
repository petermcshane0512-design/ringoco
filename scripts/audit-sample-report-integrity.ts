/**
 * Sample-report integrity audit.
 *
 * Per Fable 5's amendment: the GOOGLE_PLACES_API_KEY was a browser-restricted
 * key, which would have silently returned REQUEST_DENIED on server-side
 * geocoding calls. In sampleReportEnrich.ts, that means the fallback chain
 * ran:
 *   1. Places lookup → DENIED → no businessPin
 *   2. Geocode by city → DENIED → no cityPin
 *   3. Fall through to "Mike's HVAC" Minneapolis demo centroid
 *      (44.92756, -93.36358)
 *
 * Real prospects would have received reports showing Minneapolis as their
 * business location. Need to know how many before any cold email goes out.
 *
 * This script:
 *   1. Counts sample_reports generated in the last 90 days
 *   2. Inspects each report's persisted JSON for the Mike's demo centroid
 *      (lat 44.92756 ± 0.001, lng -93.36358 ± 0.001)
 *   3. Reports the fraction that fell back vs. resolved a real address
 *   4. Flags the affected business_names so Peter can decide: regenerate
 *      or drop from outreach
 *
 * Run:
 *   npx tsx scripts/audit-sample-report-integrity.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// From src/lib/sampleReportEnrich.ts:22 — MIKES_DEMO_CENTROID
const MIKES_LAT = 44.92756
const MIKES_LNG = -93.36358
const TOLERANCE = 0.01  // ~1km — close enough that a real geocode would never land this precise

function isMikesCentroid(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false
  return Math.abs(lat - MIKES_LAT) < TOLERANCE && Math.abs(lng - MIKES_LNG) < TOLERANCE
}

async function main() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()

  const { data, error, count } = await supabase
    .from('sample_reports')
    .select('id, business_name, zip, generated_at, opened_at, open_count, report', { count: 'exact' })
    .gte('generated_at', ninetyDaysAgo)
    .order('generated_at', { ascending: false })
    .limit(10000)

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }

  type Row = {
    id: string
    business_name: string | null
    zip: string | null
    generated_at: string
    opened_at: string | null
    open_count: number | null
    report: unknown
  }
  const rows = (data || []) as Row[]
  console.log(`Total sample_reports (last 90d): ${count}`)
  console.log(`Sampled: ${rows.length}\n`)

  let fallbackHits = 0
  let realHits = 0
  let nullPin = 0
  let parseError = 0
  const affectedRows: { biz: string; zip: string; opened: boolean; gen: string }[] = []

  for (const r of rows) {
    const report = r.report as Record<string, unknown> | null
    if (!report || typeof report !== 'object') { nullPin++; continue }

    // The map block lives at report.serviceArea.points[] per the personalize
    // route. The first 'business' kind point holds the businessPin coords.
    try {
      const sa = (report as { serviceArea?: { points?: Array<{ kind?: string; lat?: number; lng?: number }> } }).serviceArea
      const bizPt = sa?.points?.find((p) => p.kind === 'business')
      if (!bizPt || bizPt.lat == null || bizPt.lng == null) { nullPin++; continue }
      if (isMikesCentroid(bizPt.lat, bizPt.lng)) {
        fallbackHits++
        affectedRows.push({
          biz: r.business_name || '?',
          zip: r.zip || '?',
          opened: !!r.opened_at,
          gen: r.generated_at,
        })
      } else {
        realHits++
      }
    } catch {
      parseError++
    }
  }

  console.log('=== Integrity verdict ===')
  console.log(`  Real-geocode pin:   ${realHits}`)
  console.log(`  Mike\'s demo centroid (FALLBACK): ${fallbackHits}`)
  console.log(`  Null / no pin:      ${nullPin}`)
  console.log(`  Parse errors:       ${parseError}`)
  console.log('')
  const pct = rows.length > 0 ? Math.round((fallbackHits / rows.length) * 100) : 0
  console.log(`Fallback rate: ${pct}% of reports show Minneapolis instead of the real prospect city.`)

  if (fallbackHits > 0) {
    console.log('\n=== Affected reports (top 30 most recently generated) ===')
    affectedRows
      .sort((a, b) => b.gen.localeCompare(a.gen))
      .slice(0, 30)
      .forEach((r) => {
        console.log(`  ${r.gen.slice(0, 10)}  zip=${r.zip.padEnd(7)}  opened=${r.opened ? 'YES' : 'no '}  ${r.biz}`)
      })

    const openedFallbacks = affectedRows.filter((r) => r.opened).length
    console.log(`\n${openedFallbacks} of the ${fallbackHits} fallback reports were OPENED by the prospect — those people SAW Minneapolis when they expected their own city.`)
  }

  console.log('\nNext steps if fallback rate > 5%:')
  console.log('  1. Regenerate the affected reports w/ the now-working Geocoding API')
  console.log('  2. Drop the affected prospects from the 480 send (their personalized report is wrong)')
  console.log('  3. Backfill the sample_reports table with corrected pins')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
