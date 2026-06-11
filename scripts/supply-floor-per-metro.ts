/**
 * Per-metro supply floor: qualified (non-synthetic) leads/wk from last
 * 4 weeks, and number of customers each metro can sustain at
 * LEADS_PER_WEEK=5 with 2x headroom (so 10 fresh/wk per customer slot).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const METROS = {
  Austin: ['78701','78702','78703','78704','78705','78712','78717','78719','78721','78722','78723','78724','78725','78726','78727','78728','78729','78730','78731','78732','78733','78734','78735','78736','78737','78738','78739','78741','78742','78744','78745','78746','78747','78748','78749','78750','78751','78752','78753','78754','78756','78757','78758','78759'],
  Chicago: ['60601','60602','60603','60604','60605','60606','60607','60608','60609','60610','60611','60612','60613','60614','60615','60616','60617','60618','60619','60620','60621','60622','60623','60624','60625','60626','60628','60629','60630','60631','60632','60633','60634','60636','60637','60638','60639','60640','60641','60642','60643','60644','60645','60646','60647','60649','60651','60652','60653','60654','60655','60656','60657','60659','60660','60661'],
  Orlando: ['32801','32803','32804','32805','32806','32807','32808','32809','32810','32811','32812','32814','32817','32818','32819','32820','32821','32822','32824','32825','32826','32827','32828','32829','32831','32832','32833','32834','32835','32836','32837','32839'],
}

const LEADS_PER_WEEK_PER_CUSTOMER = 5
const HEADROOM_FACTOR = 2  // need 2x supply to absorb dedup/region drift
const MIN_CUSTOMER_FLOOR = 5

async function main() {
  console.log('Per-metro supply floor (last 4 weeks, real-property sources only)\n')
  console.log('metro      | wk1 | wk2 | wk3 | wk4 | avg/wk | customers @ 5/wk × 2 | sendable?')
  console.log('-----------|-----|-----|-----|-----|--------|----------------------|----------')

  for (const [metro, zips] of Object.entries(METROS)) {
    const weeks: number[] = []
    for (let w = 0; w < 4; w++) {
      const end = new Date(Date.now() - w * 7 * 86400000).toISOString()
      const start = new Date(Date.now() - (w + 1) * 7 * 86400000).toISOString()
      const { count } = await supabase.from('leads')
        .select('id', { count: 'exact', head: true })
        .in('zip', zips)
        .gte('lead_score', 70)
        .neq('source', 'aging_hvac')
        .gte('created_at', start)
        .lt('created_at', end)
      weeks.push(count || 0)
    }
    const avg = Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length)
    const customers = Math.floor(avg / (LEADS_PER_WEEK_PER_CUSTOMER * HEADROOM_FACTOR))
    const sendable = customers >= MIN_CUSTOMER_FLOOR ? 'YES' : 'NO'
    console.log(`${metro.padEnd(10)} | ${String(weeks[0]).padStart(3)} | ${String(weeks[1]).padStart(3)} | ${String(weeks[2]).padStart(3)} | ${String(weeks[3]).padStart(3)} | ${String(avg).padStart(6)} | ${String(customers).padStart(20)} | ${sendable}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
