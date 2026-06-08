#!/usr/bin/env node
/**
 * Removes overlapping leads (already in outreach_leads) from the 300 batch,
 * then rebuilds the master Excel sheet with clean fresh leads only.
 */
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const JSON_PATH = 'C:\\Users\\peter\\ringoco\\leads\\cook-300-final-mon-tue.json'
const OUT_PATH = 'C:\\Users\\peter\\ringoco\\leads\\cook-300-master.xlsx'

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
const raw = [...data.monday.peter, ...data.monday.friend, ...data.tuesday.peter, ...data.tuesday.friend]

const { data: existing } = await supabase.from('outreach_leads').select('business_name').limit(50000)
const existingNames = new Set((existing ?? []).map(r => (r.business_name || '').toLowerCase().trim()))

const fresh = raw.filter(l => !existingNames.has(l.business_name.toLowerCase().trim()))
console.log(`Raw: ${raw.length} · Overlap: ${raw.length - fresh.length} · Fresh: ${fresh.length}`)

fresh.sort((a, b) => b.score - a.score)

// FREE-FOR-ALL split — Mon batch + Tue batch. Anyone can pick.
// As long as Called?/Outcome cells are updated, we know who handled it.
const half = Math.ceil(fresh.length / 2)
const mon = fresh.slice(0, half)
const tue = fresh.slice(half)

console.log(`Mon: ${mon.length}`)
console.log(`Tue: ${tue.length}`)

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
  const p = new URLSearchParams({
    for: l.business_name,
    city: l.city,
    type: l.trade === 'Electrical' ? 'Electrical' : 'HVAC',
  })
  if (l.zip) p.set('zip', l.zip)
  return `https://www.bellavego.com/sample-report?${p.toString()}`
}

function buildSheet(name, leads) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] })
  ws.columns = COLUMNS.map(c => ({ ...c }))
  ws.getRow(1).eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
    c.alignment = { vertical: 'middle', horizontal: 'left' }
    c.border = { bottom: { style: 'medium', color: { argb: 'FF334155' } } }
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
    row.eachCell({ includeEmpty: true }, c => {
      c.font = { size: 11 }
      c.alignment = { vertical: 'top', wrapText: true }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })
    const phoneCell = row.getCell(2)
    phoneCell.value = { text: l.phone, hyperlink: `tel:${String(l.phone).replace(/[^\d+]/g, '')}` }
    phoneCell.font = { size: 11, color: { argb: 'FF2563EB' }, underline: true, bold: true }
    const urlCell = row.getCell(8)
    const u = reportUrl(l)
    urlCell.value = { text: u, hyperlink: u }
    urlCell.font = { size: 10, color: { argb: 'FF0AA89F' }, underline: true }
  }
  if (leads.length > 0) {
    for (let i = 2; i <= leads.length + 1; i++) {
      ws.getCell(`I${i}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: ['"Not Yet,Called,Voicemail,No Answer,Interested,Trial Started,PAID,Not Interested,Wrong Number,Hostile,DNC"'],
      }
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: leads.length + 1, column: COLUMNS.length } }
}

buildSheet('Monday', mon)
buildSheet('Tuesday', tue)
buildSheet(`All ${fresh.length}`, fresh)

await wb.xlsx.writeFile(OUT_PATH)
console.log(`\n✅ ${OUT_PATH}`)
console.log(`   📅 Monday:  ${mon.length}`)
console.log(`   📅 Tuesday: ${tue.length}`)
console.log(`   📋 Total fresh: ${fresh.length}`)
console.log(`\nFree-for-all picking — both callers update Called?/Outcome cells.`)
