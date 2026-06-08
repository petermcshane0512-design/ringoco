#!/usr/bin/env node
/**
 * refilter-hiring-small-dogs.mjs
 *
 * Peter's lesson from Tommy's calls 2026-06-02: hiring-intent shops with
 * 20+ reviews have HR people fielding the calls, not owners. ICP miss.
 *
 * This re-filters the 125-lead hiring batch down to ONLY shops with
 * ≤20 Google reviews = true 1-4 employee small-dogs where owner
 * picks up the phone.
 */
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

const SRC = 'C:\\Users\\peter\\ringoco\\leads\\hiring-intent-2026-06-01.json'
const OUT_JSON = 'C:\\Users\\peter\\ringoco\\leads\\hiring-intent-small-dogs.json'
const OUT_XLSX = 'C:\\Users\\peter\\ringoco\\leads\\hiring-intent-small-dogs.xlsx'

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const all = data.leads ?? []
const smallDogs = all.filter((l) => (l.reviews ?? 0) <= 20)

console.log(`Original: ${all.length}`)
console.log(`After ≤20 reviews filter: ${smallDogs.length}`)

const hot = smallDogs.filter((l) => l.tier === 'HOT')
const warm = smallDogs.filter((l) => l.tier === 'WARM')
const cool = smallDogs.filter((l) => l.tier === 'COOL')

fs.writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      filter: 'reviews <= 20 (true 1-4 employee small-dogs)',
      counts: { hot: hot.length, warm: warm.length, cool: cool.length, total: smallDogs.length },
      leads: smallDogs,
    },
    null,
    2,
  ),
)

const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const COLS = [
  { header: 'Tier',        key: 'tier',          width: 10 },
  { header: 'Business',    key: 'business_name', width: 36 },
  { header: 'Phone',       key: 'phone',         width: 18 },
  { header: 'City',        key: 'city',          width: 14 },
  { header: 'Trade',       key: 'trade',         width: 12 },
  { header: 'Posted',      key: 'posted',        width: 12 },
  { header: 'Job Title',   key: 'position_title',width: 26 },
  { header: 'Salary',      key: 'salary',        width: 16 },
  { header: 'Reviews',     key: 'reviews',       width: 8 },
  { header: 'Rating',      key: 'rating',        width: 8 },
  { header: 'Report URL',  key: 'report_url',    width: 56 },
  { header: 'Called?',     key: 'called',        width: 14 },
  { header: 'Outcome',     key: 'outcome',       width: 22 },
  { header: 'Notes',       key: 'notes',         width: 36 },
]

function reportUrl(l) {
  const p = new URLSearchParams({
    for: l.business_name,
    city: l.city,
    type: l.trade === 'Electrical' ? 'Electrical' : l.trade === 'Plumbing' ? 'Plumbing' : 'HVAC',
  })
  return `https://www.bellavego.com/sample-report?${p.toString()}`
}

function buildSheet(name, leads) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  ws.columns = COLS.map((c) => ({ ...c }))
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
    c.alignment = { vertical: 'middle', horizontal: 'left' }
    c.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
  })
  ws.getRow(1).height = 30

  for (const l of leads) {
    const row = ws.addRow({
      tier: l.tier === 'HOT' ? '🔥 HOT' : l.tier === 'WARM' ? '⚡ WARM' : '🕓 COOL',
      business_name: l.business_name,
      phone: l.phone,
      city: l.city,
      trade: l.trade,
      posted: l.posted_at ? l.posted_at.slice(0, 10) : '',
      position_title: l.position_title,
      salary: l.salary,
      reviews: l.reviews,
      rating: l.rating,
      report_url: reportUrl(l),
      called: 'Not Yet',
      outcome: '',
      notes: '',
    })
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { size: 11 }
      c.alignment = { vertical: 'top', wrapText: true }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })
    const tierCell = row.getCell(1)
    if (l.tier === 'HOT') tierCell.font = { size: 11, color: { argb: 'FFDC2626' }, bold: true }
    else if (l.tier === 'WARM') tierCell.font = { size: 11, color: { argb: 'FFD97706' }, bold: true }
    const phoneCell = row.getCell(3)
    phoneCell.value = { text: l.phone, hyperlink: `tel:${String(l.phone).replace(/[^\d+]/g, '')}` }
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }
    const urlCell = row.getCell(11)
    const u = reportUrl(l)
    urlCell.value = { text: u, hyperlink: u }
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
  if (leads.length > 0) {
    for (let i = 2; i <= leads.length + 1; i++) {
      ws.getCell(`L${i}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"'],
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: leads.length + 1, column: COLS.length } }
}

buildSheet('🔥 HOT (≤20 rev)', hot)
buildSheet('⚡ WARM (≤20 rev)', warm)
buildSheet('🕓 COOL (≤20 rev)', cool)
buildSheet(`All ${smallDogs.length}`, smallDogs)

await wb.xlsx.writeFile(OUT_XLSX)

const ONEDRIVE = 'C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads'
if (!fs.existsSync(ONEDRIVE)) fs.mkdirSync(ONEDRIVE, { recursive: true })
fs.copyFileSync(OUT_XLSX, path.join(ONEDRIVE, path.basename(OUT_XLSX)))
fs.copyFileSync(OUT_JSON, path.join(ONEDRIVE, path.basename(OUT_JSON)))

console.log(`✅ ${OUT_XLSX}`)
console.log(`   🔥 HOT:  ${hot.length}`)
console.log(`   ⚡ WARM: ${warm.length}`)
console.log(`   🕓 COOL: ${cool.length}`)
console.log(`✅ Mirrored to OneDrive`)
