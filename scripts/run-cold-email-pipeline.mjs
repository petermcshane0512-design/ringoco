#!/usr/bin/env node
/**
 * run-cold-email-pipeline.mjs — orchestrates the bulk personalized cold-email
 * generation for the HVAC campaign.
 *
 * INPUT
 *   CSV of enriched leads (output of scripts/enrich-leads.mjs). Required cols:
 *     business_name, zip, city, state, email, first_name, business_type
 *   Aliases honored: company_name|name -> business_name, owner_email -> email,
 *   owner_first_name -> first_name, trade|category -> business_type.
 *
 * WHAT IT DOES
 *   1. Reads input CSV
 *   2. For each lead, calls the live /api/sample-report/personalize endpoint
 *      in parallel (default 50 concurrent). That endpoint:
 *        - looks up cache in sample_reports (migration 026)
 *        - on miss: generates the report (Sonnet 4.6 + Google Places + Census)
 *        - writes the report to sample_reports so future opens are instant
 *   3. Extracts merge fields (rating, reviews, rank, top competitor, top
 *      opportunity, addressable market) from the returned ConsultingReport
 *   4. Builds the Instantly-ready row with:
 *        - report_url pointing at /sample-report?for=...&zip=...
 *        - subject_line pre-rendered with this lead's actual numbers
 *        - 14 merge tokens the cold email template consumes
 *   5. Writes output CSV + prints cost + funnel summary
 *
 * USAGE
 *   npm install csv-parse csv-stringify p-limit dotenv   (one-time)
 *   node scripts/run-cold-email-pipeline.mjs \
 *     --csv ./data/apify-phoenix-hvac-tier-a.csv \
 *     --output ./data/instantly-batch-2026-05-27.csv \
 *     --concurrency 50 \
 *     --base-url https://www.bellavego.com \
 *     --campaign hvac-summer-2026
 *
 *   Resume: if --output already exists, rows with matching email are skipped
 *   so re-running after a crash continues where it left off.
 *
 * ENV
 *   Optional: BELLAVEGO_BASE_URL (overrides --base-url default)
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import dotenv from 'dotenv'
import pLimit from 'p-limit'

dotenv.config()
dotenv.config({ path: '.env.local' })

// Output column order for the Instantly-ready CSV. Declared at top so the
// top-level await block below can reference it before the helper functions.
const INSTANTLY_COLUMNS = [
  'email', 'first_name', 'last_name', 'company_name', 'city', 'state',
  'subject_line', 'report_url',
  'your_rating', 'your_reviews', 'your_rank', 'total_competitors',
  'market_avg_rating', 'market_avg_reviews',
  'top_competitor_name', 'top_competitor_reviews',
  'top_opp_title', 'top_opp_monthly', 'top_opp_pattern',
  'addressable_monthly', 'homeowners', 'median_income',
  'campaign_id',
]

// ── CLI ────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2))
const inputPath = args.csv
const outputPath = args.output ?? deriveOutputPath(inputPath)
const concurrency = Number(args.concurrency ?? 50)
const baseUrl = (args['base-url'] ?? process.env.BELLAVEGO_BASE_URL ?? 'https://www.bellavego.com').replace(/\/$/, '')
const campaignId = args.campaign ?? null
const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'

if (!inputPath) {
  console.error('Usage: node scripts/run-cold-email-pipeline.mjs --csv <leads.csv> [--output <out.csv>] [--concurrency 50] [--base-url URL] [--campaign id]')
  process.exit(1)
}
if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`)
  process.exit(1)
}

// ── Read input ─────────────────────────────────────────────────────
const rawInput = fs.readFileSync(inputPath, 'utf8')
const inputRows = parse(rawInput, { columns: true, skip_empty_lines: true, trim: true })
console.log(`📥 ${inputRows.length} input rows from ${inputPath}`)

// Normalize column aliases so different lead sources (Apify, Apollo, manual)
// all flow through the same pipeline.
const leads = inputRows
  .map((r) => ({
    business_name: r.business_name || r.company_name || r.name || '',
    zip: String(
      r.zip || r.zip_code || r.postal_code || r.postalCode || extractZipFromAddress(r.address) || '',
    ).replace(/\D/g, '').slice(0, 5),
    city: r.city || '',
    state: r.state || '',
    email: r.email || r.owner_email || '',
    first_name: r.first_name || r.owner_first_name || '',
    business_type: r.business_type || r.trade || r.category || 'HVAC',
  }))
  .filter((l) => l.business_name && l.email)

function extractZipFromAddress(addr) {
  if (!addr) return ''
  const m = String(addr).match(/\b\d{5}\b/)
  return m ? m[0] : ''
}

console.log(`🧹 ${leads.length} usable leads after normalization`)

// ── Resume: skip rows already in output ────────────────────────────
const processedEmails = new Set()
if (fs.existsSync(outputPath)) {
  const existing = parse(fs.readFileSync(outputPath, 'utf8'), { columns: true, skip_empty_lines: true })
  for (const row of existing) {
    if (row.email) processedEmails.add(row.email.toLowerCase())
  }
  console.log(`♻️  ${processedEmails.size} rows already in ${outputPath} — resuming`)
}

const todo = leads.filter((l) => !processedEmails.has(l.email.toLowerCase()))
console.log(`🚀 ${todo.length} leads to personalize at concurrency=${concurrency}`)

if (dryRun) {
  console.log('🧪 --dry-run: no API calls, no file writes. Exiting.')
  process.exit(0)
}

// ── Personalize in parallel ────────────────────────────────────────
const limit = pLimit(concurrency)
const startedAt = Date.now()
let cacheHits = 0
let cacheMisses = 0
let errors = 0
const errorSamples = []

const outRows = []

await Promise.all(
  todo.map((lead) =>
    limit(async () => {
      try {
        const personalized = await personalize(lead)
        if (personalized.cached) cacheHits++
        else cacheMisses++
        outRows.push(buildInstantlyRow(lead, personalized.report))
        if ((cacheHits + cacheMisses) % 25 === 0) {
          const done = cacheHits + cacheMisses
          const elapsed = (Date.now() - startedAt) / 1000
          const rate = done / elapsed
          const eta = ((todo.length - done) / rate).toFixed(0)
          console.log(`  ${done}/${todo.length} (${(done / todo.length * 100).toFixed(1)}%) · ${rate.toFixed(1)}/sec · ETA ${eta}s · cache ${cacheHits} hit / ${cacheMisses} gen`)
        }
      } catch (e) {
        errors++
        if (errorSamples.length < 5) errorSamples.push({ email: lead.email, error: String(e).slice(0, 200) })
      }
    }),
  ),
)

// ── Write output ───────────────────────────────────────────────────
// Append to existing if resuming, else write fresh with header.
const isNewFile = !fs.existsSync(outputPath)
const csvBody = stringify(outRows, { header: isNewFile, columns: INSTANTLY_COLUMNS })
fs.appendFileSync(outputPath, csvBody)

// ── Summary ────────────────────────────────────────────────────────
const elapsed = (Date.now() - startedAt) / 1000
const apiCost = cacheMisses * 0.04 + cacheHits * 0.001 // rough — Sonnet generate vs cache lookup
console.log(`\n✅ Done in ${elapsed.toFixed(1)}s`)
console.log(`   Rows written: ${outRows.length}`)
console.log(`   Cache hits:   ${cacheHits} (pre-generated or repeated lead)`)
console.log(`   Cache misses: ${cacheMisses} (generated fresh)`)
console.log(`   Errors:       ${errors}`)
console.log(`   Est API cost: $${apiCost.toFixed(2)} (~$${(apiCost / Math.max(1, outRows.length) * 1000).toFixed(2)}/1K leads)`)
console.log(`   Output: ${outputPath}`)
if (errorSamples.length > 0) {
  console.log(`\n⚠️  First ${errorSamples.length} errors:`)
  for (const s of errorSamples) console.log(`   - ${s.email}: ${s.error}`)
}

// ── Helpers ────────────────────────────────────────────────────────

async function personalize(lead) {
  const qs = new URLSearchParams({
    for: lead.business_name,
    ...(lead.zip && { zip: lead.zip }),
    ...(lead.city && { city: lead.city }),
    ...(lead.business_type && { type: lead.business_type }),
    ...(lead.email && { email: lead.email }),
    ...(campaignId && { campaign: campaignId }),
  })
  const url = `${baseUrl}/api/sample-report/personalize?${qs.toString()}`

  // Retry once on transient failures (5xx, network blip) before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`)
      }
      const json = await res.json()
      if (!json.report) throw new Error('no report in response')
      // usingFallback=true means Places lookup failed and report is SAMPLE_REPORT
      // defaults — pipeline should skip these so we never email identical fake
      // data to multiple shops. (Endpoint returns this flag on cache miss; on
      // cache hit it isn't set, but cached rows were only stored if real.)
      if (json.usingFallback === true) {
        throw new Error('places_fallback — refusing to send identical defaults')
      }
      return { report: json.report, cached: !!json.cached, token: json.token }
    } catch (e) {
      if (attempt === 1) throw e
      await sleep(800 + Math.random() * 800)
    }
  }
  throw new Error('unreachable')
}

function buildInstantlyRow(lead, report) {
  const top = report.opportunities?.[0] ?? {}
  const competitive = report.competitive ?? {}
  const market = report.marketScan ?? {}
  const topCompetitor = competitive.competitors?.[0] ?? {}

  const yourReviews = competitive.yourReviewCount ?? 0
  const marketAvgReviews = competitive.marketAvgReviewCount ?? 0
  const city = lead.city || report.meta?.metroLabel || ''
  const businessType = lead.business_type

  // Pre-render the subject line so Instantly doesn't need its own template
  // engine. Keeps deliverability characteristics consistent across the batch.
  const subject = `${lead.business_name} — ${city} ${businessType} market intel (${yourReviews} reviews vs ${marketAvgReviews} avg)`

  const reportQs = new URLSearchParams({
    for: lead.business_name,
    ...(lead.zip && { zip: lead.zip }),
    ...(businessType && { type: businessType }),
    ...(city && { city }),
  })
  const reportUrl = `${baseUrl}/sample-report?${reportQs.toString()}`

  return {
    email: lead.email,
    first_name: lead.first_name || 'there',
    last_name: '',
    company_name: lead.business_name,
    city,
    state: lead.state,
    subject_line: subject,
    report_url: reportUrl,
    your_rating: competitive.yourRating ?? '',
    your_reviews: yourReviews,
    your_rank: competitive.yourRank ?? '',
    total_competitors: competitive.totalCompetitors ?? '',
    market_avg_rating: competitive.marketAvgRating ?? '',
    market_avg_reviews: marketAvgReviews,
    top_competitor_name: topCompetitor.name ?? '',
    top_competitor_reviews: topCompetitor.reviewCount ?? '',
    top_opp_title: top.title ?? '',
    top_opp_monthly: top.monthlyValue ?? '',
    top_opp_pattern: (top.pattern ?? '').slice(0, 220),
    addressable_monthly: market.addressableRevenueMonthly ?? '',
    homeowners: market.homeownersInArea ?? '',
    median_income: market.medianIncome ?? '',
    campaign_id: campaignId ?? '',
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

function deriveOutputPath(input) {
  if (!input) return null
  const parsed = path.parse(input)
  return path.join(parsed.dir, `${parsed.name}-instantly.csv`)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
