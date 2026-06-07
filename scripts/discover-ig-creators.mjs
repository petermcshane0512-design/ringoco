#!/usr/bin/env node
/**
 * Standalone IG creator discovery — mirrors the
 * /api/crons/ig-creator-discovery route but runs locally so we don't need
 * the prod ADMIN_API_SECRET. Reads APIFY_TOKEN + Supabase service-role
 * from .env.local, hits Apify Instagram Hashtag Scraper across the
 * personality-driven hashtag list, dedups + filters + inserts new
 * candidates as status='saved'.
 *
 * Cost: ~$5-15 depending on per_tag value (Apify usage-based).
 *
 * Usage:
 *   node scripts/discover-ig-creators.mjs                  # 25 posts/tag, max 200 inserts
 *   node scripts/discover-ig-creators.mjs --per-tag 50     # deeper scrape
 *   node scripts/discover-ig-creators.mjs --dry             # dry run, no DB writes
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  })
} catch (e) {
  console.error('Could not read .env.local:', e.message)
  process.exit(1)
}

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!APIFY_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing APIFY_TOKEN / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const HASHTAG_ACTOR = 'apify~instagram-hashtag-scraper'

// Mirror of TARGET_HASHTAGS in src/app/api/crons/ig-creator-discovery/route.ts.
// Keep both in sync when adding/removing tags.
const TARGET_HASHTAGS = [
  'hvactiktok', 'plumbertiktok', 'electriciantiktok', 'tradestiktok',
  'hvactok', 'plumbertok', 'electriciantok',
  'tradesguy', 'tradesbro', 'tradeschick', 'youngtrades',
  'apprenticelife', 'hvacapprentice', 'plumberapprentice', 'electricianapprentice',
  'dayinthelifeofatradesman', 'dayinthelifehvac',
  'hvachustle', 'plumberhustle', 'tradeslife',
  'tradesmanlife', 'youngcontractor', 'youngplumber', 'youngelectrician',
  'selfemployedlife', 'smallbusinesslife', 'ownerop',
  'hvactech', 'hvaclife', 'plumberlife', 'electricianlife',
  'roofingcontractor', 'rooferlife', 'handymanlife',
  // Regional expansion
  'texashvac', 'dallashvac', 'houstonhvac', 'austinhvac', 'phoenixhvac',
  'chicagohvac', 'chicagoplumber', 'chicagoelectrician',
  'floridahvac', 'orlandohvac', 'tampahvac', 'miamiplumber',
  'atlantahvac', 'atlantaplumber', 'georgiacontractor',
  'lasvegashvac', 'denverhvac', 'coloradoplumber',
  // Niche/lifestyle
  'tradeschoolgrad', 'firstgenbusiness', 'familybusinessowner',
  'bluecollarmillionaire', 'bluecollarbusiness', 'bluecollarboss',
  'truckandtrade',
]

const TRADE_KEYWORDS = {
  hvac:       ['hvac', 'air condition', 'heating', 'cooling', 'furnace', 'heat pump'],
  plumbing:   ['plumber', 'plumbing', 'water heater', 'pipe'],
  electrical: ['electrician', 'electrical', 'wiring', 'panel'],
  roofing:    ['roof', 'shingle'],
  handyman:   ['handyman', 'general contractor', 'repair'],
}

function deriveTrade(text) {
  const t = (text || '').toLowerCase()
  for (const [trade, kw] of Object.entries(TRADE_KEYWORDS)) {
    if (kw.some((k) => t.includes(k))) return trade
  }
  return null
}

function argInt(flag, def) {
  const i = process.argv.indexOf(flag)
  if (i < 0) return def
  const v = parseInt(process.argv[i + 1], 10)
  return isFinite(v) ? v : def
}

async function run() {
  const perTag = argInt('--per-tag', 25)
  const limit = argInt('--limit', 200)
  const dry = process.argv.includes('--dry')

  console.log(`Hashtag scrape: ${TARGET_HASHTAGS.length} tags × ${perTag} posts/tag → up to ${limit} new inserts${dry ? ' (DRY RUN)' : ''}`)

  const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(HASHTAG_ACTOR)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=270`
  const t0 = Date.now()
  let posts = []
  try {
    const r = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashtags: TARGET_HASHTAGS, resultsLimit: perTag, addParentData: false }),
    })
    if (!r.ok) { console.error(`Apify ${r.status}:`, (await r.text()).slice(0, 300)); process.exit(1) }
    posts = await r.json()
  } catch (e) {
    console.error('Apify err:', e.message); process.exit(1)
  }
  console.log(`  → Apify returned ${posts.length} posts in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  // Dedup by owner handle
  const ownerSamples = new Map()
  for (const p of posts) {
    const h = (p.ownerUsername || '').toLowerCase().replace(/^@/, '').trim()
    if (!h || h.length < 2) continue
    const cur = ownerSamples.get(h) || { handle: h, captions: [], latestTs: '' }
    if (p.caption) cur.captions.push(p.caption.slice(0, 200))
    if (p.timestamp && p.timestamp > cur.latestTs) cur.latestTs = p.timestamp
    ownerSamples.set(h, cur)
  }
  const handles = [...ownerSamples.keys()]
  console.log(`  → ${handles.length} unique owner handles`)

  // Skip existing
  const { data: existing } = await supabase
    .from('ig_creator_outreach')
    .select('handle')
    .in('handle', handles)
  const existingSet = new Set((existing || []).map((r) => (r.handle || '').toLowerCase()))
  const newHandles = handles.filter((h) => !existingSet.has(h))
  console.log(`  → ${newHandles.length} new (not already tracked)`)

  // Derive trade
  const candidates = newHandles.map((h) => {
    const s = ownerSamples.get(h)
    const trade = deriveTrade((s.captions || []).join(' '))
    return { handle: h, trade, captions: s.captions, latest_post: s.latestTs }
  }).filter((c) => c.trade)
  console.log(`  → ${candidates.length} trade-matched`)

  const toInsert = candidates.slice(0, limit)
  if (dry) {
    console.log(`\nDRY RUN — would insert ${toInsert.length}:`)
    for (const c of toInsert.slice(0, 20)) console.log(`  @${c.handle} (${c.trade}) "${(c.captions[0] || '').slice(0, 80)}"`)
    return
  }

  let inserted = 0, dupes = 0, errors = 0
  for (const c of toInsert) {
    const free_trial_code = `BAVG-${c.handle.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')}`
    const { error } = await supabase.from('ig_creator_outreach').insert({
      handle: c.handle,
      trade: c.trade,
      hashtag_source: `auto-discovery-v2 (${TARGET_HASHTAGS.length} tags)`,
      status: 'saved',
      free_trial_code,
      notes: `Auto-discovered 2026-06-07 pivot. Sample caption: "${(c.captions[0] || '').slice(0, 120)}"`,
      updated_at: new Date().toISOString(),
    })
    if (!error) inserted++
    else if (error.code === '23505') dupes++
    else { errors++; console.warn(`  ✗ ${c.handle}: ${error.message}`) }
  }

  console.log(`\n✓ Done`)
  console.log(`  inserted:  ${inserted}`)
  console.log(`  dupes:     ${dupes}`)
  console.log(`  errors:    ${errors}`)
}

run().catch((e) => { console.error(e); process.exit(1) })
