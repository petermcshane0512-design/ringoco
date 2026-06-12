// NYC ingest schema discovery — READ-ONLY. Confirms field names + coords +
// status for the datasets we'll ingest. No token spend.
const D = 'data.cityofnewyork.us'

async function schema(id, where, order) {
  const url = `https://${D}/resource/${id}.json?$limit=3${where ? `&$where=${encodeURIComponent(where)}` : ''}${order ? `&$order=${encodeURIComponent(order)}` : ''}`
  const r = await fetch(url)
  if (!r.ok) return { error: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` }
  const rows = await r.json()
  if (!rows.length) return { error: 'no rows' }
  return { keys: Object.keys(rows[0]), sample: rows[0] }
}

async function search(q) {
  const url = `https://api.us.socrata.com/api/catalog/v1?domains=${D}&search_context=${D}&q=${encodeURIComponent(q)}&only=datasets&limit=5`
  const j = await (await fetch(url)).json()
  return (j.results || []).map((x) => ({ id: x.resource?.id, name: x.resource?.name, updated: (x.resource?.data_updated_at || '').slice(0, 10) }))
}

console.log('=== find facade / Local Law 11 / FISP datasets ===')
for (const h of await search('facade FISP local law 11 unsafe')) console.log(`  ${h.id} | ${h.updated} | ${h.name}`)
console.log('\n=== find DOB / ECB violations with penalties ===')
for (const h of await search('DOB ECB violations')) console.log(`  ${h.id} | ${h.updated} | ${h.name}`)

console.log('\n=== HPD Housing Violations [wvxf-dwi5] schema ===')
const hpd = await schema('wvxf-dwi5', "violationstatus='Open'", 'inspectiondate DESC')
console.log(hpd.error ? hpd.error : '  keys: ' + hpd.keys.join(', '))
if (hpd.sample) {
  const s = hpd.sample
  console.log('  address fields:', JSON.stringify({ house: s.housenumber, street: s.streetname, boro: s.boro, zip: s.zip, lat: s.latitude, lng: s.longitude, bbl: s.bbl }))
  console.log('  signal fields:', JSON.stringify({ class: s.class, status: s.violationstatus, desc: (s.novdescription||'').slice(0,80), date: s.inspectiondate, category: s.category, apt: s.apartment }))
}
