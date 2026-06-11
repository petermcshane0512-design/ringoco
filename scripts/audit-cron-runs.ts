/**
 * Read cron_runs telemetry to prove whether Vercel cron is invoking the
 * scraper routes on schedule, or only on-demand admin triggers are
 * producing rows.
 *
 * Pass --route=X to filter. Default: scrape-permits-chicago + austin + orlando.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const args = process.argv.slice(2)
  const routeArg = args.find(a => a.startsWith('--route='))?.slice('--route='.length)
  const routes = routeArg ? [routeArg] : ['scrape-permits-chicago', 'scrape-permits-austin', 'scrape-permits-orlando']

  for (const route of routes) {
    const { data, count } = await supabase
      .from('cron_runs')
      .select('started_at, mode, ok, duration_ms, detail', { count: 'exact' })
      .eq('route', route)
      .order('started_at', { ascending: false })
      .limit(50)
    console.log(`\n=== ${route} (total=${count}) ===`)
    if (!data || data.length === 0) { console.log('  no rows yet'); continue }
    console.log(`  started_at                  mode           ok  dur_ms  insert`)
    for (const r of data as Array<{ started_at: string; mode: string; ok: boolean | null; duration_ms: number | null; detail: Record<string, unknown> | null }>) {
      const inserted = (r.detail?.leads_inserted_or_dedup ?? '') as number | string
      const dur = r.duration_ms ?? ''
      console.log(`  ${r.started_at.slice(0,19)}  ${(r.mode||'').padEnd(13)}  ${String(r.ok ?? '').padEnd(3)} ${String(dur).padStart(6)}  ${inserted}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
