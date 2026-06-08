#!/usr/bin/env node
/**
 * build-le-leads.mjs — Peter's leftover cook-300 leads in one file
 * for Le (new salesman).
 *
 * Spec from Peter 2026-06-02:
 *   - Skip the ~30 Mon-Peter leads he already called yesterday
 *     (treat as: take the LAST 40 rows of Mon-Peter tab since he
 *     dialed top-down)
 *   - Include all of Tue-Peter (today's batch, 76 leads)
 *   - DO NOT include Tommy's, Friend's, or hiring-intent leads
 *
 * Output: leads/le-leads.xlsx, single combined tab "Le's leads".
 */
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = 'C:\\Users\\peter\\ringoco\\leads'
const SRC = path.join(ROOT, 'cook-300-master.xlsx')
const OUT = path.join(ROOT, 'le-leads.xlsx')

if (!fs.existsSync(SRC)) { console.error('missing', SRC); process.exit(1) }

const src = new ExcelJS.Workbook(); await src.xlsx.readFile(SRC)
const monPeter = src.getWorksheet('Mon — Peter')
const tuePeter = src.getWorksheet('Tue — Peter')
if (!monPeter || !tuePeter) {
  console.error('missing Mon — Peter or Tue — Peter tab')
  process.exit(1)
}

// Copy data rows + the source row's per-cell style so the merged file
// looks identical to the master.
function copyRow(src, dst, rowIdx) {
  const srcRow = src.getRow(rowIdx)
  const values = {}
  for (let c = 1; c <= 11; c++) {
    const cell = srcRow.getCell(c)
    values[c] = cell.value
  }
  const newRow = dst.addRow([
    values[1], values[2], values[3], values[4], values[5], values[6],
    values[7], values[8], 'Not Yet', '', '',
  ])
  newRow.eachCell({ includeEmpty: true }, (c) => {
    c.font = { size: 11 }
    c.alignment = { vertical: 'top', wrapText: true }
    c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
  })
  const phoneCell = newRow.getCell(2)
  const phoneVal = values[2]
  const phoneText = typeof phoneVal === 'object' && phoneVal !== null && 'text' in phoneVal ? phoneVal.text : phoneVal
  if (phoneText) {
    phoneCell.value = { text: String(phoneText), hyperlink: `tel:${String(phoneText).replace(/[^\d+]/g, '')}` }
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }
  }
  const urlCell = newRow.getCell(8)
  const urlVal = values[8]
  const urlText = typeof urlVal === 'object' && urlVal !== null && 'text' in urlVal ? urlVal.text : urlVal
  if (urlText) {
    urlCell.value = { text: String(urlText), hyperlink: String(urlText) }
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
}

const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()
const ws = wb.addWorksheet("Le's leads", {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
})
ws.columns = monPeter.columns.map((c) => ({ header: c.header, key: c.key, width: c.width }))
ws.getRow(1).eachCell((c) => {
  c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
  c.alignment = { vertical: 'middle', horizontal: 'left' }
  c.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
})
ws.getRow(1).height = 30

// LAST 40 rows of Mon-Peter (skip ~35 Peter dialed top-down)
const monRowCount = monPeter.rowCount
const monStart = Math.max(2, monRowCount - 40 + 1)
let monAdded = 0
for (let r = monStart; r <= monRowCount; r++) {
  copyRow(monPeter, ws, r)
  monAdded++
}

// ALL of Tue-Peter
let tueAdded = 0
for (let r = 2; r <= tuePeter.rowCount; r++) {
  copyRow(tuePeter, ws, r)
  tueAdded++
}

// Dropdown on Called?
const totalDataRows = monAdded + tueAdded
for (let i = 2; i <= totalDataRows + 1; i++) {
  ws.getCell(`I${i}`).dataValidation = {
    type: 'list', allowBlank: true,
    formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"'],
  }
}
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: totalDataRows + 1, column: ws.columns.length } }

await wb.xlsx.writeFile(OUT)

// Mirror to OneDrive clone
const ONEDRIVE = 'C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads'
if (!fs.existsSync(ONEDRIVE)) fs.mkdirSync(ONEDRIVE, { recursive: true })
fs.copyFileSync(OUT, path.join(ONEDRIVE, path.basename(OUT)))

console.log(`✅ ${OUT}`)
console.log(`   Mon-Peter (last 40):  ${monAdded}`)
console.log(`   Tue-Peter (all):       ${tueAdded}`)
console.log(`   TOTAL:                 ${totalDataRows}`)
console.log(`✅ Mirrored to OneDrive`)
