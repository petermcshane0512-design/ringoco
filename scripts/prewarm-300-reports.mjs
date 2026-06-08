#!/usr/bin/env node
/**
 * prewarm-300-reports.mjs — hits the personalize endpoint for every lead
 * in cook-300-final-mon-tue.json so each report cache is populated.
 * Subsequent prospect clicks load from cache in <1 sec instead of 30+ sec
 * fresh generation.
 */

import fs from 'node:fs'

const JSON_PATH = 'C:\\Users\\peter\\ringoco\\leads\\cook-300-final-mon-tue.json'
const BASE = 'https://www.bellavego.com/api/sample-report/personalize'
const CONCURRENCY = 6
const TIMEOUT_MS = 90_000

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
const leads = [
  ...data.monday.peter, ...data.monday.friend,
  ...data.tuesday.peter, ...data.tuesday.friend,
]

console.log(`📞 Pre-warming ${leads.length} reports (${CONCURRENCY} concurrent)`)
console.log(`Cost estimate: ~$${(leads.length * 0.05).toFixed(0)} (Claude Sonnet narratives)\n`)

const t0 = Date.now()
let ok = 0
let fail = 0
let inFlight = 0
let idx = 0
const errors = []

function buildUrl(l) {
  const p = new URLSearchParams({
    for: l.business_name,
    city: l.city,
    type: l.trade === 'Electrical' ? 'Electrical' : 'HVAC',
  })
  if (l.zip) p.set('zip', l.zip)
  return `${BASE}?${p.toString()}`
}

async function warmOne(l) {
  const url = buildUrl(l)
  const ctl = new AbortController()
  const tm = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    clearTimeout(tm)
    if (!r.ok) {
      fail++
      if (errors.length < 8) errors.push(`${l.business_name}: HTTP ${r.status}`)
      return
    }
    const j = await r.json().catch(() => null)
    if (j?.report) ok++
    else { fail++; if (errors.length < 8) errors.push(`${l.business_name}: bad shape`) }
  } catch (e) {
    clearTimeout(tm)
    fail++
    if (errors.length < 8) errors.push(`${l.business_name}: ${e.message}`)
  }
}

async function worker() {
  while (idx < leads.length) {
    const myIdx = idx++
    inFlight++
    await warmOne(leads[myIdx])
    inFlight--
    if ((ok + fail) % 25 === 0) {
      const sec = ((Date.now() - t0) / 1000).toFixed(0)
      console.log(`  [${ok + fail}/${leads.length}] ok=${ok} fail=${fail}  ${sec}s elapsed`)
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

const totalSec = ((Date.now() - t0) / 1000).toFixed(0)
console.log(`\n✅ Done in ${totalSec}s`)
console.log(`   Cached: ${ok}`)
console.log(`   Failed: ${fail}`)
if (errors.length > 0) {
  console.log(`\n   First errors:`)
  for (const e of errors) console.log(`     - ${e}`)
}
console.log(`\n📋 All ${ok} report URLs now load instantly when prospects click.`)
