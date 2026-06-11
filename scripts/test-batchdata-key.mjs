// One-shot BatchData connectivity test (key passed via CLI arg).
// Pulls 3 owner-occupied properties in a zip — proves key valid + funded.
const key = process.argv[2]
const zip = process.argv[3] || '60643'
if (!key) { console.error('usage: node scripts/test-batchdata-key.mjs <api_key> [zip]'); process.exit(1) }

const res = await fetch('https://api.batchdata.com/api/v1/property/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    searchCriteria: { query: zip, owner: { occupied: true } },
    options: { take: 3 },
  }),
})
console.log('HTTP', res.status)
const j = await res.json().catch(() => null)
const props = j?.results?.properties ?? []
console.log('properties returned:', props.length)
for (const p of props) {
  console.log(' -', p.address?.street, '| built', p.building?.yearBuilt ?? '?', '| owner', p.owner?.fullName ?? p.owner?.name?.full ?? '?')
}
if (!res.ok) console.log('body:', JSON.stringify(j).slice(0, 300))
