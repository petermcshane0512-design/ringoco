// Orlando Code Enforcement schema + 5 samples. READ-ONLY.
const D = 'data.cityoforlando.net'
async function sample(id, n, order) {
  const url = `https://${D}/resource/${id}.json?$limit=${n}${order ? `&$order=${encodeURIComponent(order)}` : ''}`
  const r = await fetch(url)
  if (!r.ok) return { error: `HTTP ${r.status}: ${(await r.text()).slice(0, 150)}` }
  return await r.json()
}
// try common date fields for ordering; fall back to none
let rows = await sample('k6e8-nw6w', 6, 'last_updated_date DESC')
if (rows.error) rows = await sample('k6e8-nw6w', 6, null)
if (rows.error) { console.log(rows.error); process.exit(1) }
console.log('SCHEMA:', Object.keys(rows[0]).join(', '))
console.log('\nROW COUNT in sample:', rows.length)
for (const r of rows.slice(0, 5)) {
  const c = {}
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string' && v.length > 55) c[k] = v.slice(0, 55) + '…'
    else if (typeof v === 'object') c[k] = '[obj]'
    else c[k] = v
  }
  console.log('\nROW:', JSON.stringify(c))
}
