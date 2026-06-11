/**
 * Tag the 43 prospects whose sample_report rendered the Minneapolis
 * fallback pin out of all future sends. Match outreach_leads on
 * business_name (case-insensitive).
 *
 * Dry-run by default. Pass --commit to write.
 *
 *   npx tsx scripts/tag-burned-demo-43.ts             # dry
 *   npx tsx scripts/tag-burned-demo-43.ts --commit    # write
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
  const commit = process.argv.includes('--commit')
  const ninety = new Date(Date.now() - 90 * 86400000).toISOString()

  // Pull sample_reports last 90d.
  const { data, error } = await supabase
    .from('sample_reports')
    .select('id, business_name, zip, opened_at, report')
    .gte('generated_at', ninety)
    .order('generated_at', { ascending: false })
    .limit(10000)
  if (error) { console.error(error.message); process.exit(1) }

  type Row = { id: string; business_name: string | null; zip: string | null; opened_at: string | null; report: unknown }
  const affected: { biz: string; opened: boolean }[] = []
  for (const r of (data || []) as Row[]) {
    const report = r.report as Record<string, unknown> | null
    const sam = (report as { serviceAreaMap?: { points?: Array<{ kind?: string; lat?: number | null; lng?: number | null }>; centerLat?: number | null; centerLng?: number | null } } | null)?.serviceAreaMap
    if (!sam) continue
    const biz = (sam.points || []).find(p => p.kind === 'business')
    const lat = biz?.lat ?? sam.centerLat ?? null
    const lng = biz?.lng ?? sam.centerLng ?? null
    if (!isDemoCentroid(lat, lng)) continue
    affected.push({ biz: r.business_name || '', opened: !!r.opened_at })
  }
  console.log(`Affected sample_reports: ${affected.length}`)
  console.log(`Of which opened: ${affected.filter(a => a.opened).length}`)

  const names = [...new Set(affected.map(a => a.biz).filter(Boolean))]
  console.log(`Distinct business_names: ${names.length}\n`)

  let matched = 0
  let unmatched: string[] = []
  const matchedIds: string[] = []
  for (const name of names) {
    const { data: ol } = await supabase
      .from('outreach_leads')
      .select('id, business_name')
      .ilike('business_name', name)
      .limit(5)
    if (!ol || ol.length === 0) { unmatched.push(name); continue }
    matched += ol.length
    matchedIds.push(...ol.map(r => r.id))
  }
  console.log(`outreach_leads matched: ${matched}`)
  console.log(`Names with no outreach_leads match: ${unmatched.length}`)
  if (unmatched.length > 0) {
    console.log('  First 10 unmatched:', unmatched.slice(0, 10))
  }

  if (!commit) {
    console.log('\nDRY RUN. Pass --commit to write burned_demo_at + reason.')
    return
  }

  if (matchedIds.length === 0) {
    console.log('Nothing to tag.')
    return
  }

  const now = new Date().toISOString()
  const REASON = 'sample_report rendered Minneapolis demo centroid (lat 44.9489 lng -93.3479) instead of real metro; do not include in future sends; if they reply, honesty: early demo bug, here is a real sample.'
  // Batched in chunks to stay under PostgREST URL length limits.
  const CHUNK = 200
  let updated = 0
  for (let i = 0; i < matchedIds.length; i += CHUNK) {
    const ids = matchedIds.slice(i, i + CHUNK)
    const { error: upErr, count } = await supabase.from('outreach_leads')
      .update({ burned_demo_at: now, burned_demo_reason: REASON }, { count: 'exact' })
      .in('id', ids)
    if (upErr) { console.error(`batch ${i / CHUNK} err: ${upErr.message}`); continue }
    updated += count || 0
  }
  console.log(`\nTagged ${updated} outreach_leads rows as burned_demo.`)
}
main().catch(e => { console.error(e); process.exit(1) })
