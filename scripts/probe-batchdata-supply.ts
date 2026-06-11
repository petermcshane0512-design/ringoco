/**
 * Probe BatchData Property Search w/ live HVAC recipe across 3 zips to
 * prove the on-signup fulfillment path actually returns 80 candidates.
 *
 * Recipe matches find-real-leads HVAC config:
 *   year_built 1985-2005, owner-occupied, single-family
 *
 * Probes:
 *   - 60615 Chicago HVAC
 *   - 78704 Austin HVAC
 *   - 85016 Phoenix HVAC (no shared permit pool — pure BatchData play)
 *
 * Does NOT skip-trace. Read-only intent. Each property search call costs
 * $0.05/result returned, so 3 × 15 = $2.25 max for the probe.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const ZIPS = [
  { zip: '60615', label: 'Chicago HVAC (60615)' },
  { zip: '78704', label: 'Austin HVAC (78704)' },
  { zip: '85016', label: 'Phoenix HVAC (85016)' },
]

async function probe(zip: string) {
  const apiKey = process.env.BATCHDATA_API_KEY
  if (!apiKey) { console.error('BATCHDATA_API_KEY not set'); process.exit(1) }
  const body = {
    searchCriteria: {
      query: zip,
      yearBuiltMin: 1985,
      yearBuiltMax: 2005,
      ownerOccupied: true,
    },
    options: { take: 15, skip: 0 },
  }
  const startedAt = Date.now()
  try {
    const r = await fetch('https://api.batchdata.com/api/v1/property/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    })
    const elapsed = Date.now() - startedAt
    if (!r.ok) {
      const txt = await r.text()
      return { ok: false, http: r.status, elapsed_ms: elapsed, body_first_400: txt.slice(0, 400) }
    }
    const j = await r.json() as { results?: { properties?: Array<Record<string, unknown>> }; status?: { code?: number; text?: string } }
    const props = j?.results?.properties ?? []
    const owners = props.filter((p) => (p as { owner?: { mailingAddress?: { street?: string } } }).owner?.mailingAddress?.street).length
    return {
      ok: true,
      elapsed_ms: elapsed,
      returned: props.length,
      with_owner_address: owners,
      sample: (props[0] as unknown as { address?: { street?: string; city?: string; state?: string; zip?: string }; owner?: { fullName?: string }; building?: { yearBuilt?: number } }) ?? null,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message, elapsed_ms: Date.now() - startedAt }
  }
}

async function main() {
  console.log('=== BatchData on-signup fulfillment probe ===')
  console.log('Recipe: HVAC owner-occupied built 1985-2005 take=15\n')
  for (const z of ZIPS) {
    console.log(`-- ${z.label} --`)
    const r = await probe(z.zip)
    console.log(JSON.stringify(r, null, 2))
    console.log('')
  }
  console.log('Per-tenant 80-candidate target → 6 zips × 15 = 90 candidates.')
  console.log('If returned < 5 per zip consistently, on-signup pool will starve in 2-3 weeks not 8.')
}
main().catch(e => { console.error(e); process.exit(1) })
