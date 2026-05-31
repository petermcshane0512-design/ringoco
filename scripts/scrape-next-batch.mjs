#!/usr/bin/env node
/**
 * scrape-next-batch.mjs — orchestrates tomorrow's scrape per the schedule.
 *
 * What it does (start to finish):
 *   1. Reads data/scrape-schedule.json for tomorrow's target cities + counts
 *   2. For each city: runs Apify Google Maps scrape (target N shops)
 *   3. Filters/tiers via enrich-leads.mjs
 *   4. Runs Apify Contact Info Scraper for emails (uses async pattern)
 *   5. Imports to outreach_leads (UNIQUE on email — auto-dedups against
 *      every prospect ever scraped, no repeats ever)
 *   6. Runs cold-email-pipeline to pre-generate + cache reports
 *   7. Outputs leads/queue-<date>.csv ready for next morning's send
 *
 * USAGE
 *   node scripts/scrape-next-batch.mjs                       # uses tomorrow's date
 *   node scripts/scrape-next-batch.mjs --date 2026-05-28     # specific date
 *   node scripts/scrape-next-batch.mjs --dry-run             # plan only, no Apify spend
 *
 * Designed to run NIGHTLY via cron (2am ET ideal). When wired to Vercel cron,
 * Peter wakes up to fully-prepped batch waiting in leads/queue-YYYY-MM-DD.csv.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const args = parseArgs(process.argv.slice(2))
const dryRun = args['dry-run'] === true || args['dry-run'] === 'true'

// Default to tomorrow's date in ET
function getTargetDate() {
  if (args.date) return args.date
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return tomorrow.toISOString().slice(0, 10)
}
const targetDate = getTargetDate()

// Load schedule
const schedulePath = 'C:\\Users\\peter\\ringoco\\data\\scrape-schedule.json'
const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'))
const day = schedule.schedule.find((d) => d.date === targetDate)
if (!day) {
  console.error(`No schedule entry for ${targetDate}. Add it to data/scrape-schedule.json.`)
  process.exit(1)
}

console.log(`\n╔══════════════════════════════════════════════════════════════╗`)
console.log(`║ Scrape Next Batch — ${targetDate}                            ║`)
console.log(`╚══════════════════════════════════════════════════════════════╝`)
console.log(`📅 Target date:    ${targetDate}`)
console.log(`📊 Send target:    ${day.send_target}/day`)
console.log(`🔍 Scrape target:  ${day.scrape_target}/day (buffer for missing emails)`)
console.log(`📍 Cities:         ${day.cities.join(', ')}`)
console.log(`💰 Est cost:       Apify ~$${(day.scrape_target * 0.015).toFixed(2)} (maps+emails) · Anthropic ~$${(day.scrape_target * 0.04).toFixed(2)} (reports)\n`)

if (dryRun) {
  console.log('🧪 --dry-run: no Apify spend, no DB writes. Exiting.')
  process.exit(0)
}

// Multi-trade: load trades.json, determine active trades for today's phase.
// Defaults to HVAC only if file missing (back-compat with pre-5/30 schedule).
let activeTrades = [{ key: 'HVAC', query: 'HVAC contractor' }]
try {
  const tradesCfg = JSON.parse(fs.readFileSync('C:\\Users\\peter\\ringoco\\data\\trades.json', 'utf8'))
  const phases = tradesCfg.rollout_phases ?? []
  const todayIso = new Date().toISOString().slice(0, 10)
  // Pick the latest phase whose start_date <= today
  const currentPhase = [...phases]
    .filter((p) => p.start_date <= todayIso)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0]
  if (currentPhase) {
    const activeKeys = new Set(currentPhase.active_trades)
    activeTrades = tradesCfg.trades.filter((t) => activeKeys.has(t.key))
    console.log(`📐 Phase: ${currentPhase.phase} — active trades: ${activeTrades.map((t) => t.key).join(', ')}`)
  } else {
    console.log(`📐 No active phase yet (next starts ${phases[0]?.start_date}). HVAC-only baseline.`)
  }
} catch (e) {
  console.log(`📐 trades.json missing/invalid — defaulting to HVAC only: ${e.message}`)
}

const perTradePerCity = Math.max(20, Math.ceil(day.scrape_target / (day.cities.length * activeTrades.length)))
console.log(`📦 ${perTradePerCity} shops per (trade × city) × ${activeTrades.length} trades × ${day.cities.length} cities\n`)

// Step 1+2: Scrape Google Maps for each (trade × city) combo
const rawCSVs = []
for (const trade of activeTrades) {
  for (const city of day.cities) {
    const citySlug = city.toLowerCase().replace(/[, ]+/g, '-')
    const tradeSlug = trade.key.toLowerCase()
    const out = `C:\\Users\\peter\\ringoco\\leads\\${tradeSlug}-${citySlug}-${targetDate}-raw.csv`
    console.log(`▶ Scrape ${trade.key} in ${city} → ${out}`)
    try {
      execSync(
        `node C:\\Users\\peter\\ringoco\\scripts\\scrape-leads.mjs --query "${trade.query}" --location "${city}" --max ${perTradePerCity} --out "${out}"`,
        { stdio: 'inherit', env: process.env },
      )
      rawCSVs.push({ path: out, trade: trade.key })
    } catch (e) {
      console.warn(`   ⚠ ${trade.key}/${city} scrape failed (continuing): ${e.message}`)
    }
  }
}

// Step 3: Combine all raw CSVs, enrich + tier (per-trade)
console.log(`\n🤖 Enriching ${rawCSVs.length} raw files via Claude tier filter...`)
const enrichedCSVs = []
for (const item of rawCSVs) {
  const raw = item.path
  const enriched = raw.replace('-raw.csv', '-enriched.csv')
  if (fs.existsSync(enriched)) fs.unlinkSync(enriched)
  try {
    execSync(`node C:\\Users\\peter\\ringoco\\scripts\\enrich-leads.mjs "${raw}"`, { stdio: 'inherit', env: process.env })
    if (fs.existsSync(raw.replace('-raw.csv', '-raw-enriched.csv'))) {
      enrichedCSVs.push({ path: raw.replace('-raw.csv', '-raw-enriched.csv'), trade: item.trade })
    }
  } catch (e) {
    console.warn(`   ⚠ enrich failed for ${raw}: ${e.message}`)
  }
}

// Step 4: Apify Contact Info Scraper for emails on each enriched CSV
console.log(`\n📧 Scraping emails for ${enrichedCSVs.length} enriched files...`)
const withEmailCSVs = []
for (const item of enrichedCSVs) {
  const enriched = item.path
  try {
    execSync(`node C:\\Users\\peter\\ringoco\\scripts\\scrape-emails.mjs "${enriched}"`, { stdio: 'inherit', env: process.env })
    const withEmails = enriched.replace('.csv', '-with-emails.csv')
    if (fs.existsSync(withEmails)) withEmailCSVs.push({ path: withEmails, trade: item.trade })
  } catch (e) {
    console.warn(`   ⚠ email scrape failed for ${enriched}: ${e.message}`)
  }
}

// Step 5: Combine all with-emails CSVs + import to outreach_leads (UNIQUE constraint dedups)
// Per-trade campaign tag so reporting can break down conv by trade
console.log(`\n💾 Importing ${withEmailCSVs.length} CSVs to outreach_leads (auto-dedup)...`)
for (const item of withEmailCSVs) {
  const csv = item.path
  const trade = item.trade
  try {
    execSync(`node C:\\Users\\peter\\ringoco\\scripts\\import-leads-to-db.mjs "${csv}" --trade ${trade} --campaign ${trade.toLowerCase()}-${targetDate}`, { stdio: 'inherit', env: process.env })
  } catch (e) {
    console.warn(`   ⚠ import failed for ${csv}: ${e.message}`)
  }
}

// Step 6: Combine all with-emails CSVs into one + run cold-email-pipeline for personalization + cache write
const combinedPath = `C:\\Users\\peter\\ringoco\\leads\\queue-${targetDate}-input.csv`
console.log(`\n🔗 Combining all with-emails CSVs → ${combinedPath}`)
let combinedHeader = null
const combinedLines = []
for (const item of withEmailCSVs) {
  const csv = item.path
  const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/).filter((l) => l)
  if (lines.length === 0) continue
  if (!combinedHeader) {
    combinedHeader = lines[0]
    combinedLines.push(lines[0])
  }
  combinedLines.push(...lines.slice(1))
}
fs.writeFileSync(combinedPath, combinedLines.join('\n'))
console.log(`   ${combinedLines.length - 1} total rows`)

// Step 7: Personalize all via pipeline (writes to sample_reports cache, generates Instantly CSV)
const finalQueuePath = `C:\\Users\\peter\\ringoco\\leads\\queue-${targetDate}.csv`
console.log(`\n🚀 Generating personalized reports → ${finalQueuePath}`)
try {
  execSync(
    `node C:\\Users\\peter\\ringoco\\scripts\\run-cold-email-pipeline.mjs --csv "${combinedPath}" --concurrency 5 --campaign hvac-${targetDate} --output "${finalQueuePath}"`,
    { stdio: 'inherit', env: process.env },
  )
} catch (e) {
  console.error('Pipeline failed:', e.message)
  process.exit(1)
}

console.log(`\n╔══════════════════════════════════════════════════════════════╗`)
console.log(`║ ✅ Batch ready for ${targetDate}                              ║`)
console.log(`╚══════════════════════════════════════════════════════════════╝`)
console.log(`📁 Send file:  ${finalQueuePath}`)
console.log(`\nTo send tomorrow:`)
console.log(`   node scripts/send-via-gmail.mjs --csv ${finalQueuePath} --limit ${day.send_target} --throttle 90`)

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) { out[key] = next; i++ }
    else { out[key] = true }
  }
  return out
}
