import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

async function probe(varName: string) {
  const key = process.env[varName]
  if (!key) { console.log(`\n${varName}: NOT SET`); return }
  console.log(`\n${varName}: len=${key.length}`)
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Dallas,TX&key=${key}`)
  const j = await res.json() as { status: string; error_message?: string; results?: unknown[] }
  console.log(`  HTTP ${res.status} | API ${j.status} | ${j.error_message || 'ok'}`)
  console.log(`  results: ${(j.results || []).length}`)
}
async function main() {
  await probe('GOOGLE_MAPS_API_KEY')
  await probe('GOOGLE_PLACES_API_KEY')
}
main()
