/**
 * Backfill ZIP into outreach CSV via Google Geocoding API.
 *
 * Reads data/outreach-450.csv → for each row missing zip, geocodes
 * "city, state" → extracts postal_code from address_components.
 * Writes back to the same file (or to --out).
 *
 * Cost: $0.005 per geocode × 480 = ~$2.40.
 * Time: ~5 min run (rate-limited to 30 QPS to stay polite).
 *
 * Run:
 *   npx tsx scripts/backfill-csv-zip.ts                                    # in-place rewrite
 *   npx tsx scripts/backfill-csv-zip.ts data/outreach-450.csv --dry-run    # show only
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

config({ path: resolve(process.cwd(), '.env.local') })

const ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json'

async function geocodeOnce(address: string): Promise<{ zip: string | null; lat: number | null; lng: number | null }> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    console.error('GOOGLE_MAPS_API_KEY not set')
    process.exit(1)
  }
  const url = `${ENDPOINT}?address=${encodeURIComponent(address)}&key=${key}`
  try {
    const res = await fetch(url)
    if (!res.ok) return { zip: null, lat: null, lng: null }
    const data = await res.json() as {
      status: string
      results: { address_components: { long_name: string; types: string[] }[]; geometry?: { location?: { lat: number; lng: number } } }[]
    }
    if (data.status !== 'OK' || data.results.length === 0) return { zip: null, lat: null, lng: null }
    for (const r of data.results) {
      const pc = (r.address_components || []).find((c) => (c.types || []).includes('postal_code'))
      if (pc?.long_name) {
        return {
          zip: pc.long_name.slice(0, 5),
          lat: r.geometry?.location?.lat ?? null,
          lng: r.geometry?.location?.lng ?? null,
        }
      }
    }
    // No postal_code anywhere — return lat/lng so caller can reverse-geocode
    const loc = data.results[0]?.geometry?.location
    return { zip: null, lat: loc?.lat ?? null, lng: loc?.lng ?? null }
  } catch {
    return { zip: null, lat: null, lng: null }
  }
}

async function reverseGeocodeZip(lat: number, lng: number): Promise<string | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!key) return null
  const url = `${ENDPOINT}?latlng=${lat},${lng}&key=${key}&result_type=postal_code`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as {
      status: string
      results: { address_components: { long_name: string; types: string[] }[] }[]
    }
    if (data.status !== 'OK' || data.results.length === 0) return null
    for (const r of data.results) {
      const pc = (r.address_components || []).find((c) => (c.types || []).includes('postal_code'))
      if (pc?.long_name) return pc.long_name.slice(0, 5)
    }
    return null
  } catch {
    return null
  }
}

async function geocodeZip(biz: string, city: string, state: string): Promise<string | null> {
  // 1st pass — most specific (biz name + city + state). Returns a real
  // address w/ postal_code on its components.
  if (biz && city && state) {
    const q1 = `${biz}, ${city}, ${state}`
    const r1 = await geocodeOnce(q1)
    if (r1.zip) return r1.zip
    if (r1.lat != null && r1.lng != null) {
      const rev = await reverseGeocodeZip(r1.lat, r1.lng)
      if (rev) return rev
    }
  }
  // 2nd pass — city + state. Gets centroid lat/lng → reverse-geocode for zip.
  if (city && state) {
    const r2 = await geocodeOnce(`${city}, ${state}`)
    if (r2.zip) return r2.zip
    if (r2.lat != null && r2.lng != null) {
      const rev = await reverseGeocodeZip(r2.lat, r2.lng)
      if (rev) return rev
    }
  }
  return null
}

function parseCsv(content: string): { headers: string[]; rows: Array<Record<string, string>> } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows: Array<Record<string, string>> = []
  for (const line of lines.slice(1)) {
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue }
      cur += c
    }
    cells.push(cur)
    const r: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) r[headers[i]] = (cells[i] || '').trim()
    rows.push(r)
  }
  return { headers, rows }
}

function rowsToCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => {
      const v = r[h] || ''
      return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    }).join(','))
  }
  return lines.join('\n') + '\n'
}

async function main() {
  const args = process.argv.slice(2)
  const csvPath = args.find((a) => !a.startsWith('--')) || resolve(process.cwd(), 'data/outreach-450.csv')
  const dryRun = args.includes('--dry-run')

  console.log(`Reading ${csvPath}…`)
  const content = readFileSync(csvPath, 'utf8')
  const { headers, rows } = parseCsv(content)
  console.log(`Loaded ${rows.length} rows.\n`)

  const beforeZipCount = rows.filter((r) => r.zip).length
  console.log(`Already-have-zip:  ${beforeZipCount}`)
  console.log(`Need backfill:     ${rows.length - beforeZipCount}\n`)

  if (dryRun) {
    console.log('DRY-RUN — no geocoding, no write. Add --commit or remove --dry-run to backfill.')
    return
  }

  let filled = 0
  let missed = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.zip) continue
    const z = await geocodeZip(r.biz_name || '', r.city || '', r.state || '')
    if (z) {
      r.zip = z
      filled++
      if (filled % 50 === 0) console.log(`  ${filled} filled…`)
    } else {
      missed++
    }
    await new Promise((res) => setTimeout(res, 35))  // ~28 QPS
  }

  console.log(`\nFilled: ${filled}`)
  console.log(`Missed: ${missed}`)

  writeFileSync(csvPath, rowsToCsv(headers, rows), 'utf8')
  console.log(`\nWrote updated CSV to ${csvPath}.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
