/**
 * Inspect insertion timing on the leads table for permit sources to see
 * exactly when scrapers last produced rows. If the cron is firing daily,
 * we expect a small batch of new (street_address, source='permit') rows
 * appearing inside each city's zip set every day.
 *
 * Output: per-source, per-day-bucket lead-count for the last 14 days,
 * across the 3 live cities (Chicago / Austin / Orlando).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const ZIPS: Record<string, string[]> = {
  Chicago: ['60601','60602','60603','60604','60605','60606','60607','60608','60609','60610','60611','60612','60613','60614','60615','60616','60617','60618','60619','60620','60621','60622','60623','60624','60625','60626','60628','60629','60630','60631','60632','60633','60634','60636','60637','60638','60639','60640','60641','60642','60643','60644','60645','60646','60647','60649','60651','60652','60653','60654','60655','60656','60657','60659','60660','60661'],
  Austin: ['78701','78702','78703','78704','78705','78712','78717','78719','78721','78722','78723','78724','78725','78726','78727','78728','78729','78730','78731','78732','78733','78734','78735','78736','78737','78738','78739','78741','78742','78744','78745','78746','78747','78748','78749','78750','78751','78752','78753','78754','78756','78757','78758','78759'],
  Orlando: ['32801','32803','32804','32805','32806','32807','32808','32809','32810','32811','32812','32814','32817','32818','32819','32820','32821','32822','32824','32825','32826','32827','32828','32829','32831','32832','32833','32834','32835','32836','32837','32839'],
}

async function dailyBuckets(zips: string[]): Promise<{ day: string; count: number }[]> {
  const start = new Date(Date.now() - 14 * 86400000)
  start.setUTCHours(0, 0, 0, 0)
  const { data } = await supabase
    .from('leads')
    .select('created_at')
    .eq('source', 'permit')
    .in('zip', zips)
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: true })
    .limit(20000)
  const map = new Map<string, number>()
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
    map.set(d, 0)
  }
  for (const r of (data || []) as { created_at: string }[]) {
    const d = r.created_at.slice(0, 10)
    map.set(d, (map.get(d) || 0) + 1)
  }
  return [...map.entries()].map(([day, count]) => ({ day, count }))
}

async function lastInsert(zips: string[]): Promise<string | null> {
  const { data } = await supabase
    .from('leads')
    .select('created_at')
    .eq('source', 'permit')
    .in('zip', zips)
    .order('created_at', { ascending: false })
    .limit(1)
  return (data?.[0] as { created_at: string } | undefined)?.created_at ?? null
}

async function main() {
  console.log('Per-city daily permit-source insert counts (last 14d):\n')
  for (const [city, zips] of Object.entries(ZIPS)) {
    const buckets = await dailyBuckets(zips)
    const last = await lastInsert(zips)
    console.log(`=== ${city} ===`)
    console.log(`  last permit-source insert: ${last ?? '(never)'}`)
    for (const b of buckets) console.log(`  ${b.day}  ${b.count}`)
    console.log('')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
