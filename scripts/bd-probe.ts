// Test BatchData accepts city+state instead of zip.
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const key = process.env.BATCHDATA_API_KEY!
  const res = await fetch('https://api.batchdata.com/api/v1/property/search', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchCriteria: {
        city: 'Dallas',
        state: 'TX',
        ownerOccupiedOnly: true,
        yearBuiltMin: 1985,
        yearBuiltMax: 2005,
      },
      options: { take: 3 },
    }),
  })
  const data = await res.json() as {
    status?: { code?: number; message?: string }
    results?: { properties?: Array<{ address?: { street?: string; city?: string; zip?: string }; building?: { yearBuilt?: number }; owner?: { name?: { full?: string } } }> }
  }
  console.log('STATUS', res.status, data.status?.message || '')
  const props = data.results?.properties || []
  console.log(`Properties returned: ${props.length}`)
  for (const p of props) {
    console.log(`  ${p.address?.street}, ${p.address?.city} ${p.address?.zip} · built ${p.building?.yearBuilt} · ${p.owner?.name?.full || 'N/A'}`)
  }
}
main()
