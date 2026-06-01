#!/usr/bin/env node
/**
 * extract-tommy-leads.mjs — pull the "Tue — Peter" tab out of
 * cook-300-master.xlsx and save it as its own standalone file
 * (leads/tommy-tdon-leads.xlsx) so Peter can ship it to Tommy.
 *
 * Preserves the original column layout (Business, Phone, City, Trade,
 * Score, Reviews, Rating, Report URL, Called?, Outcome, Notes), the
 * clickable tel: + URL hyperlinks, the Called? dropdown, autoFilter, and
 * the header styling. Single tab named "Tommy's Tuesday leads".
 */
import ExcelJS from 'exceljs'

const IN_PATH = 'C:\\Users\\peter\\ringoco\\leads\\cook-300-master.xlsx'
const OUT_PATH = 'C:\\Users\\peter\\ringoco\\leads\\tommy-tdon-leads.xlsx'
const SOURCE_TAB = 'Tue — Peter'

const src = new ExcelJS.Workbook()
await src.xlsx.readFile(IN_PATH)
const srcSheet = src.getWorksheet(SOURCE_TAB)
if (!srcSheet) {
  console.error(`Source tab "${SOURCE_TAB}" not found. Tabs available:`)
  for (const ws of src.worksheets) console.error('  -', ws.name)
  process.exit(1)
}

const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const ws = wb.addWorksheet("Tommy's Tuesday leads", {
  views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
})

// Copy columns + widths
ws.columns = srcSheet.columns.map((c) => ({
  header: c.header,
  key: c.key,
  width: c.width,
}))

// Header style
ws.getRow(1).eachCell((cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
  cell.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
})
ws.getRow(1).height = 30

// Copy data rows + their cell formatting (hyperlinks + fonts)
const numRows = srcSheet.rowCount
let written = 0
for (let r = 2; r <= numRows; r++) {
  const srcRow = srcSheet.getRow(r)
  const values = {}
  ws.columns.forEach((col, idx) => {
    if (col.key) values[col.key] = srcRow.getCell(idx + 1).value
  })
  const newRow = ws.addRow(values)
  written++

  newRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { size: 11 }
    cell.alignment = { vertical: 'top', wrapText: true }
    cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
  })

  const phoneCell = newRow.getCell(2)
  if (typeof phoneCell.value === 'object' && phoneCell.value?.hyperlink) {
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }
  }
  const urlCell = newRow.getCell(8)
  if (typeof urlCell.value === 'object' && urlCell.value?.hyperlink) {
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
}

// Called? dropdown — same vocabulary as the master sheet
if (written > 0) {
  for (let i = 2; i <= written + 1; i++) {
    ws.getCell(`I${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [
        '"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"',
      ],
    }
  }
}

ws.autoFilter = {
  from: { row: 1, column: 1 },
  to: { row: written + 1, column: ws.columns.length },
}

await wb.xlsx.writeFile(OUT_PATH)

console.log(`✅ ${OUT_PATH}`)
console.log(`   ${written} leads · single tab "Tommy's Tuesday leads"`)
console.log(`   Original tab kept untouched in cook-300-master.xlsx`)
