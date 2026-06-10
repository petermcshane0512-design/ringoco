import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

// Fire a minimal Property Search call + inspect response headers — BatchData
// often returns credit-balance + rate-limit info in headers.
async function main() {
  const key = process.env.BATCHDATA_API_KEY!
  const r = await fetch('https://api.batchdata.com/api/v1/property/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      searchCriteria: { zip: '60601', ownerOccupiedOnly: true },
      options: { take: 1 },
    }),
  })
  console.log('STATUS', r.status)
  console.log('\nHEADERS:')
  for (const [k, v] of r.headers.entries()) {
    console.log(`  ${k}: ${v}`)
  }
  const text = await r.text()
  console.log('\nBODY (first 600 chars):')
  console.log(text.slice(0, 600))
}
main()
