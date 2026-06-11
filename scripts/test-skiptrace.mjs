// One-shot BatchData skip-trace test. usage: node scripts/test-skiptrace.mjs <key> "<street>" <zip>
const key = process.argv[2]
const street = process.argv[3] || '2350 W 110TH PL'
const zip = process.argv[4] || '60643'
const res = await fetch('https://api.batchdata.com/api/v1/property/skip-trace', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ requests: [{ propertyAddress: { street, city: 'Chicago', state: 'IL', zip } }] }),
})
console.log('HTTP', res.status)
const j = await res.json().catch(() => null)
const persons = j?.results?.persons ?? []
console.log('persons:', persons.length)
for (const p of persons) {
  console.log(' name:', p.name?.full, '| phones:', (p.phoneNumbers ?? []).map((x) => x.number).join(', ') || 'none', '| emails:', (p.emails ?? []).map((x) => x.email).join(', ') || 'none')
}
if (!res.ok) console.log('body:', JSON.stringify(j).slice(0, 400))
