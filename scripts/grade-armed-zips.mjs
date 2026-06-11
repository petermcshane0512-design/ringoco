#!/usr/bin/env node
/**
 * 2026-06-11 launch-gate grader. For each unique armed (zip, trade) in
 * prospect_free_leads, pull the SAME recipe the free-lead page uses and
 * score owner quality: real person name (good) vs LLC/INC/TRUST/etc
 * (bad — commercial parcel, weak first impression). Tells us, per zip,
 * whether the free lead a prospect will see is a real homeowner.
 *
 * Cost-capped: probes the top --max zips by contact count, take=4 each.
 *   node scripts/grade-armed-zips.mjs --max 40
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = process.env.BATCHDATA_API_KEY
const MAX = parseInt((process.argv.find((a, i) => process.argv[i - 1] === '--max') || '40'), 10)
const TAKE = 4

const HOT = new Set(['TX', 'FL', 'AZ', 'NV', 'NM', 'GA', 'AL', 'MS', 'LA', 'SC', 'Texas', 'Florida'])
function hvacWindow(state) {
  const s = (state || '').toUpperCase()
  if (HOT.has(state) || HOT.has(s)) return { yearBuiltMin: 2008, yearBuiltMax: 2015 }
  return { yearBuiltMin: 1985, yearBuiltMax: 2005 }
}
function recipe(trade, state) {
  const t = (trade || '').toLowerCase()
  if (t.includes('plumb')) return { yearBuiltMin: 1900, yearBuiltMax: 1995, ownerOccupied: true }
  if (t.includes('elect')) return { yearBuiltMax: 1980, ownerOccupied: true }
  if (t.includes('roof')) return { yearBuiltMin: 2001, yearBuiltMax: 2011, ownerOccupied: true }
  return { ...hvacWindow(state), ownerOccupied: true } // hvac default
}
const BAD = /\b(LLC|L\.L\.C|INC|CORP|TRUST|HOLDINGS|PROPERTIES|PARTNERS|LP|LTD|MANAGEMENT|GROUP|ENTERPRISE|INVESTMENT|REALTY|BANK|ASSOCIATION|CHURCH|CITY OF|COUNTY)\b/i
function isPerson(name) {
  if (!name) return false
  if (BAD.test(name)) return false
  return /[a-z]/i.test(name) && name.trim().split(/\s+/).length >= 2
}

const r = await sb.from('prospect_free_leads').select('zip,trade,state').neq('zip', '').not('zip', 'is', null)
const rows = (r.data || []).filter((x) => /^\d{5}$/.test(x.zip))
const byKey = {}
for (const x of rows) {
  const k = `${x.zip}|${(x.trade || 'hvac')}|${x.state || ''}`
  byKey[k] = (byKey[k] || 0) + 1
}
const ranked = Object.entries(byKey).sort((a, b) => b[1] - a[1]).slice(0, MAX)

let probedContacts = 0, goodZips = 0, badZips = 0, deadZips = 0, totalContactsGraded = 0
const flagged = []
for (const [k, contacts] of ranked) {
  const [zip, trade, state] = k.split('|')
  const body = { searchCriteria: { query: zip, ...recipe(trade, state) }, options: { take: TAKE, skip: 0 } }
  const resp = await fetch('https://api.batchdata.com/api/v1/property/search', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await resp.json().catch(() => ({}))
  const props = j?.results?.properties ?? []
  const names = props.map((p) => p.owner?.fullName || p.owner?.name?.full || '')
  const persons = names.filter(isPerson).length
  totalContactsGraded += contacts
  let verdict
  if (props.length === 0) { verdict = 'DEAD (0 results)'; deadZips++; flagged.push({ zip, trade, contacts, verdict }) }
  else if (persons / props.length >= 0.5) { verdict = `GOOD (${persons}/${props.length} person)`; goodZips++ }
  else { verdict = `WEAK (${persons}/${props.length} person)`; badZips++; flagged.push({ zip, trade, contacts, verdict, sample: names.slice(0, 2) }) }
  probedContacts++
  console.log(`${zip} ${trade.padEnd(10)} (${contacts} contacts) → ${verdict}`)
  await new Promise((res) => setTimeout(res, 40))
}
console.log(`\n=== SUMMARY (top ${MAX} zips = ${totalContactsGraded} of 295 armed contacts) ===`)
console.log(`GOOD zips: ${goodZips} | WEAK zips: ${badZips} | DEAD zips: ${deadZips}`)
console.log(`Est. spend: ~$${(probedContacts * TAKE * 0.05).toFixed(2)}`)
if (flagged.length) {
  console.log('\nFLAGGED (drop or fix before send):')
  for (const f of flagged) console.log(`  ${f.zip} ${f.trade} (${f.contacts} contacts) — ${f.verdict}${f.sample ? ' e.g. ' + JSON.stringify(f.sample) : ''}`)
}
