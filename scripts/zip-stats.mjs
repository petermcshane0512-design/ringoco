#!/usr/bin/env node
/**
 * zip-stats.mjs — BUILD 2 (2026-06-11 per Peter): live-stat email generator
 * for contractor prospecting.
 *
 * Queries Chicago Building Violations (22u3-xenr) + Ordinance Violations /
 * Admin Hearings (6br9-quuz) for the given zips + trade, outputs a CSV of
 * Instantly custom variables:
 *
 *   zip, trade, open_violation_count, hearings_count, example_issue
 *
 * PRIVACY: counts + anonymized issue text ONLY. No homeowner names, no
 * street addresses in the output — descriptions are scrubbed of leading
 * address-like tokens before writing.
 *
 * Runs on demand against the LIVE API — stats are never stale.
 *
 * Usage:
 *   node scripts/zip-stats.mjs --zips 60643,60628,60655 --trade roofing
 *   node scripts/zip-stats.mjs --zips 60618 --trade hvac --days 60
 *
 * Trades come from src/config/tradeTriggers.json (editable, shared with
 * the ingestion cron — one keyword language everywhere).
 */
import fs from 'node:fs'
import path from 'node:path'

const cfg = JSON.parse(fs.readFileSync(path.resolve('src/config/tradeTriggers.json'), 'utf8'))

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const ZIPS = (arg('zips', '') || '').split(',').map((z) => z.trim()).filter((z) => /^\d{5}$/.test(z))
const TRADE = (arg('trade', '') || '').toLowerCase()
const DAYS = parseInt(arg('days', '60'), 10)
if (ZIPS.length === 0 || !TRADE) {
  console.error('Usage: node scripts/zip-stats.mjs --zips 60643,60628 --trade roofing [--days 60]')
  process.exit(1)
}
const rule = cfg.trades.find((t) => t.key === TRADE || t.engineTrade === TRADE)
if (!rule) {
  console.error(`Unknown trade "${TRADE}". Known: ${cfg.trades.map((t) => t.key).join(', ')}`)
  process.exit(1)
}
const patterns = rule.patterns.map((p) => new RegExp(p, 'i'))
const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10)
const D = 'data.cityofchicago.org'

// Zip centroid via free zippopotam (no key). 2.4km radius ≈ a Chicago zip.
async function zipCenter(zip) {
  const r = await fetch(`https://api.zippopotam.us/us/${zip}`)
  if (!r.ok) return null
  const j = await r.json()
  const p = j.places?.[0]
  return p ? { lat: Number(p.latitude), lng: Number(p.longitude) } : null
}

async function soda(resource, where, limit = 2000) {
  const url = `https://${D}/resource/${resource}.json?$where=${encodeURIComponent(where)}&$limit=${limit}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${resource} HTTP ${r.status}`)
  return await r.json()
}

function matchesTrade(text) {
  return patterns.some((re) => re.test(text || ''))
}

// Scrub anything address-shaped + names; sentence-case all-caps runs.
function anonymize(text) {
  let t = (text || '')
    .replace(/\b\d{2,5}\s+[NSEW]\.?\s+\w+(\s+(AVE|ST|BLVD|RD|DR|PL|CT|LN|TER|PKWY|WAY))?\b/gi, '')
    .replace(/\(?\b1[0-9]-[0-9-]+[^)]*\)?/g, '')
    .replace(/\b(and|or)\s*[).,]?\s*$/i, '')
    .replace(/'\s*'+/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (t === t.toUpperCase() && /[A-Z]{4,}/.test(t)) {
    t = t.toLowerCase()
    t = t.charAt(0).toUpperCase() + t.slice(1)
  }
  return t.slice(0, 110)
}

const rows = [['zip', 'trade', 'open_violation_count', 'hearings_count', 'example_issue']]

for (const zip of ZIPS) {
  process.stdout.write(`→ ${zip} … `)
  const center = await zipCenter(zip)
  if (!center) { console.log('no centroid, skipped'); continue }
  const circle = (col) => `within_circle(${col}, ${center.lat}, ${center.lng}, 2400)`

  let openCount = 0
  let hearingsCount = 0
  const examples = []

  try {
    const v = await soda('22u3-xenr', `violation_date >= '${since}' AND violation_status = 'OPEN' AND ${circle('location')}`)
    for (const r of v) {
      const text = `${r.violation_description || ''} ${r.violation_ordinance || ''} ${r.violation_inspector_comments || ''}`
      if (!matchesTrade(text)) continue
      openCount++
      if (examples.length < 3) examples.push(anonymize(r.violation_ordinance || r.violation_description))
    }
  } catch (e) { console.error(`violations err: ${e.message}`) }

  try {
    const h = await soda('6br9-quuz', `last_modified_date >= '${since}' AND issuing_department = 'Buildings' AND ${circle('location')}`)
    for (const r of h) {
      if (!matchesTrade(r.violation_description || '')) continue
      hearingsCount++
      if (examples.length < 3) examples.push(anonymize(r.violation_description))
    }
  } catch (e) { console.error(`hearings err: ${e.message}`) }

  const example = examples.filter(Boolean)[0] || ''
  rows.push([zip, rule.key, String(openCount), String(hearingsCount), example])
  console.log(`open=${openCount} hearings=${hearingsCount}`)
}

const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
const outDir = path.resolve('leads')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `zip-stats-${rule.key}-${new Date().toISOString().slice(0, 10)}.csv`)
fs.writeFileSync(outFile, csv)
console.log(`\n${csv}\n\n✓ wrote ${outFile} — ready for Instantly custom variables`)
