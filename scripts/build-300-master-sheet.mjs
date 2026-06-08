#!/usr/bin/env node
/**
 * build-300-master-sheet.mjs — Excel master sheet for the 300 PHX+LV batch.
 * Mon/Tue tabs split Peter/Friend, plus a master "All 300" tab.
 */

import ExcelJS from 'exceljs'
import fs from 'node:fs'

const JSON_PATH = 'C:\\Users\\peter\\ringoco\\leads\\cook-300-final-mon-tue.json'
const OUT_PATH = 'C:\\Users\\peter\\ringoco\\leads\\cook-300-master.xlsx'

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))

const wb = new ExcelJS.Workbook()
wb.creator = 'BellAveGo · Jarvis'
wb.created = new Date()

const COLUMNS = [
  { header: 'Business',    key: 'business_name', width: 38 },
  { header: 'Phone',       key: 'phone',         width: 18 },
  { header: 'City',        key: 'city',          width: 14 },
  { header: 'Trade',       key: 'trade',         width: 12 },
  { header: 'Score',       key: 'score',         width: 8  },
  { header: 'Reviews',     key: 'reviews',       width: 8  },
  { header: 'Rating',      key: 'rating',        width: 8  },
  { header: 'Report URL',  key: 'report_url',    width: 56 },
  { header: 'Called?',     key: 'called',        width: 14 },
  { header: 'Outcome',     key: 'outcome',       width: 22 },
  { header: 'Notes',       key: 'notes',         width: 36 },
]

function reportUrl(l) {
  const params = new URLSearchParams({
    for: l.business_name,
    city: l.city,
    type: l.trade === 'Electrical' ? 'Electrical' : 'HVAC',
  })
  if (l.zip) params.set('zip', l.zip)
  return `https://www.bellavego.com/sample-report?${params.toString()}`
}

function buildSheet(name, leads, dayLabel) {
  const ws = wb.addWorksheet(name.slice(0, 31), {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
  })
  ws.columns = COLUMNS.map((c) => ({ ...c }))

  // Header
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
  })
  ws.getRow(1).height = 30

  for (const l of leads) {
    const row = ws.addRow({
      business_name: l.business_name,
      phone: l.phone,
      city: l.city,
      trade: l.trade,
      score: typeof l.score === 'number' ? l.score.toFixed(1) : l.score,
      reviews: l.reviews,
      rating: l.rating,
      report_url: reportUrl(l),
      called: 'Not Yet',
      outcome: '',
      notes: '',
    })

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 11 }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })

    // Clickable phone
    const phoneCell = row.getCell(2)
    phoneCell.value = {
      text: l.phone,
      hyperlink: `tel:${String(l.phone).replace(/[^\d+]/g, '')}`,
    }
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }

    // Clickable report URL
    const urlCell = row.getCell(8)
    urlCell.value = {
      text: reportUrl(l),
      hyperlink: reportUrl(l),
    }
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }

  // Data validation on Called? + Outcome
  if (leads.length > 0) {
    for (let i = 2; i <= leads.length + 1; i++) {
      ws.getCell(`I${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"'],
      }
    }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: leads.length + 1, column: COLUMNS.length } }

  // Footer info row
  if (dayLabel) {
    const summaryRow = ws.addRow({ business_name: `── ${dayLabel} · ${leads.length} dials · GO ──` })
    summaryRow.getCell(1).font = { italic: true, color: { argb: 'FF7AAAB2' }, size: 10 }
  }
}

const monPeter = data.monday?.peter ?? []
const monFriend = data.monday?.friend ?? []
const tuePeter = data.tuesday?.peter ?? []
const tueFriend = data.tuesday?.friend ?? []
const all300 = [...monPeter, ...monFriend, ...tuePeter, ...tueFriend]

buildSheet('Mon — Peter', monPeter, 'MONDAY · PETER')
buildSheet('Mon — Friend', monFriend, 'MONDAY · FRIEND')
buildSheet('Tue — Peter', tuePeter, 'TUESDAY · PETER')
buildSheet('Tue — Friend', tueFriend, 'TUESDAY · FRIEND')
buildSheet('All 300', all300, null)

await wb.xlsx.writeFile(OUT_PATH)

console.log(`\n✅ ${OUT_PATH}`)
console.log(`   📅 Mon Peter:   ${monPeter.length}`)
console.log(`   📅 Mon Friend:  ${monFriend.length}`)
console.log(`   📅 Tue Peter:   ${tuePeter.length}`)
console.log(`   📅 Tue Friend:  ${tueFriend.length}`)
console.log(`   📋 All:         ${all300.length}`)
console.log(`\nOpen: start ${OUT_PATH}\n`)
