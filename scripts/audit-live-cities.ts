/**
 * Confirm austin/orlando/chicago scrapers are actually producing
 * qualified leads (lead_score >= 70) in their zips, by source.
 * Source upstream is alive — but classifyTrades may still kill yield.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const CITIES = {
  austin: { state: 'TX', zips: ['78701','78702','78703','78704','78705','78712','78717','78719','78721','78722','78723','78724','78725','78726','78727','78728','78729','78730','78731','78732','78733','78734','78735','78736','78737','78738','78739','78741','78742','78744','78745','78746','78747','78748','78749','78750','78751','78752','78753','78754','78756','78757','78758','78759'] },
  orlando: { state: 'FL', zips: ['32801','32803','32804','32805','32806','32807','32808','32809','32810','32811','32812','32814','32817','32818','32819','32820','32821','32822','32824','32825','32826','32827','32828','32829','32831','32832','32833','32834','32835','32836','32837','32839'] },
  chicago: { state: 'IL', zips: ['60601','60602','60603','60604','60605','60606','60607','60608','60609','60610','60611','60612','60613','60614','60615','60616','60617','60618','60619','60620','60621','60622','60623','60624','60625','60626','60628','60629','60630','60631','60632','60633','60634','60636','60637','60638','60639','60640','60641','60642','60643','60644','60645','60646','60647','60649','60651','60652','60653','60654','60655','60656','60657','60659','60660','60661'] },
}

async function main() {
  const thirty = new Date(Date.now() - 30*86400000).toISOString()
  const seven = new Date(Date.now() - 7*86400000).toISOString()
  for (const [city, { zips }] of Object.entries(CITIES)) {
    const { count: total } = await supabase.from('leads').select('id', { count:'exact', head:true }).in('zip', zips).gte('lead_score', 70)
    const { count: fresh30 } = await supabase.from('leads').select('id', { count:'exact', head:true }).in('zip', zips).gte('lead_score', 70).gte('created_at', thirty)
    const { count: fresh7 } = await supabase.from('leads').select('id', { count:'exact', head:true }).in('zip', zips).gte('lead_score', 70).gte('created_at', seven)
    const { data: srcs } = await supabase.from('leads').select('source').in('zip', zips).gte('lead_score', 70).limit(2000)
    const sc = new Map<string,number>()
    for (const r of (srcs||[]) as { source: string }[]) sc.set(r.source, (sc.get(r.source)||0)+1)
    console.log(`\n=== ${city.toUpperCase()} ===`)
    console.log(`  qualified all-time:  ${total}`)
    console.log(`  qualified <30d:      ${fresh30}`)
    console.log(`  qualified <7d:       ${fresh7}`)
    console.log(`  sources:`)
    for (const [s,c] of [...sc.entries()].sort((a,b)=>b[1]-a[1])) console.log(`    ${s.padEnd(20)} ${c}`)
  }
}
main()
