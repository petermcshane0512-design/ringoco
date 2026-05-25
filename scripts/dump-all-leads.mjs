#!/usr/bin/env node
/**
 * dump-all-leads.mjs — write a clean, Excel-friendly CSV of every
 * scraped lead (including the ones the tier filter rejected), AND
 * print the full list to stdout in a scannable format.
 *
 * Usage: node scripts/dump-all-leads.mjs <raw-input.csv> <clean-output.csv>
 */
import fs from 'fs'

const inPath = process.argv[2]
const outPath = process.argv[3]
if (!inPath || !outPath) {
  console.error('Usage: node scripts/dump-all-leads.mjs <input.csv> <output.csv>')
  process.exit(1)
}

function parseCSV(text) {
  const rows = []
  let cur = []
  let val = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { val += '"'; i++ } else { inQuotes = false }
      } else val += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { cur.push(val); val = '' }
      else if (ch === '\n') { cur.push(val); rows.push(cur); cur = []; val = '' }
      else if (ch === '\r') {}
      else val += ch
    }
  }
  if (val !== '' || cur.length > 0) { cur.push(val); rows.push(cur) }
  return rows
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function fmtPhone(p) {
  const d = String(p || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return p || ''
}

const raw = parseCSV(fs.readFileSync(inPath, 'utf8'))
const header = raw[0]
const idx = Object.fromEntries(header.map((h, i) => [h, i]))
const rows = raw.slice(1).filter((r) => r.length === header.length)

// Sort by reviews desc, then rating desc
rows.sort((a, b) => {
  const rb = parseInt(b[idx.reviewsCount], 10) || 0
  const ra = parseInt(a[idx.reviewsCount], 10) || 0
  if (rb !== ra) return rb - ra
  const gb = parseFloat(b[idx.totalScore]) || 0
  const ga = parseFloat(a[idx.totalScore]) || 0
  return gb - ga
})

// Write clean CSV
const outCols = ['rank', 'business_name', 'phone', 'rating', 'reviews', 'website', 'city', 'state', 'address', 'category', 'status', 'google_place_id']
const outLines = [outCols.join(',')]

rows.forEach((r, i) => {
  const status = r[idx.permanentlyClosed] === 'true' ? 'CLOSED'
    : r[idx.temporarilyClosed] === 'true' ? 'TEMP CLOSED'
    : 'OPEN'
  const out = [
    i + 1,
    r[idx.title] || '',
    fmtPhone(r[idx.phone] || r[idx.phoneUnformatted]),
    r[idx.totalScore] || '',
    r[idx.reviewsCount] || '0',
    r[idx.website] || '(none)',
    r[idx.city] || '',
    r[idx.state] || '',
    r[idx.address] || '',
    r[idx.categoryName] || '',
    status,
    r[idx.placeId] || '',
  ].map(csvEscape).join(',')
  outLines.push(out)
})

fs.writeFileSync(outPath, outLines.join('\n') + '\n', 'utf8')

// Print all rows inline as a scannable table
console.log(`\n=== ALL ${rows.length} VEGAS HVAC LEADS (ranked by review count desc) ===\n`)
console.log('  #   Rating  Reviews  Phone             Status        Business Name')
console.log('  ' + '-'.repeat(110))
rows.forEach((r, i) => {
  const rank = String(i + 1).padStart(3)
  const rating = (r[idx.totalScore] || '-').padStart(6)
  const reviews = (r[idx.reviewsCount] || '0').padStart(7)
  const phone = fmtPhone(r[idx.phone] || r[idx.phoneUnformatted]).padEnd(16)
  const status = (r[idx.permanentlyClosed] === 'true' ? 'PERM CLOSED'
    : r[idx.temporarilyClosed] === 'true' ? 'TEMP CLOSED'
    : 'OPEN').padEnd(12)
  const name = (r[idx.title] || '').slice(0, 60)
  console.log(`  ${rank}  ${rating}  ${reviews}  ${phone}  ${status}  ${name}`)
})

console.log(`\n✓ Excel-ready file: ${outPath}`)
console.log(`  Open with: code ${outPath}    OR    double-click in Explorer`)
