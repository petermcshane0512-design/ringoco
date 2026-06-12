// Test BatchData property search by FULL ADDRESS (not zip) — the dossier
// enrichment depends on this query shape working.
const key = process.argv[2]
const res = await fetch('https://api.batchdata.com/api/v1/property/search', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    searchCriteria: { query: '9520 S LONGWOOD DR, Chicago, IL 60643' },
    options: { take: 1 },
  }),
})
console.log('HTTP', res.status)
const j = await res.json().catch(() => null)
const p = j?.results?.properties?.[0]
if (!p) { console.log('no property. body:', JSON.stringify(j).slice(0, 300)); process.exit(1) }
console.log(JSON.stringify({
  street: p.address?.street,
  yearBuilt: p.building?.yearBuilt,
  sqft: p.building?.totalBuildingAreaSquareFeet,
  beds: p.building?.bedroomCount,
  baths: p.building?.bathroomCount,
  value: p.valuation?.estimatedValue,
  equity: p.valuation?.equityCurrentEstimatedBalance ?? p.openLien?.totalOpenLienBalance,
  lastSaleDate: p.sale?.lastSale?.saleDate ?? p.deedHistory?.[0]?.recordingDate,
  lastSalePrice: p.sale?.lastSale?.saleAmount ?? p.deedHistory?.[0]?.salePrice,
  ownerOccupied: p.owner?.occupied ?? p.ownerOccupied,
}, null, 1))
