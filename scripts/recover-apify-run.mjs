// Recover the most recent SUCCEEDED compass-google-places run's dataset
// and insert into outreach_leads — NO new Apify spend (reads a run that
// already ran + billed). Used when mass-source's poll timed out but the
// crawl finished on Apify's side.
//
// Usage: node scripts/recover-apify-run.mjs --trade roofing --city Chicago --state IL
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const TOKEN = process.env.APIFY_API_TOKEN
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const TRADE = (arg('trade', 'roofing')).toLowerCase()
const CITY = arg('city', 'Chicago')
const STATE = arg('state', 'IL')
const MIN_REV = parseInt(arg('min-reviews', '2'), 10)
const MAX_REV = parseInt(arg('max-reviews', '400'), 10)

const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'aol.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'comcast.net', 'sbcglobal.net', 'att.net', 'msn.com'])
const emailDomain = (e) => (e.split('@')[1] || '').toLowerCase().trim()

// Most recent runs of the compass actor
const runsRes = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${TOKEN}&desc=true&limit=8`)
const runs = (await runsRes.json())?.data?.items || []
const done = runs.find((r) => r.status === 'SUCCEEDED' && r.defaultDatasetId)
if (!done) { console.error('no recent SUCCEEDED run found. runs:', runs.map((r) => r.status).join(',')); process.exit(1) }
console.log(`recovering run ${done.id} (${done.status}, finished ${done.finishedAt})`)

const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${done.defaultDatasetId}/items?token=${TOKEN}&clean=true`)
const raw = await itemsRes.json()
console.log(`dataset: ${raw.length} places`)

const date = new Date().toISOString().slice(0, 10)
fs.mkdirSync(path.resolve('leads'), { recursive: true })
fs.writeFileSync(path.resolve('leads', `recovered-${TRADE}-${CITY}-${date}.json`), JSON.stringify(raw, null, 2))

const candidates = []
for (const p of raw) {
  const reviews = Number(p.reviewsCount ?? 0)
  if (reviews < MIN_REV || reviews > MAX_REV) continue
  const email = Array.isArray(p.emails) && p.emails[0] ? p.emails[0].toLowerCase() : null
  if (!email) continue
  candidates.push({ biz_name: (p.title || '').trim().slice(0, 200), email, city: p.city || CITY, state: STATE, trade: TRADE, phone: p.phone || null })
}
console.log(`candidates with email in ${MIN_REV}-${MAX_REV} reviews: ${candidates.length}`)
if (candidates.length === 0) process.exit(0)

// Never-repeat triple guard (same as mass-source)
const { data: prior } = await supabase.from('outreach_leads').select('email, business_name, city')
const seenE = new Set((prior || []).map((r) => (r.email || '').toLowerCase()))
const seenBC = new Set((prior || []).map((r) => `${(r.business_name || '').toLowerCase()}|${(r.city || '').toLowerCase()}`))
const seenD = new Set((prior || []).map((r) => emailDomain(r.email || '')).filter((d) => d && !FREEMAIL.has(d)))
const bE = new Set(), bD = new Set()
const fresh = candidates.filter((c) => {
  const dom = emailDomain(c.email)
  if (seenE.has(c.email) || seenBC.has(`${c.biz_name.toLowerCase()}|${c.city.toLowerCase()}`)) return false
  if (dom && !FREEMAIL.has(dom) && (seenD.has(dom) || bD.has(dom))) return false
  if (bE.has(c.email)) return false
  bE.add(c.email); if (dom && !FREEMAIL.has(dom)) bD.add(dom)
  return true
})
console.log(`fresh after never-repeat dedup: ${fresh.length}`)
if (fresh.length === 0) process.exit(0)

const rows = fresh.map((c) => ({ id: randomUUID(), email: c.email, business_name: c.biz_name, city: c.city, state: c.state, trade: c.trade, campaign_id: `recover-${TRADE}-${date}`, status: 'sourced' }))
const { error } = await supabase.from('outreach_leads').insert(rows)
if (error) { console.error('insert err:', error.message); process.exit(1) }
console.log(`✓ inserted ${rows.length} outreach_leads (status=sourced)`)
