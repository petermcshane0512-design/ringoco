import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'

const ROOT = 'C:\\Users\\peter\\ringoco\\leads'

const allCsvs = fs.readdirSync(ROOT).filter((f) => f.endsWith('.csv'))
const emailCsvFiles = allCsvs.filter((f) =>
  /with-emails|local-emails|enriched/.test(f) && !/instantly|batch/.test(f),
)

const norm = (s) => (s || '').toLowerCase().trim()
const seen = new Set()
const byCity = new Map()
let totalRows = 0

for (const f of emailCsvFiles) {
  const rows = parse(fs.readFileSync(path.join(ROOT, f), 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
  for (const r of rows) {
    const name = norm(r.business_name || r.title || r.name)
    if (!name || seen.has(name)) continue
    seen.add(name)
    totalRows++
    // Parse city from address if missing
    let city = r.city
    if (!city && r.address) {
      const m = r.address.match(/,\s*([^,]+),\s*[A-Z]{2}\s+\d{5}/)
      if (m) city = m[1].trim()
    }
    city = city || 'Unknown'
    byCity.set(city, (byCity.get(city) || 0) + 1)
  }
}

console.log(`Total unique business names across ${emailCsvFiles.length} email-enriched CSVs: ${totalRows}\n`)
console.log('By city (top 20):')
const sorted = [...byCity.entries()].sort((a, b) => b[1] - a[1])
for (const [city, n] of sorted.slice(0, 20)) console.log(`  ${String(n).padStart(4)}  ${city}`)
