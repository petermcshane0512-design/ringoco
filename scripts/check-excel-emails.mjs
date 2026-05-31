import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('C:\\Users\\peter\\ringoco\\leads\\outreach-master.xlsx')
const ws = wb.getWorksheet('Master - All Cities') ?? wb.worksheets[0]
const headerRow = ws.getRow(3)
const headers = {}
headerRow.eachCell((cell, col) => { headers[String(cell.value).trim()] = col })
const emailCol = headers['Email']
const businessCol = headers['Business Name']
let withEmail = 0, noEmail = 0
const samples = { with: [], without: [] }
for (let i = 4; i <= ws.rowCount; i++) {
  const row = ws.getRow(i)
  const e = row.getCell(emailCol).value
  const b = row.getCell(businessCol).value
  const emailStr = typeof e === 'object' && e?.text ? e.text : String(e || '')
  if (emailStr && emailStr.includes('@')) {
    withEmail++
    if (samples.with.length < 3) samples.with.push(`${b} → ${emailStr}`)
  } else {
    noEmail++
    if (samples.without.length < 5) samples.without.push(`${b}`)
  }
}
console.log(`Total data rows in Master: ${ws.rowCount - 3}`)
console.log(`With email: ${withEmail}`)
console.log(`No email: ${noEmail}`)
console.log('\nSample with email:')
samples.with.forEach((x) => console.log(`  ${x}`))
console.log('\nSample WITHOUT email:')
samples.without.forEach((x) => console.log(`  ${x}`))
