/**
 * BatchData balance check.
 *
 * Calls the BatchData /api/v1/account/credit-summary endpoint and prints
 * current balance + per-product cost projections for the 480-prospect
 * send so Peter knows if BatchData runs dry mid-send.
 *
 * Run:
 *   npx tsx scripts/batchdata-balance.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const ENDPOINTS = [
  // BatchData docs surface a few balance/credit endpoints depending on plan;
  // we try the most likely first and fall back.
  'https://api.batchdata.com/api/v1/account/credit-summary',
  'https://api.batchdata.com/api/v1/account/balance',
  'https://api.batchdata.com/api/v1/user/credit-summary',
]

async function main() {
  const key = process.env.BATCHDATA_API_KEY
  if (!key) {
    console.error('BATCHDATA_API_KEY not set in .env.local')
    console.error('Paste real key from Vercel → Settings → Env Vars → BATCHDATA_API_KEY')
    process.exit(1)
  }

  for (const url of ENDPOINTS) {
    try {
      console.log(`\nTrying ${url}…`)
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
      })
      const text = await res.text()
      console.log(`  status: ${res.status}`)
      console.log(`  body:   ${text.slice(0, 400)}`)
      if (res.ok) {
        const j = JSON.parse(text)
        console.log(`\n=== Found balance endpoint ===`)
        console.log(JSON.stringify(j, null, 2))
        break
      }
    } catch (e) {
      console.log(`  err: ${(e as Error).message}`)
    }
  }

  // Cost projection for the 480 send + 16 Phoenix backfill.
  console.log('\n=== Cost projection (worst-case) ===')
  console.log('Per-prospect free-lead pre-pull (uses existing leads inventory): $0')
  console.log('Phoenix on-demand backfill scrape: ~$0.05 × 100 = $5')
  console.log('Skip-trace top 20 hot replies: $0.10 × 20 = $2')
  console.log('Total likely BatchData spend tomorrow: $7-15')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
