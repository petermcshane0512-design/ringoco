/**
 * Group the 480 outreach prospects by metro to decide which can be
 * sent to (live supply) vs which must wait (Phoenix/Dallas dead).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const PHX_ZIPS = new Set(['85001','85002','85003','85004','85005','85006','85007','85008','85009','85010','85011','85012','85013','85014','85015','85016','85017','85018','85019','85020','85021','85022','85023','85024','85025','85026','85027','85028','85029','85030','85031','85032','85033','85034','85035','85036','85037','85038','85039','85040','85041','85042','85043','85044','85045','85046','85048','85050','85051','85053','85054','85225','85226','85248','85249','85250','85251','85253','85254','85255','85256','85257','85258','85259','85260','85261','85262','85263','85264','85266','85267','85268','85283','85284','85295','85296','85297','85298','85299'])
const TUC_ZIPS = new Set(['85701','85710','85711','85712','85713','85714','85715','85716','85718','85719','85730','85731','85741','85745','85746','85747'])
const DAL_ZIPS = new Set(['75201','75202','75203','75204','75205','75206','75207','75208','75209','75210','75211','75212','75214','75215','75216','75217','75218','75219','75220','75221','75223','75224','75225','75226','75227','75228','75229','75230','75231','75232','75233','75234','75235','75236','75237','75238','75240','75241','75243','75244','75246','75247','75248','75249','75251','75252','75253','75254','75287'])
const AUS_ZIPS = new Set(['78701','78702','78703','78704','78705','78712','78717','78719','78721','78722','78723','78724','78725','78726','78727','78728','78729','78730','78731','78732','78733','78734','78735','78736','78737','78738','78739','78741','78742','78744','78745','78746','78747','78748','78749','78750','78751','78752','78753','78754','78756','78757','78758','78759'])
const ORL_ZIPS = new Set(['32801','32803','32804','32805','32806','32807','32808','32809','32810','32811','32812','32814','32817','32818','32819','32820','32821','32822','32824','32825','32826','32827','32828','32829','32831','32832','32833','32834','32835','32836','32837','32839','32751','32789','32792','32803'])
const CHI_ZIPS = new Set(['60601','60602','60603','60604','60605','60606','60607','60608','60609','60610','60611','60612','60613','60614','60615','60616','60617','60618','60619','60620','60621','60622','60623','60624','60625','60626','60628','60629','60630','60631','60632','60633','60634','60636','60637','60638','60639','60640','60641','60642','60643','60644','60645','60646','60647','60649','60651','60652','60653','60654','60655','60656','60657','60659','60660','60661'])

function parseCsv(content: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows: Array<Record<string, string>> = []
  for (const line of lines.slice(1)) {
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue }
      cur += c
    }
    cells.push(cur)
    const r: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) r[headers[i]] = (cells[i] || '').trim()
    rows.push(r)
  }
  return { headers, rows }
}

const content = readFileSync(resolve(process.cwd(), 'data/outreach-450.csv'), 'utf8')
const { rows } = parseCsv(content)

const bucket = { phoenix:0, tucson:0, dallas:0, austin:0, orlando:0, chicago:0, other:0, noZip:0 }
const otherCities = new Map<string,number>()

for (const r of rows) {
  const zip = (r.zip || '').slice(0,5)
  if (!zip) { bucket.noZip++; continue }
  if (PHX_ZIPS.has(zip)) bucket.phoenix++
  else if (TUC_ZIPS.has(zip)) bucket.tucson++
  else if (DAL_ZIPS.has(zip)) bucket.dallas++
  else if (AUS_ZIPS.has(zip)) bucket.austin++
  else if (ORL_ZIPS.has(zip)) bucket.orlando++
  else if (CHI_ZIPS.has(zip)) bucket.chicago++
  else {
    bucket.other++
    const c = `${r.city || '?'}, ${r.state || '?'}`
    otherCities.set(c, (otherCities.get(c)||0)+1)
  }
}

console.log(`Total rows:        ${rows.length}`)
console.log(`No zip (drop):     ${bucket.noZip}\n`)
console.log(`=== DEAD-supply metros (wait) ===`)
console.log(`  Phoenix:         ${bucket.phoenix}`)
console.log(`  Tucson:          ${bucket.tucson}  (likely same Accela problem)`)
console.log(`  Dallas:          ${bucket.dallas}`)
console.log(`\n=== LIVE-supply metros (sendable today) ===`)
console.log(`  Austin:          ${bucket.austin}`)
console.log(`  Orlando:         ${bucket.orlando}`)
console.log(`  Chicago:         ${bucket.chicago}`)
console.log(`\n=== Other (need per-metro audit) ===`)
console.log(`  count:           ${bucket.other}`)
const top = [...otherCities.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15)
for (const [c,n] of top) console.log(`    ${c.padEnd(30)} ${n}`)
