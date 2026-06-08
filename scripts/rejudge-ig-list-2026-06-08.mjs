#!/usr/bin/env node
/**
 * 2026-06-08 re-judge: apply NEW rules (followers > 700 + ≥50% trade-topic captions)
 * to all already-enriched ig_creator_outreach rows. No Apify cost — uses cached
 * recent_posts_json + followers already in DB.
 *
 *   - Revives status='dropped' → 'saved' when row now qualifies
 *   - Drops status='saved' → 'dropped' when row no longer qualifies
 *   - Skips protected statuses (active_creator, dmed, replied_yes, paid_bonus_hit)
 *   - Unenriched rows untouched (run enrich-ig-creators.mjs to fill them)
 *
 * Usage:
 *   node scripts/rejudge-ig-list-2026-06-08.mjs
 *   node scripts/rejudge-ig-list-2026-06-08.mjs --dry
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
env.split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
})

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const MIN_FOLLOWERS = 801           // 2026-06-08 v2: >800 floor
const MAX_FOLLOWERS = 12700
const MIN_ENGAGEMENT_RATE = 2.0
const MIN_TOPIC_CAPTION_RATIO = 0.5
const PROTECTED = new Set(['active_creator', 'paid_bonus_hit', 'replied_yes', 'dmed'])

const TRADE_KEYWORDS = {
  hvac:       ['hvac', 'air condition', 'heating', 'cooling', 'furnace', 'heat pump', 'ac unit', 'mini split', 'condenser', 'r410', 'r32', 'refrigerant'],
  plumbing:   ['plumber', 'plumbing', 'water heater', 'pipe', 'drain', 'leak', 'sewer', 'faucet', 'pex', 'pvc'],
  electrical: ['electrician', 'electrical', 'wiring', 'panel', 'breaker', 'outlet', 'voltage', 'romex', 'conduit'],
  roofing:    ['roof', 'shingle', 'gutter', 'flashing', 'tpo', 'underlayment'],
  handyman:   ['handyman', 'general contractor', 'repair', 'remodel', 'renovation'],
}

const WORK_LIFE_PATTERNS = [
  /day in the life/i, /\bditl\b/i, /day in my life/i,
  /on the job/i, /jobsite/i, /job site/i, /on site/i,
  /install(ed|ing|ation)?/i, /service call/i, /tech life/i,
  /apprentice/i, /journeyman/i, /master tech/i,
  /work flow/i, /workflow/i, /\bcrew\b/i, /\btruck\b/i,
  /tool talk/i, /tool of the day/i, /tool review/i,
  /before.*after/i, /finished product/i, /clean install/i,
  /grind/i, /hustle/i, /the life/i,
]

const CORPORATE_PATTERNS = [
  /\bllc\b/i, /\binc\b/i, /\bcorp\b/i, /\bcorporation\b/i,
  /\bcompany\b/i, /\bservices? llc\b/i, /\bgroup\b/i,
]
const looksCorporate = (bio) => !!bio && CORPORATE_PATTERNS.some((re) => re.test(bio))

function topicCaptionRatio(trade, posts) {
  if (!posts || !posts.length) return 0
  const tradeKws = TRADE_KEYWORDS[trade] || []
  let hits = 0
  for (const p of posts) {
    const caption = p.caption || ''
    const lc = caption.toLowerCase()
    const tradeHit = tradeKws.some((k) => lc.includes(k))
    const lifeHit = WORK_LIFE_PATTERNS.some((re) => re.test(caption))
    if (tradeHit || lifeHit) hits++
  }
  return hits / posts.length
}

const dry = process.argv.includes('--dry')

async function run() {
  const { data: rows, error } = await s
    .from('ig_creator_outreach')
    .select('id, handle, trade, followers, bio, engagement_rate, recent_posts_json, status')
    .not('enriched_at', 'is', null)
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  console.log(`Re-judging ${rows.length} enriched rows under new rules (followers > 800, ≥50% day-in-life/work captions)…`)

  let revived = 0, newlyDropped = 0, stillSaved = 0, stillDropped = 0, protectedSkipped = 0, missingPosts = 0
  const sampleRevived = [], sampleDropped = []

  for (const r of rows) {
    if (PROTECTED.has(r.status)) { protectedSkipped++; continue }

    const posts = Array.isArray(r.recent_posts_json) ? r.recent_posts_json : []
    if (posts.length === 0) missingPosts++

    const inRange = r.followers != null && r.followers >= MIN_FOLLOWERS && r.followers <= MAX_FOLLOWERS
    const goodEng = r.engagement_rate != null && r.engagement_rate >= MIN_ENGAGEMENT_RATE
    const personality = !looksCorporate(r.bio)
    const topicRatio = topicCaptionRatio(r.trade, posts)
    const onTopic = topicRatio >= MIN_TOPIC_CAPTION_RATIO
    const qualifies = inRange && goodEng && personality && onTopic && posts.length > 0

    const targetStatus = qualifies ? 'saved' : 'dropped'

    if (r.status === targetStatus) {
      if (qualifies) stillSaved++; else stillDropped++
      continue
    }

    if (!dry) {
      const { error: upErr } = await s
        .from('ig_creator_outreach')
        .update({ status: targetStatus, updated_at: new Date().toISOString() })
        .eq('id', r.id)
      if (upErr) { console.warn(`✗ ${r.handle}: ${upErr.message}`); continue }
    }

    if (qualifies) {
      revived++
      if (sampleRevived.length < 10) sampleRevived.push(`@${r.handle} (${r.trade}, ${r.followers}f, ${topicRatio.toFixed(2)} topic-ratio)`)
    } else {
      newlyDropped++
      const reasons = []
      if (!inRange) reasons.push(`followers=${r.followers}`)
      if (!goodEng) reasons.push(`eng=${r.engagement_rate}`)
      if (!personality) reasons.push('corporate-bio')
      if (!onTopic) reasons.push(`topic-ratio=${topicRatio.toFixed(2)}`)
      if (posts.length === 0) reasons.push('no-posts')
      if (sampleDropped.length < 10) sampleDropped.push(`@${r.handle} (${reasons.join(', ')})`)
    }
  }

  console.log('\n=== Result ===')
  console.log(`  revived (dropped → saved):  ${revived}`)
  console.log(`  newly dropped (saved → dropped): ${newlyDropped}`)
  console.log(`  still saved:                ${stillSaved}`)
  console.log(`  still dropped:              ${stillDropped}`)
  console.log(`  protected (skipped):        ${protectedSkipped}`)
  console.log(`  unenriched posts (rows kept as-is by topic check): ${missingPosts}`)
  if (sampleRevived.length) console.log('\nSample revived:'); for (const x of sampleRevived) console.log(' +', x)
  if (sampleDropped.length) console.log('\nSample newly dropped:'); for (const x of sampleDropped) console.log(' -', x)
  if (dry) console.log('\n(DRY RUN — no DB writes)')
}

run().catch((e) => { console.error(e); process.exit(1) })
