// Phase 2 discovery: confirm inspections dataset + pull 5 samples/schema
// from each candidate. READ-ONLY.
const DOMAIN = 'data.cityofchicago.org'

async function searchCatalog(q) {
  const url = `https://api.us.socrata.com/api/catalog/v1?domains=${DOMAIN}&search_context=${DOMAIN}&q=${encodeURIComponent(q)}&only=datasets&limit=6`
  const r = await fetch(url)
  const j = await r.json()
  return (j.results || []).map((x) => ({ id: x.resource?.id, name: x.resource?.name, updated: (x.resource?.data_updated_at || '').slice(0, 10) }))
}

async function sample(id, n, order) {
  const url = `https://${DOMAIN}/resource/${id}.json?$limit=${n}${order ? `&$order=${encodeURIComponent(order)}` : ''}`
  const r = await fetch(url)
  if (!r.ok) return { error: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` }
  return await r.json()
}

console.log('=== CATALOG: "inspections" (looking for pass/fail building inspections) ===')
for (const h of await searchCatalog('building inspections pass fail')) console.log(` ${h.id} | ${h.updated} | ${h.name}`)
console.log('--- try known candidate uupf-x98q ---')

const CANDIDATES = [
  ['uupf-x98q', 'Building Inspections (candidate)', 'inspection_date DESC'],
  ['22u3-xenr', 'Building Violations', 'violation_date DESC'],
  ['6br9-quuz', 'Ordinance Violations (Admin Hearings)', null],
  ['v6vf-nfxy', '311 Service Requests', 'created_date DESC'],
]

for (const [id, name, order] of CANDIDATES) {
  console.log(`\n=== ${name} [${id}] ===`)
  let rows = await sample(id, 5, order)
  if (rows.error && order) rows = await sample(id, 5, null)  // fall back if column name wrong
  if (rows.error) { console.log(' ', rows.error); continue }
  if (!Array.isArray(rows) || rows.length === 0) { console.log('  (no rows)'); continue }
  console.log('  SCHEMA:', Object.keys(rows[0]).join(', '))
  for (const r of rows.slice(0, 3)) {
    const compact = {}
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string' && v.length > 60) compact[k] = v.slice(0, 60) + '…'
      else if (typeof v === 'object') compact[k] = '[obj]'
      else compact[k] = v
    }
    console.log('  ROW:', JSON.stringify(compact).slice(0, 600))
  }
}
