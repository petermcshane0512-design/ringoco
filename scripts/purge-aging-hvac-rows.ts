/**
 * Purge all leads.source = 'aging_hvac' rows (synthetic zip-aggregate
 * placeholders from the now-deleted scrape-census-aging generator).
 *
 * They are already filtered out of every customer-facing surface as of
 * 2026-06-10. This script just deletes them from disk so they cannot
 * re-leak via a missed call-site or a future query.
 *
 * Defaults to dry-run. Pass --commit to actually delete.
 *
 *   npx tsx scripts/purge-aging-hvac-rows.ts              # dry run
 *   npx tsx scripts/purge-aging-hvac-rows.ts --commit     # delete
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const commit = process.argv.includes('--commit')

  const { count: before } = await supabase.from('leads').select('id', { count:'exact', head:true }).eq('source', 'aging_hvac')
  const { count: realBefore } = await supabase.from('leads').select('id', { count:'exact', head:true }).neq('source', 'aging_hvac')
  console.log(`Before:  aging_hvac=${before}  real=${realBefore}`)

  // Are any aging_hvac rows referenced by lead_drops? If yes those tenants
  // would lose drop history rows on delete (FK cascades or fails).
  const { count: dropRefs } = await supabase.from('lead_drops')
    .select('id', { count:'exact', head:true })
    .in('lead_id', (await supabase.from('leads').select('id').eq('source','aging_hvac').limit(1000)).data?.map(r=>r.id) ?? [])
  console.log(`Referenced by lead_drops (sampled top 1000): ${dropRefs}`)

  if (!commit) {
    console.log('\nDRY RUN. Pass --commit to delete.')
    return
  }

  console.log('\nDeleting…')
  const { error, count: deleted } = await supabase.from('leads').delete({ count:'exact' }).eq('source', 'aging_hvac')
  if (error) {
    console.error('DELETE failed:', error.message)
    process.exit(1)
  }
  console.log(`Deleted ${deleted} rows.`)

  const { count: after } = await supabase.from('leads').select('id', { count:'exact', head:true }).eq('source', 'aging_hvac')
  const { count: realAfter } = await supabase.from('leads').select('id', { count:'exact', head:true }).neq('source', 'aging_hvac')
  console.log(`After:   aging_hvac=${after}  real=${realAfter}`)
}
main().catch(e => { console.error(e); process.exit(1) })
