// Discovery pass — Chicago data portal dataset IDs for enforcement-tier
// lead sources. READ-ONLY: catalog search + 5 sample records + schema per
// candidate. No ingestion code until Peter approves IDs (his guardrail).
const DOMAIN = 'data.cityofchicago.org'

async function searchCatalog(q) {
  const url = `https://api.us.socrata.com/api/catalog/v1?domains=${DOMAIN}&search_context=${DOMAIN}&q=${encodeURIComponent(q)}&only=datasets&limit=8`
  const r = await fetch(url)
  const j = await r.json()
  return (j.results || []).map((x) => ({
    id: x.resource?.id,
    name: x.resource?.name,
    updated: (x.resource?.data_updated_at || '').slice(0, 10),
    rows: x.resource?.columns_field_name?.length ? undefined : undefined,
    desc: (x.resource?.description || '').slice(0, 110),
  }))
}

async function sample(id, n = 5, select = null) {
  const url = `https://${DOMAIN}/resource/${id}.json?$limit=${n}${select ? `&$select=${select}` : ''}&$order=:id DESC`
  const r = await fetch(url)
  if (!r.ok) return { error: `HTTP ${r.status}` }
  return await r.json()
}

for (const q of ['building inspections', 'ordinance violations administrative hearings', '311 service requests']) {
  console.log(`\n=== CATALOG: "${q}" ===`)
  const hits = await searchCatalog(q)
  for (const h of hits) console.log(` ${h.id} | ${h.updated} | ${h.name}`)
}
