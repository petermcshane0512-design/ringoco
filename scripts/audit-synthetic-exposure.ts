/**
 * Quantify aging_hvac (synthetic) row exposure across every consumer.
 *
 * Synthetic = scrape-census-aging route 217 — one row per zip, street_address
 * is a placeholder string ("Aging HVAC opportunity · ZIP 85016 · 12 est. units/yr").
 * No homeowner, no real property. Customer-facing surfaces should NEVER show these.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  console.log('=== aging_hvac (SYNTHETIC) exposure audit ===\n')

  const { count: agingTotal } = await supabase.from('leads').select('id', { count:'exact', head:true }).eq('source', 'aging_hvac')
  const { count: realTotal } = await supabase.from('leads').select('id', { count:'exact', head:true }).neq('source', 'aging_hvac')
  const { count: total } = await supabase.from('leads').select('id', { count:'exact', head:true })
  console.log(`leads.aging_hvac:           ${agingTotal}`)
  console.log(`leads.real (non-aging):     ${realTotal}`)
  console.log(`leads.total:                ${total}`)
  console.log(`% synthetic in pool:        ${total ? Math.round((agingTotal!/total)*100) : 0}%\n`)

  console.log('=== Surface exposure ===\n')

  console.log('Surface 1 — discover-for-tenant widget candidate counts (zip-pool):')
  console.log('  Source: src/app/api/agents/discover-for-tenant/route.ts:155,199,213')
  console.log('  Query: leads.contains(trade_match,[X]).in(zip,Y) — DOES NOT exclude source')
  console.log('  Result: every "X candidates in your area" widget message INCLUDES synthetic rows\n')

  console.log('Surface 2 — dashboard/leads page rendering:')
  const { count: dashAging } = await supabase.from('leads').select('id', { count:'exact', head:true }).eq('source', 'aging_hvac')
  console.log(`  ${dashAging} aging_hvac rows render as lead cards w/ 🌡️ badge + door-knock pitch.`)
  console.log('  Card shows "📍 ZIP 85016" w/ no real address + "Owner unlisted"\n')

  console.log('Surface 3 — outbound message generator (per-lead):')
  console.log('  src/app/api/leads/[id]/generate-message/route.ts:76')
  console.log('  describeSignal(\'aging_hvac\') returns "your HVAC system flagged as past typical lifespan (16+ yrs)"')
  console.log('  CLAIM IS FALSE — no real homeowner property; statement implies per-property finding\n')

  console.log('Surface 4 — auto-load-instantly outreach template:')
  console.log('  src/app/api/crons/auto-load-instantly/route.ts:95')
  console.log('  Emits "aging HVAC zone · ~X units/yr need replacement" in cold-email body\n')

  console.log('Surface 5 — prepull-free-leads (free-lead deliverable):')
  console.log('  scripts/prepull-free-leads.ts:146 — maps aging_hvac → "System age 15+ years per county records"')
  console.log('  PER-PROPERTY claim, no underlying property — would deliver as fake free-lead\n')

  console.log('=== Per-zip widget delta (top metros) ===\n')
  const metros: Record<string, string[]> = {
    Phoenix: ['85001','85002','85003','85004','85005','85006','85007','85008','85009','85010','85011','85012','85013','85014','85015','85016','85017','85018','85019','85020','85021','85022','85023','85024','85025','85026','85027','85028','85029','85030','85031','85032','85033','85034','85035','85036','85037','85038','85039','85040','85041','85042','85043','85044','85045','85046','85048','85050','85051','85053','85054'],
    Austin: ['78701','78702','78703','78704','78705','78712','78717','78719','78721','78722','78723','78724','78725','78726','78727','78728','78729','78730','78731','78732','78733','78734','78735','78736','78737','78738','78739','78741','78742','78744','78745','78746','78747','78748','78749','78750','78751','78752','78753','78754','78756','78757','78758','78759'],
    Chicago: ['60601','60602','60603','60604','60605','60606','60607','60608','60609','60610','60611','60612','60613','60614','60615','60616','60617','60618','60619','60620','60621','60622','60623','60624','60625','60626','60628','60629','60630','60631','60632','60633','60634','60636','60637','60638','60639','60640','60641','60642','60643','60644','60645','60646','60647','60649','60651','60652','60653','60654','60655','60656','60657','60659','60660','60661'],
    Orlando: ['32801','32803','32804','32805','32806','32807','32808','32809','32810','32811','32812','32814','32817','32818','32819','32820','32821','32822','32824','32825','32826','32827','32828','32829','32831','32832','32833','32834','32835','32836','32837','32839'],
  }
  for (const [metro, zips] of Object.entries(metros)) {
    const { count: withSyn } = await supabase.from('leads').select('id', { count:'exact', head:true }).gte('lead_score', 70).in('zip', zips)
    const { count: realOnly } = await supabase.from('leads').select('id', { count:'exact', head:true }).gte('lead_score', 70).in('zip', zips).neq('source', 'aging_hvac')
    const fake = (withSyn || 0) - (realOnly || 0)
    console.log(`  ${metro.padEnd(10)} widget shows ${withSyn} → real only ${realOnly} (${fake} synthetic removed)`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
