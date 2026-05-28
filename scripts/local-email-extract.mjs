#!/usr/bin/env node
/**
 * local-email-extract.mjs — FREE email extraction from website URLs.
 *
 * No Apify, no third-party API. Just Node fetch + regex on the HTML.
 * Tries homepage + /contact + /about + /contact-us. Decodes obfuscated
 * mailto links and pulls inline emails.
 *
 * INPUT
 *   Any CSV with `business_name` + `website` columns. Other cols pass through.
 *
 * OUTPUT
 *   {basename}-with-emails-local.csv — same rows + new `email` + `all_emails`
 *   columns (only for rows that had a website and we found emails).
 *
 * USAGE
 *   node scripts/local-email-extract.mjs <path-to-csv> [--concurrency 8]
 *
 * Expected lift: combines with the existing Apify result to push extraction
 * 25% → 60-75% without spending another cent.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import pLimit from 'p-limit'

const args = parseArgs(process.argv.slice(2))
const inputPath = args._[0]
const concurrency = parseInt(args.concurrency ?? '8', 10)
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('Usage: node scripts/local-email-extract.mjs <csv-path> [--concurrency 8]')
  process.exit(1)
}

const rows = parse(fs.readFileSync(inputPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
console.log(`📂 ${rows.length} rows in ${path.basename(inputPath)}`)

// Only fetch sites for rows that have a website AND don't already have a valid email.
const toFetch = rows.filter((r) => {
  const w = (r.website || '').trim()
  if (!w || w === '(none)' || !w.startsWith('http')) return false
  const existing = (r.email || '').trim()
  return !existing || !existing.includes('@') || existing.startsWith('//') || existing.startsWith('+')
})
console.log(`🌐 ${toFetch.length} websites to fetch (rest already have email or no site)`)

const EMAIL_RE = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g
const MAILTO_RE = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
const PATHS = ['', '/contact', '/contact-us', '/about', '/about-us', '/contact.html']

const limit = pLimit(concurrency)
let processed = 0
let foundCount = 0

const enriched = await Promise.all(rows.map((r) => limit(async () => {
  const w = (r.website || '').trim()
  // Skip if no website or already has valid email
  if (!toFetch.includes(r)) return r

  const base = w.replace(/\/$/, '')
  const seen = new Set()

  for (const p of PATHS) {
    if (seen.size >= 3) break // already have 3 emails, stop fetching
    const url = `${base}${p}`
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BellAveGoBot/1.0; +https://www.bellavego.com)' },
        redirect: 'follow',
      })
      clearTimeout(t)
      if (!res.ok) continue
      const html = (await res.text()).slice(0, 500_000) // cap at 500KB

      // Pull mailto: links first (more reliable)
      for (const m of html.matchAll(MAILTO_RE)) {
        const e = m[1].toLowerCase()
        if (looksValid(e, base)) seen.add(e)
      }
      // Then inline emails
      for (const m of html.matchAll(EMAIL_RE)) {
        const e = m[1].toLowerCase()
        if (looksValid(e, base)) seen.add(e)
      }
    } catch {
      // network blip, try next path
    }
  }

  processed++
  if (processed % 20 === 0) {
    console.log(`  [${processed}/${toFetch.length}] running... found so far: ${foundCount}`)
  }

  if (seen.size === 0) return r
  foundCount++
  const emails = [...seen]
  // Prefer business-domain emails over @gmail.com etc
  const domain = (() => { try { return new URL(base).hostname.replace(/^www\./, '') } catch { return '' } })()
  emails.sort((a, b) => {
    const aMatch = domain && a.endsWith(`@${domain}`)
    const bMatch = domain && b.endsWith(`@${domain}`)
    if (aMatch && !bMatch) return -1
    if (!aMatch && bMatch) return 1
    return 0
  })
  return { ...r, email: emails[0], all_emails: emails.join('|') }
})))

// Write output
const parsed = path.parse(inputPath)
const outPath = path.join(parsed.dir, `${parsed.name}-local-emails.csv`)
const allCols = Array.from(new Set(enriched.flatMap((r) => Object.keys(r))))
fs.writeFileSync(outPath, stringify(enriched, { header: true, columns: allCols }))

const total = enriched.filter((r) => r.email && r.email.includes('@') && !r.email.startsWith('//') && !r.email.startsWith('+')).length
const rate = enriched.length > 0 ? Math.round((total / enriched.length) * 100) : 0
console.log(`\n✅ ${outPath}`)
console.log(`   Sites fetched: ${toFetch.length}`)
console.log(`   New emails found: ${foundCount}`)
console.log(`   Total rows with email: ${total}/${enriched.length} (${rate}%)`)

function looksValid(e, base) {
  if (!e || typeof e !== 'string' || e.length > 100) return false
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return false
  const bad = ['example.com', 'wixpress.com', 'sentry.io', 'wordpress.com', 'wordpress.org', 'godaddy.com', 'noreply@', 'no-reply@', 'donotreply', 'cloudflare.com', 'jquery.com', 'w3.org', 'png@', 'jpg@', 'svg@', 'gif@', 'webp@', 'youtube.com', 'youtu.be', 'sentry-next.com', '@sentry', 'cloudfront.net', 'github.io', 'schema.org']
  if (bad.some((b) => e.includes(b))) return false
  // Filter out emails that look like image filenames
  if (/\.(png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|eot|css|js|ico)/.test(e)) return false
  return true
}

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) { out[key] = next; i++ }
      else { out[key] = true }
    } else out._.push(a)
  }
  return out
}
