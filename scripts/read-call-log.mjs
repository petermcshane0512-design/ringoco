import ExcelJS from 'exceljs'

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('C:\\Users\\peter\\ringoco\\leads\\outreach-master.xlsx')

// Try all sheets, not just master
const sheets = wb.worksheets
let totalCallsLogged = 0
const allCalls = []

for (const ws of sheets) {
  const headerRow = ws.getRow(1)
  const headers = {}
  headerRow.eachCell((cell, col) => { headers[String(cell.value).trim()] = col })
  if (!headers['Called?'] && !headers['Call Summary']) continue

  const calledCol = headers['Called?']
  const summaryCol = headers['Call Summary']
  const nameCol = headers['Customer Name'] ?? headers['Business Name']
  const phoneCol = headers['Phone']
  const cityCol = headers['City']
  const notesCol = headers['Notes']

  let sheetCalls = 0
  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    const calledRaw = row.getCell(calledCol).value
    const summaryRaw = row.getCell(summaryCol).value
    const called = String(calledRaw ?? '').trim()
    const summary = String(summaryRaw ?? '').trim()

    if ((called && called !== 'Not Yet') || (summary && summary.length > 0)) {
      const nameVal = row.getCell(nameCol).value
      const phoneVal = row.getCell(phoneCol).value
      const cityVal = row.getCell(cityCol).value
      const notesVal = notesCol ? row.getCell(notesCol).value : null
      allCalls.push({
        sheet: ws.name,
        name: String((nameVal && nameVal.text) ?? nameVal ?? '').trim(),
        city: String(cityVal ?? '').trim(),
        phone: String((phoneVal && phoneVal.text) ?? phoneVal ?? '').trim(),
        called,
        summary,
        notes: String(notesVal ?? '').trim(),
      })
      sheetCalls++
    }
  }
  if (sheetCalls > 0) console.log(`  📋 Sheet "${ws.name}": ${sheetCalls} logged calls`)
  totalCallsLogged += sheetCalls
}

console.log(`\n📞 Total logged calls across all sheets: ${totalCallsLogged}`)

// Dedup — same business name from master + city sheet appears twice
const seen = new Set()
const unique = []
for (const c of allCalls) {
  const k = c.name.toLowerCase()
  if (seen.has(k)) continue
  seen.add(k)
  unique.push(c)
}

console.log(`📋 Unique calls (deduped): ${unique.length}\n`)

for (const c of unique) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🏠 ${c.name} (${c.city})`)
  console.log(`📞 ${c.phone}`)
  console.log(`📋 Status: ${c.called || '—'}`)
  if (c.summary) console.log(`📝 Summary: ${c.summary}`)
  if (c.notes) console.log(`📌 Notes: ${c.notes}`)
}

console.log(`\n📞 Final count: ${unique.length} calls logged in Excel`)
