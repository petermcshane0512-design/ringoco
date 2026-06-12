#!/usr/bin/env node
/**
 * mass-source.mjs — the Mass Sourcer scout (#25 of the 30-scout stack).
 *
 * One command: "give me up to N verified contractor emails for {trade}
 * in {city}, {state}". Inserts into outreach_leads with status='sourced'
 * so the existing refill-outreach-queue / auto-load-instantly chain
 * picks them up automatically for the next send cycle.
 *
 * Per Elon Algorithm step 3 (simplify): does NOT add a new cron, a new
 * UI, or a new pipeline. Reuses the proven Apify Google Maps actor
 * (scrape-sun-belt-fresh.mjs pattern) + the existing outreach_leads
 * dedup (email UNIQUE + business+city composite). Pure parameterization
 * of the working scraper so Peter can fire for any (metro, trade) in
 * one command and watch volume climb 10x.
 *
 * Per CLAUDE.md ICP rule: shops with > MAX_REVIEWS reviews are filtered
 * out (large shops already have receptionists + marketing teams; they
 * don't buy. Sweet spot 3-50 reviews.)
 *
 * Run:
 *   node scripts/mass-source.mjs --trade hvac --city Phoenix --state AZ --limit 300
 *   node scripts/mass-source.mjs --trade plumbing --city Houston --state TX
 *   node scripts/mass-source.mjs --trade electrical --city Tampa --state FL --dry-run
 *
 * Output:
 *   - Stdout: summary (scraped / kept / new / dupes).
 *   - outreach_leads: INSERTs with status='sourced', trade, city, state, biz_name, email.
 *   - leads/mass-source-{trade}-{city}-{date}.json: raw dump for audit.
 *
 * Cost: ~$5 per 1K Apify results. Most metros saturate the ICP window
 * (3-50 reviews) at 200-400 places, so a metro run is typically $1-2.
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN
if (!APIFY_TOKEN) {
  console.error('APIFY_API_TOKEN missing in .env.local')
  process.exit(1)
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ── CLI args ───────────────────────────────────────────────────────────
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

const TRADE = (arg('trade', '') || '').toLowerCase()
const CITY = arg('city', '')
const STATE = arg('state', '')
const LIMIT = parseInt(arg('limit', '300'), 10)
const DRY_RUN = hasFlag('dry-run')
// 2026-06-12 — review bounds are now CLI-tunable. The hardcoded 3-50 cap
// starved trades like roofing/masonry where legit small shops carry
// 50-150 Google reviews. For enforcement-lead prospecting we still want
// owner-operators, but the ceiling is higher.
const MIN_REV = parseInt(arg('min-reviews', '3'), 10)
const MAX_REV = parseInt(arg('max-reviews', '50'), 10)

if (!TRADE || !CITY || !STATE) {
  console.error('Required: --trade <hvac|plumbing|electrical|roofing|handyman> --city <City> --state <ST>')
  console.error('Optional: --limit <N=300>  --dry-run')
  process.exit(1)
}

const VALID_TRADES = new Set(['hvac', 'plumbing', 'electrical', 'roofing', 'handyman', 'masonry'])
if (!VALID_TRADES.has(TRADE)) {
  console.error(`Trade must be one of: ${[...VALID_TRADES].join(', ')}`)
  process.exit(1)
}

// ── ICP per CLAUDE.md ─────────────────────────────────────────────────
const MAX_REVIEWS = MAX_REV
const MIN_REVIEWS = MIN_REV
const TRADE_QUERY = {
  hvac:       'HVAC contractor',
  plumbing:   'plumbing contractor',
  electrical: 'electrical contractor',
  roofing:    'roofing contractor',
  handyman:   'handyman service',
  masonry:    'masonry tuckpointing contractor',
}[TRADE]

// 2026-06-12 — MULTI-LOCATION. A single "trade Chicago" query caps at
// ~20-250 Google results. Passing --cities "Chicago,Naperville,Cicero,..."
// fans the search across the metro + collar suburbs IN ONE Apify run
// (billed per result, not per query → same $/shop, 5-10x the volume).
// Falls back to the single --city when --cities isn't given.
const CITIES = (arg('cities', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const LOCATIONS = CITIES.length > 0 ? CITIES : [CITY]
const SEARCHES = LOCATIONS.map((loc) => `${TRADE_QUERY} ${loc} ${STATE}`)
console.log(`\n→ mass-source: ${TRADE_QUERY} across ${LOCATIONS.length} location(s) | limit=${LIMIT}/loc | dry=${DRY_RUN}\n`)

// ── Apify run ──────────────────────────────────────────────────────────
async function runApify(queries) {
  const r = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: Array.isArray(queries) ? queries : [queries],
        maxCrawledPlacesPerSearch: LIMIT,
        language: 'en',
        searchMatching: 'all',
        // 2026-06-12 — without this the actor returns NO emails field at
        // all (first Chicago run: 250 places, 0 emails). Contact
        // enrichment crawls each place's website for emails/socials.
        scrapeContacts: true,
      }),
    },
  )
  const startJson = await r.json()
  const runId = startJson?.data?.id
  if (!runId) throw new Error(`Apify start failed: ${JSON.stringify(startJson).slice(0, 200)}`)

  // Poll until done. Contact-scraping crawls each website for emails →
  // slow; a 350-place run can take 12-18 min. Poll 10s × 150 = 25 min so
  // we never abandon a run we already paid for.
  for (let i = 0; i < 150; i++) {
    await new Promise((res) => setTimeout(res, 10000))
    const s = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
    const sj = await s.json()
    const status = sj?.data?.status
    if (status === 'SUCCEEDED') {
      const items = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}`,
      )
      return await items.json()
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${status}`)
    }
    if (i % 4 === 0) process.stdout.write(`  ⏱  status=${status}…\n`)
  }
  throw new Error('Apify run timed out after 5 min')
}

// ── Main ──────────────────────────────────────────────────────────────
const raw = await runApify(SEARCHES)
console.log(`\n✓ Apify returned ${raw.length} places across ${LOCATIONS.length} location(s)\n`)

// Audit dump
const auditDir = path.resolve('leads')
fs.mkdirSync(auditDir, { recursive: true })
const date = new Date().toISOString().slice(0, 10)
const auditFile = path.join(auditDir, `mass-source-${TRADE}-${CITY.replace(/\s+/g, '-')}-${date}.json`)
fs.writeFileSync(auditFile, JSON.stringify(raw, null, 2))
console.log(`  audit dump → ${auditFile}`)

// ICP filter + extract email
function extractEmail(place) {
  // Apify Google Maps actor returns emails under .emails[] or embedded in
  // website meta. First pass is .emails — second pass is a website crawl
  // (skipped here; verify-emails cron handles enrichment).
  if (Array.isArray(place.emails) && place.emails.length > 0) return place.emails[0].toLowerCase()
  return null
}

const candidates = []
for (const p of raw) {
  const reviews = Number(p.reviewsCount ?? p.totalScore ?? 0)
  if (reviews < MIN_REVIEWS || reviews > MAX_REVIEWS) continue
  const email = extractEmail(p)
  if (!email) continue
  candidates.push({
    biz_name: (p.title || '').trim().slice(0, 200),
    email,
    city: CITY,
    state: STATE,
    trade: TRADE,
    reviews,
    phone: p.phone || null,
    website: p.website || null,
  })
}
console.log(`  ICP filter (${MIN_REVIEWS}-${MAX_REVIEWS} reviews, email present): ${candidates.length} candidates`)

if (candidates.length === 0) {
  console.log('\n  nothing to insert. exit.')
  process.exit(0)
}

// ── NEVER-REPEAT GUARANTEE (2026-06-12 per Peter: "cannot happen, no
// matter what") ───────────────────────────────────────────────────────
// A home-service business that has EVER been sourced is never sourced
// again. Three independent guards, any one trips → skip:
//   1. exact email
//   2. business_name + city composite
//   3. EMAIL DOMAIN — catches the same shop under info@ vs office@ vs
//      hello@ (one business, many inboxes). The strongest of the three.
// We pull the WHOLE existing email column (domains can't be filtered
// server-side cheaply) so the domain guard sees every prior contact.
function emailDomain(e) { return (e.split('@')[1] || '').toLowerCase().trim() }
// Free-mail domains are NOT business identities — never suppress on them,
// or one gmail shop would block every other gmail shop.
const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'aol.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'comcast.net', 'sbcglobal.net', 'att.net', 'msn.com'])

const { data: allPrior } = await supabase
  .from('outreach_leads')
  .select('email, business_name, city')
const seenEmails = new Set((allPrior || []).map((r) => (r.email || '').toLowerCase()))
const seenBizCity = new Set((allPrior || []).map((r) => `${(r.business_name || '').toLowerCase()}|${(r.city || '').toLowerCase()}`))
const seenDomains = new Set((allPrior || []).map((r) => emailDomain(r.email || '')).filter((d) => d && !FREEMAIL.has(d)))

// Also dedup WITHIN this batch (Apify can return a shop twice).
const batchEmails = new Set()
const batchDomains = new Set()

const fresh = candidates.filter((c) => {
  const dom = emailDomain(c.email)
  if (seenEmails.has(c.email)) return false
  if (seenBizCity.has(`${c.biz_name.toLowerCase()}|${c.city.toLowerCase()}`)) return false
  if (dom && !FREEMAIL.has(dom) && seenDomains.has(dom)) return false
  if (batchEmails.has(c.email)) return false
  if (dom && !FREEMAIL.has(dom) && batchDomains.has(dom)) return false
  batchEmails.add(c.email)
  if (dom && !FREEMAIL.has(dom)) batchDomains.add(dom)
  return true
})
console.log(`  never-repeat dedup (email + biz+city + domain): ${fresh.length} fresh, ${candidates.length - fresh.length} suppressed`)

if (DRY_RUN) {
  console.log('\n*** DRY-RUN. No insert. Sample:')
  console.log(JSON.stringify(fresh.slice(0, 3), null, 2))
  process.exit(0)
}

if (fresh.length === 0) {
  console.log('\n  nothing fresh to insert. exit.')
  process.exit(0)
}

const rows = fresh.map((c) => ({
  id: randomUUID(),
  email: c.email,
  business_name: c.biz_name,
  city: c.city,
  state: c.state,
  trade: c.trade,
  campaign_id: `mass-source-${TRADE}-${date}`,
  status: 'sourced',
}))

const { error } = await supabase.from('outreach_leads').insert(rows)
if (error) {
  console.error('  insert err:', error.message)
  process.exit(1)
}
console.log(`\n✓ inserted ${rows.length} new outreach_leads rows. status='sourced'.`)
console.log(`  next step: verify-emails cron picks them up + refill-outreach-queue / auto-load-instantly push to Instantly.\n`)
