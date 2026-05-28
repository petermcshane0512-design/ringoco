#!/usr/bin/env node
/**
 * pull-queue-from-db.mjs — build a send-ready Instantly CSV by joining
 * outreach_leads.status='queued' with their cached sample_reports.
 *
 * Mirrors the Vercel cron logic but runs on the laptop. Atomically flips
 * pulled leads to 'sending' so a concurrent cron run can't double-send.
 *
 * USAGE
 *   node scripts/pull-queue-from-db.mjs --limit 22 --output leads/today-22.csv
 */

import fs from 'node:fs'
import { stringify } from 'csv-stringify/sync'
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]])
  return a
}, []))
const limit = parseInt(args.limit ?? '50', 10)
const out = args.output ?? `leads/queue-pulled-${new Date().toISOString().slice(0, 10)}.csv`

const PLACEHOLDER = ['example.com', 'example.org', 'domain.com', 'yourcompany.com',
  'your@', 'youremail@', 'name@', 'email@', 'test@', 'demo@', 'sample@',
  'noreply@', 'no-reply@', 'donotreply', 'bobsrepair.com', 'impallari@']
const isPlaceholder = (e) => {
  if (!e) return true
  const low = e.toLowerCase()
  if (PLACEHOLDER.some((p) => low.includes(p))) return true
  const local = low.split('@')[0]
  if (/^\d+$/.test(local)) return true
  if (local.length > 30) return true
  return false
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()

const r = await c.query(`
  SELECT
    ol.id, ol.email, ol.business_name, ol.owner_first_name,
    ol.city, ol.trade, ol.campaign_id,
    sr.report, sr.zip, sr.city as report_city, sr.token
  FROM outreach_leads ol
  LEFT JOIN sample_reports sr
    ON LOWER(sr.business_name) = LOWER(ol.business_name)
  WHERE ol.status = 'queued'
    AND ol.email IS NOT NULL
    AND sr.report IS NOT NULL
  ORDER BY ol.pushed_at ASC
  LIMIT $1
`, [limit * 2])

const filtered = r.rows.filter((row) => !isPlaceholder(row.email)).slice(0, limit)
console.log(`📊 Pulled ${r.rows.length} candidates · ${filtered.length} sendable after placeholder filter`)

if (filtered.length === 0) {
  console.log('🪫 No sendable leads. Exiting.')
  await c.end()
  process.exit(0)
}

// Atomically mark these as 'sending' so cron doesn't double-pull
const ids = filtered.map((f) => f.id)
await c.query(`UPDATE outreach_leads SET status='sending', updated_at=now() WHERE id = ANY($1::uuid[])`, [ids])
console.log(`✅ Claimed ${filtered.length} leads (status=sending)`)

// Build CSV rows in send-via-gmail.mjs shape
const csvRows = filtered.map((row) => {
  const r = row.report
  const c = r?.competitive ?? {}
  const top = (r?.opportunities ?? [])[0] ?? {}
  const topComp = (c.competitors ?? [])[0] ?? {}
  const market = r?.marketScan ?? {}
  const city = row.report_city ?? row.city ?? ''
  const reportUrl = `https://www.bellavego.com/sample-report?for=${encodeURIComponent(row.business_name)}&zip=${encodeURIComponent(row.zip ?? '')}&type=${encodeURIComponent(row.trade ?? 'HVAC')}&city=${encodeURIComponent(city)}`
  return {
    email: row.email,
    first_name: row.owner_first_name || 'there',
    last_name: '',
    company_name: row.business_name,
    city,
    state: '',
    subject_line: `${row.business_name} — ${city} ${row.trade ?? 'HVAC'} market intel (${c.yourReviewCount ?? 0} reviews vs ${c.marketAvgReviewCount ?? 0} avg)`,
    report_url: reportUrl,
    your_rating: c.yourRating ?? '',
    your_reviews: c.yourReviewCount ?? '',
    your_rank: c.yourRank ?? '',
    total_competitors: c.totalCompetitors ?? '',
    market_avg_rating: c.marketAvgRating ?? '',
    market_avg_reviews: c.marketAvgReviewCount ?? '',
    top_competitor_name: topComp.name ?? '',
    top_competitor_reviews: topComp.reviewCount ?? '',
    top_opp_title: top.title ?? '',
    top_opp_monthly: top.monthlyValue ?? '',
    top_opp_pattern: (top.pattern ?? '').slice(0, 220),
    addressable_monthly: market.addressableRevenueMonthly ?? '',
    homeowners: market.homeownersInArea ?? '',
    median_income: market.medianIncome ?? '',
    campaign_id: row.campaign_id ?? '',
    lead_id: row.id,
  }
})

const cols = ['email', 'first_name', 'last_name', 'company_name', 'city', 'state', 'subject_line', 'report_url', 'your_rating', 'your_reviews', 'your_rank', 'total_competitors', 'market_avg_rating', 'market_avg_reviews', 'top_competitor_name', 'top_competitor_reviews', 'top_opp_title', 'top_opp_monthly', 'top_opp_pattern', 'addressable_monthly', 'homeowners', 'median_income', 'campaign_id', 'lead_id']
fs.writeFileSync(out, stringify(csvRows, { header: true, columns: cols }))
console.log(`📁 ${out}`)
console.log(`\nNext: node scripts/send-via-gmail.mjs --csv ${out} --limit ${limit} --throttle 30`)

await c.end()
