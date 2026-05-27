#!/usr/bin/env node
/**
 * scrape-emails.mjs — adds real email column to an enriched leads CSV.
 *
 * Apify's Google Maps scraper returns business name + phone + website but
 * NOT email (Google doesn't surface emails). This script fills the gap by
 * sending the website URLs through Apify's Contact Info Scraper actor,
 * which visits each site and extracts emails/socials from Contact pages.
 *
 * INPUT
 *   CSV with a `website` column. Other columns are passed through unchanged.
 *
 * OUTPUT
 *   {basename}-with-emails.csv — same rows + new columns: email, all_emails,
 *   linkedin, facebook, twitter
 *
 * USAGE
 *   node scripts/scrape-emails.mjs <path-to-csv>
 *
 * COST
 *   Apify Contact Info Scraper: ~$5 per 1000 URLs → $0.005 per lead.
 *   100 Arizona leads ≈ $0.50.
 *
 * ENV
 *   APIFY_TOKEN — required.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const APIFY_TOKEN = process.env.APIFY_TOKEN
if (!APIFY_TOKEN) {
  console.error('FATAL: APIFY_TOKEN env var missing')
  process.exit(1)
}

// CLI: positional CSV path, optional --dataset <id> to skip Apify run.
const cliArgs = process.argv.slice(2)
let inputPath = null
let datasetIdOverride = null
for (let i = 0; i < cliArgs.length; i++) {
  const a = cliArgs[i]
  if (a === '--dataset') {
    datasetIdOverride = cliArgs[i + 1]
    i++
  } else if (!a.startsWith('--')) {
    inputPath = a
  }
}

if (!inputPath) {
  console.error('Usage: node scripts/scrape-emails.mjs <path-to-csv> [--dataset <existing-dataset-id>]')
  process.exit(1)
}
if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`)
  process.exit(1)
}

const ACTOR_ID = 'vdrmota~contact-info-scraper'

const rawInput = fs.readFileSync(inputPath, 'utf8')
const rows = parse(rawInput, { columns: true, skip_empty_lines: true, trim: true })
console.log(`📂 ${rows.length} rows from ${inputPath}`)

// Collect unique websites (some rows may share a website).
const websiteToRows = new Map()
for (const row of rows) {
  const url = (row.website || '').trim()
  if (!url || url === '(none)') continue
  const normalized = url.startsWith('http') ? url : `https://${url}`
  if (!websiteToRows.has(normalized)) websiteToRows.set(normalized, [])
  websiteToRows.get(normalized).push(row)
}

const urls = [...websiteToRows.keys()]
console.log(`🔗 ${urls.length} unique websites to crawl`)

if (urls.length === 0) {
  console.error('No website URLs in input — nothing to scrape')
  process.exit(1)
}

// ── Run Apify (skip if --dataset given) ────────────────────────
let datasetId = datasetIdOverride
const t0 = Date.now()

if (datasetId) {
  console.log(`♻️  Skipping Apify run — using existing dataset ${datasetId}`)
} else {
  console.log(`🤖 Starting Apify ${ACTOR_ID}…`)

const input = {
  startUrls: urls.map((url) => ({ url })),
  // Homepage + up to 2 linked pages (Contact, About). Depth 1 = same hop.
  // Most contractor sites put email on /contact or in footer of homepage.
  maxDepth: 1,
  maxRequestsPerStartUrl: 3,
  considerChildFrames: false,
  sameDomain: true,
  proxyConfig: { useApifyProxy: true },
}

const startUrl = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}`
const startRes = await fetch(startUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(input),
})
if (!startRes.ok) {
  console.error(`start failed (${startRes.status}):`, (await startRes.text()).slice(0, 500))
  process.exit(1)
}
const startJson = await startRes.json()
const runId = startJson?.data?.id
datasetId = startJson?.data?.defaultDatasetId
if (!runId || !datasetId) {
  console.error('Apify did not return runId / datasetId:', startJson)
  process.exit(1)
}
console.log(`   runId=${runId} datasetId=${datasetId} — polling…`)

// Poll for status. Most runs land in 2-5 min, allow 15 min ceiling.
const POLL_INTERVAL = 5000
const MAX_WAIT_MS = 15 * 60 * 1000
let status = 'RUNNING'
let polls = 0
while (Date.now() - t0 < MAX_WAIT_MS) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
  if (!statusRes.ok) {
    console.warn(`   status poll ${statusRes.status}, retrying`)
    continue
  }
  const statusJson = await statusRes.json()
  status = statusJson?.data?.status ?? status
  polls++
  if (polls % 6 === 0) {
    const elapsedS = ((Date.now() - t0) / 1000).toFixed(0)
    console.log(`   [${elapsedS}s] status=${status} stats=${JSON.stringify(statusJson?.data?.stats ?? {}).slice(0, 80)}`)
  }
  if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') break
}
if (status !== 'SUCCEEDED') {
  console.error(`Apify run ended with status=${status}`)
  process.exit(1)
}
} // end else (Apify run)

// Pull dataset
const datasetRes = await fetch(
  `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`,
)
if (!datasetRes.ok) {
  console.error(`dataset fetch failed (${datasetRes.status}):`, (await datasetRes.text()).slice(0, 500))
  process.exit(1)
}
const items = await datasetRes.json()
const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`✅ Apify returned ${items.length} results in ${elapsed}s`)

// ── Index results by domain ────────────────────────────────────
// vdrmota/contact-info-scraper returns { originalStartUrl, domain, emails,
// phones, linkedIns, facebooks, twitters, instagrams, ... }
const byDomain = new Map()
for (const item of items) {
  const d = item.domain || extractDomain(item.originalStartUrl || '')
  if (!d) continue
  byDomain.set(d.replace(/^www\./, ''), item)
}

// ── Merge emails back into rows ────────────────────────────────
let matched = 0
for (const row of rows) {
  const url = (row.website || '').trim()
  if (!url || url === '(none)') {
    row.email = ''
    row.all_emails = ''
    row.phone_extracted = ''
    row.linkedin = ''
    row.facebook = ''
    row.instagram = ''
    continue
  }
  const normalized = url.startsWith('http') ? url : `https://${url}`
  const d = extractDomain(normalized).replace(/^www\./, '').replace(/^https?:\/\//, '')
  const item = byDomain.get(d)
  const emails = (item?.emails || []).filter((e) => looksValid(e))
  row.email = emails[0] || ''
  row.all_emails = emails.join('|')
  row.phone_extracted = (item?.phones || [])[0] || ''
  row.linkedin = (item?.linkedIns || [])[0] || ''
  row.facebook = (item?.facebooks || [])[0] || ''
  row.instagram = (item?.instagrams || [])[0] || ''
  if (emails.length > 0) matched++
}

// ── Write output ───────────────────────────────────────────────
const parsed = path.parse(inputPath)
const outputPath = path.join(parsed.dir, `${parsed.name}-with-emails.csv`)
const allCols = Array.from(
  new Set(rows.flatMap((r) => Object.keys(r))),
)
const csv = stringify(rows, { header: true, columns: allCols })
fs.writeFileSync(outputPath, csv)

console.log(`\n════════════════════════════════════════════════════════════════`)
console.log('DONE')
console.log(`════════════════════════════════════════════════════════════════`)
console.log(`Rows total:        ${rows.length}`)
console.log(`Websites crawled:  ${urls.length}`)
console.log(`Rows with email:   ${matched} (${((matched / rows.length) * 100).toFixed(0)}%)`)
console.log(`Output: ${outputPath}`)

// ── Helpers ────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    const u = new URL(url)
    return `https://${u.hostname.replace(/^www\./, '')}`
  } catch {
    return url
  }
}

function looksValid(e) {
  if (!e || typeof e !== 'string') return false
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false
  // Drop common-bot/scrape-trap addresses
  const bad = ['example.com', 'wixpress.com', 'sentry.io', 'wordpress.com', 'wordpress.org', 'godaddy.com', 'noreply', 'no-reply', 'donotreply']
  if (bad.some((b) => e.toLowerCase().includes(b))) return false
  return true
}
