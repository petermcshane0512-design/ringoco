/**
 * v2 — correct schema audit.
 *
 * Per src/lib/sampleReportEnrich.ts:
 *   - Pin lives at `report.serviceAreaMap.points[]`, NOT `report.serviceArea.points[]`
 *   - Demo fallback centroid is `{ lat: 44.9489, lng: -93.3479 }` (St. Louis Park),
 *     not 44.92756/-93.36358 used in v1.
 *
 * Question: did any prospect-visible report render the Minneapolis fallback
 * pin? (Yes/No + count.)
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const DEMO_LAT = 44.9489
const DEMO_LNG = -93.3479
const TOL = 0.01

function isDemoCentroid(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false
  return Math.abs(lat - DEMO_LAT) < TOL && Math.abs(lng - DEMO_LNG) < TOL
}

async function main() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
  const { data, count, error } = await supabase
    .from('sample_reports')
    .select('id, business_name, zip, generated_at, opened_at, open_count, report', { count: 'exact' })
    .gte('generated_at', ninetyDaysAgo)
    .order('generated_at', { ascending: false })
    .limit(10000)
  if (error) { console.error(error.message); process.exit(1) }

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
  console.log(`Total sample_reports last 90d: ${count}`)
  console.log(`Sampled: ${rows.length}\n`)

  let real = 0, fallback = 0, nullPin = 0, noServiceAreaMap = 0
  const affected: { biz: string; zip: string; opened: boolean; gen: string }[] = []

  for (const r of rows) {
    const report = r.report as Record<string, unknown> | null
    if (!report || typeof report !== 'object') { nullPin++; continue }
    const sam = (report as { serviceAreaMap?: { points?: Array<{ kind?: string; lat?: number | null; lng?: number | null }>; centerLat?: number | null; centerLng?: number | null } }).serviceAreaMap
    if (!sam) { noServiceAreaMap++; continue }
    const biz = (sam.points || []).find(p => p.kind === 'business')
    const lat = biz?.lat ?? sam.centerLat ?? null
    const lng = biz?.lng ?? sam.centerLng ?? null
    if (lat == null || lng == null) { nullPin++; continue }
    if (isDemoCentroid(lat, lng)) {
      fallback++
      affected.push({
        biz: r.business_name || '?',
        zip: r.zip || '?',
        opened: !!r.opened_at,
        gen: r.generated_at,
      })
    } else {
      real++
    }
  }

  console.log('=== Integrity verdict (v2) ===')
  console.log(`  Real-geocode pin:                 ${real}`)
  console.log(`  Demo/fallback Minneapolis pin:    ${fallback}`)
  console.log(`  Null / no pin:                    ${nullPin}`)
  console.log(`  No serviceAreaMap at all:         ${noServiceAreaMap}`)
  const pct = rows.length > 0 ? Math.round((fallback / rows.length) * 100) : 0
  console.log(`\nFallback rate: ${pct}% of reports last 90d show Minneapolis demo coords.`)

  if (fallback > 0) {
    const openedFb = affected.filter(a => a.opened).length
    console.log(`\n${openedFb}/${fallback} fallback reports were OPENED by the prospect.`)
    console.log('\nTop 20 affected (most recent):')
    affected.sort((a, b) => b.gen.localeCompare(a.gen)).slice(0, 20).forEach(a => {
      console.log(`  ${a.gen.slice(0,10)}  zip=${a.zip.padEnd(7)} opened=${a.opened ? 'YES' : 'no '} ${a.biz}`)
    })
  } else {
    console.log('\nDefinitive: zero prospect-visible reports rendered the Minneapolis fallback.')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
