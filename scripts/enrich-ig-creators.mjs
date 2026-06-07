#!/usr/bin/env node
/**
 * Standalone bulk enrichment for ig_creator_outreach rows.
 *
 * Reads APIFY_TOKEN + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 * from .env.local, queries every row with enriched_at IS NULL, fires ONE
 * Apify Instagram Profile Scraper run for all of them, writes followers/
 * bio/recent_posts back, and flips rows outside the 800-12,700 follower
 * window to status='dropped' (preserving active partners).
 *
 * Cost: ~$0.05/profile via Apify. For 125 creators = ~$6.25.
 *
 * Usage: node scripts/enrich-ig-creators.mjs
 *        node scripts/enrich-ig-creators.mjs --all   (re-enriches even rows already done)
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
const ACTOR_ID = 'apify~instagram-profile-scraper'
const MIN_FOLLOWERS = 800
const MAX_FOLLOWERS = 12700
const MIN_ENGAGEMENT_RATE = 2.0     // % — below this = ghost account or bot-followed
const MIN_VIDEO_RATIO     = 0.35    // ≥35% recent posts must be Video/Reel (was 0.50 — too strict, killed mixed-content creators)
const PROTECTED_STATUSES = new Set(['active_creator', 'paid_bonus_hit', 'replied_yes', 'dmed'])

// Bio patterns that suggest faceless brand / corporate account.
const CORPORATE_PATTERNS = [
  /\bllc\b/i, /\binc\b/i, /\bcorp\b/i, /\bcorporation\b/i,
  /\bcompany\b/i, /\bservices? llc\b/i, /\bgroup\b/i,
  /^[^a-z]*[A-Z][a-z]+ (Heating|Cooling|HVAC|Plumbing|Electric|Roofing) /,  // "Acme Heating & Cooling"
]
function looksCorporate(bio) {
  if (!bio) return false
  return CORPORATE_PATTERNS.some((re) => re.test(bio))
}

async function run() {
  const all = process.argv.includes('--all')
  const reEvaluate = process.argv.includes('--reevaluate')
  console.log(`Enriching ${all ? 'ALL' : reEvaluate ? 'ALL saved/dropped (re-evaluating with new filters)' : 'unenriched'} ig_creator_outreach rows…`)

  let q = supabase
    .from('ig_creator_outreach')
    .select('id, handle, enriched_at, followers, status')
    .order('updated_at', { ascending: true })
    .limit(300)
  if (!all && !reEvaluate) q = q.is('enriched_at', null)
  if (reEvaluate) q = q.in('status', ['saved', 'dropped'])

  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) {
    console.log('Nothing to enrich. Done.')
    return
  }

  const handleToId = new Map()
  const usernames = []
  for (const r of rows) {
    const h = (r.handle || '').toLowerCase().trim()
    if (!h) continue
    handleToId.set(h, r.id)
    usernames.push(h)
  }
  console.log(`  → ${usernames.length} handles → Apify…`)

  const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=270`
  const t0 = Date.now()
  const r = await fetch(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames, resultsLimit: 8 }),
  })
  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    console.error(`Apify ${r.status}: ${txt.slice(0, 300)}`)
    process.exit(1)
  }
  const profiles = await r.json()
  console.log(`  → Apify returned ${profiles.length} profiles in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  let enriched = 0
  let inWindow = 0
  let dropped = 0

  for (const p of profiles) {
    const handle = (p.username || '').toLowerCase()
    const rowId = handleToId.get(handle)
    if (!rowId) continue
    const matched = rows.find((x) => x.id === rowId)

    const followers = p.followersCount ?? null
    const posts = p.latestPosts ?? []
    let engagementRate = null
    if (followers && followers > 0 && posts.length > 0) {
      const avgLikes = posts.reduce((s, x) => s + (x.likesCount ?? 0), 0) / posts.length
      engagementRate = +(avgLikes / followers * 100).toFixed(2)
    }
    const slimPosts = posts.slice(0, 8).map((x) => ({
      caption: (x.caption || '').slice(0, 280),
      likes: x.likesCount ?? 0,
      comments: x.commentsCount ?? 0,
      views: x.videoViewCount ?? null,
      type: x.type || null,
      ts: x.timestamp || null,
    }))

    // ── Face-on-camera + personality filters (2026-06-07 PIVOT) ──
    // Drop faceless brand accounts. Keep accounts that look like real
    // young creators putting their face on camera:
    //   1. follower count in window
    //   2. engagement rate ≥ 2% (not bot-followed)
    //   3. ≥50% recent posts are Video/Reel (face usually shows in video)
    //   4. bio doesn't read like corporate LLC/Inc
    const videoCount = posts.filter((x) => /video|reel/i.test(x.type || '')).length
    const videoRatio = posts.length > 0 ? videoCount / posts.length : 0
    const inRange = followers != null && followers >= MIN_FOLLOWERS && followers <= MAX_FOLLOWERS
    const goodEngagement = engagementRate != null && engagementRate >= MIN_ENGAGEMENT_RATE
    const faceForward = videoRatio >= MIN_VIDEO_RATIO
    const personality = !looksCorporate(p.biography)
    const qualifies = inRange && goodEngagement && faceForward && personality

    const update = {
      followers,
      bio: p.biography || null,
      recent_posts_json: slimPosts,
      engagement_rate: engagementRate,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const isProtected = matched && PROTECTED_STATUSES.has(matched.status)
    if (!qualifies && !isProtected) {
      update.status = 'dropped'
      dropped++
    } else if (qualifies) {
      inWindow++
    }

    const { error: updErr } = await supabase
      .from('ig_creator_outreach')
      .update(update)
      .eq('id', rowId)
    if (updErr) console.warn(`  ✗ ${handle}: ${updErr.message}`)
    else enriched++
  }

  console.log(`\n✓ Done`)
  console.log(`  requested:           ${usernames.length}`)
  console.log(`  apify returned:      ${profiles.length}`)
  console.log(`  enriched:            ${enriched}`)
  console.log(`  in window (qualify): ${inWindow}`)
  console.log(`  dropped (out range): ${dropped}`)
  console.log(`  not found / private: ${usernames.length - profiles.length}`)
  console.log(`  window: ${MIN_FOLLOWERS}-${MAX_FOLLOWERS} followers`)
}

run().catch((e) => { console.error(e); process.exit(1) })
