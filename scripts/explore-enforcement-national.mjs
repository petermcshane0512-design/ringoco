// National enforcement-data discovery — READ-ONLY, no ingest, no token spend.
// Finds which big cities publish violation/enforcement data on Socrata and
// what trades each covers. Answers: beyond Chicago roofs, where + who can we
// sell to (HVAC no-heat, plumbing, electrical, masonry, etc.).
const CITIES = [
  ['New York',     'data.cityofnewyork.us'],
  ['Los Angeles',  'data.lacity.org'],
  ['Austin',       'data.austintexas.gov'],
  ['Dallas',       'www.dallasopendata.com'],
  ['San Francisco','data.sfgov.org'],
  ['Seattle',      'data.seattle.gov'],
  ['Baltimore',    'data.baltimorecity.gov'],
  ['Kansas City',  'data.kcmo.org'],
]

async function search(domain, q) {
  try {
    const url = `https://api.us.socrata.com/api/catalog/v1?domains=${domain}&search_context=${domain}&q=${encodeURIComponent(q)}&only=datasets&limit=5`
    const r = await fetch(url)
    if (!r.ok) return []
    const j = await r.json()
    return (j.results || []).map((x) => ({ id: x.resource?.id, name: x.resource?.name, updated: (x.resource?.data_updated_at || '').slice(0, 10) }))
  } catch { return [] }
}

for (const [label, domain] of CITIES) {
  console.log(`\n===== ${label} (${domain}) =====`)
  for (const q of ['building violations', 'housing code violations heat', 'environmental control board penalties']) {
    const hits = await search(domain, q)
    if (!hits.length) { console.log(`  [${q}] (none / portal not Socrata)`); continue }
    for (const h of hits.slice(0, 2)) console.log(`  [${q}] ${h.id} | ${h.updated} | ${h.name}`)
  }
}
