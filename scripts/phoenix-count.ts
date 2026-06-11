import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
async function main() {
  const PHX = ['85001','85002','85003','85004','85005','85006','85007','85008','85009','85010','85011','85012','85013','85014','85015','85016','85017','85018','85019','85020','85021','85022','85023','85024','85025','85026','85027','85028','85029','85030','85031','85032','85033','85034','85035','85036','85037','85038','85039','85040','85041','85042','85043','85044','85045','85046','85048','85050','85051','85053','85054','85710','85711','85712','85713','85714','85715','85716','85717','85718','85719','85720','85721','85722','85723','85724','85725','85726','85728','85729','85730','85731','85732','85733','85734','85735','85736','85737','85738','85739','85740','85741','85742','85743','85744','85745','85746','85747','85748','85749','85750','85751','85752','85753','85754','85755','85756','85757','85775']
  const thirty = new Date(Date.now() - 30*86400000).toISOString()
  const ninety = new Date(Date.now() - 90*86400000).toISOString()
  const { count: phxTotal } = await supabase.from('leads').select('id', { count:'exact', head:true }).in('zip', PHX).gte('lead_score', 70)
  const { count: phxFresh } = await supabase.from('leads').select('id', { count:'exact', head:true }).in('zip', PHX).gte('lead_score', 70).gte('created_at', thirty)
  const { count: phxMid } = await supabase.from('leads').select('id', { count:'exact', head:true }).in('zip', PHX).gte('lead_score', 70).gte('created_at', ninety).lt('created_at', thirty)
  console.log('Phoenix qualified (any age):     ', phxTotal)
  console.log('Phoenix qualified <30d:           ', phxFresh)
  console.log('Phoenix qualified 30-90d:         ', phxMid)
  const { data: srcs } = await supabase.from('leads').select('source').in('zip', PHX).gte('lead_score', 70).limit(2000)
  const sc = new Map<string,number>()
  for (const r of (srcs||[]) as { source: string }[]) sc.set(r.source, (sc.get(r.source)||0)+1)
  console.log('\nPhoenix sources (all-time qualified):')
  for (const [s,c] of [...sc.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${s.padEnd(20)} ${c}`)
}
main()
