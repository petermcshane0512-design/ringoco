// Florida enforcement-data discovery — READ-ONLY. Confirms which FL metros
// publish code-enforcement / violation data on Socrata (free, no key) so we
// can run the same enforcement engine + zip-stats there. No token spend.
const PORTALS = [
  ['Orlando', 'data.cityoforlando.net'],
  ['Tampa', 'opendata.tampagov.net'],
  ['Miami-Dade', 'opendata.miamidade.gov'],
  ['Fort Lauderdale', 'data.fortlauderdale.gov'],
  ['Gainesville', 'data.cityofgainesville.org'],
  ['Tallahassee', 'data.talgov.com'],
]

async function searchCatalog(domain, q) {
  try {
    const url = `https://api.us.socrata.com/api/catalog/v1?domains=${domain}&search_context=${domain}&q=${encodeURIComponent(q)}&only=datasets&limit=6`
    const r = await fetch(url)
    if (!r.ok) return { err: `HTTP ${r.status}` }
    const j = await r.json()
    return { hits: (j.results || []).map((x) => ({ id: x.resource?.id, name: x.resource?.name, updated: (x.resource?.data_updated_at || '').slice(0, 10) })) }
  } catch (e) { return { err: e.message } }
}

for (const [label, domain] of PORTALS) {
  console.log(`\n===== ${label} (${domain}) =====`)
  for (const q of ['code enforcement', 'violations', 'permits roof']) {
    const r = await searchCatalog(domain, q)
    if (r.err) { console.log(`  [${q}] ${r.err}`); continue }
    if (!r.hits.length) { console.log(`  [${q}] (none)`); continue }
    for (const h of r.hits.slice(0, 3)) console.log(`  [${q}] ${h.id} | ${h.updated} | ${h.name}`)
  }
}
