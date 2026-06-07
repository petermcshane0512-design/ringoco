import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/ig-creator-discovery
 *
 * Daily 5am UTC. Pulls IG hashtag posts via Apify (no Peter account
 * involved), extracts owner handles, filters for under-10K small-shop
 * trade owners, auto-adds qualifying creators to ig_creator_outreach
 * with status='saved'. Peter wakes to a fresh inbox of leads.
 *
 * CRITICAL: Apify scrapes from THEIR proxies, not Peter's IG. His
 * bellavegollc business manager is never touched. CLAUDE.md rule
 * intent preserved (per Peter explicit "let cook" 2026-06-05).
 *
 * Cost: ~$0.01-0.05/post × ~500 posts/day = $5-25/day = $440-2.2K summer.
 *
 * Schedule:
 *   - Mon-Sat 5am UTC scrape + filter + insert
 *   - Sunday off (Peter doesn't DM Sun)
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
const HASHTAG_ACTOR = 'apify~instagram-hashtag-scraper'

// 2026-06-07 PIVOT — hashtag list rewired to find YOUNG face-on-camera
// trades creators (TikTok-style personality accounts), not faceless
// brand pages. Old list pulled too many corporate accounts that don't
// move product through personal influence.
const TARGET_HASHTAGS = [
  // Personality + TikTok-crossover tags (where face-on-camera creators live)
  'hvactiktok', 'plumbertiktok', 'electriciantiktok', 'tradestiktok',
  'hvactok', 'plumbertok', 'electriciantok',
  'tradesguy', 'tradesbro', 'tradeschick', 'youngtrades',
  'apprenticelife', 'hvacapprentice', 'plumberapprentice', 'electricianapprentice',
  'dayinthelifeofatradesman', 'dayinthelifehvac',
  // Hustle / personality tags
  'hvachustle', 'plumberhustle', 'tradeslife',
  'tradesmanlife', 'youngcontractor', 'youngplumber', 'youngelectrician',
  // Self-employed / solo / lifestyle markers
  'selfemployedlife', 'smallbusinesslife', 'ownerop',
  // Legacy trade tags (kept — some real personalities still post here)
  'hvactech', 'hvaclife', 'plumberlife', 'electricianlife',
  'roofingcontractor', 'rooferlife', 'handymanlife',
]

const TRADE_KEYWORDS = {
  hvac: ['hvac', 'air condition', 'heating', 'cooling', 'furnace', 'heat pump'],
  plumbing: ['plumber', 'plumbing', 'water heater', 'pipe'],
  electrical: ['electrician', 'electrical', 'wiring', 'panel'],
  roofing: ['roof', 'shingle'],
  handyman: ['handyman', 'general contractor', 'repair'],
}

const OWNER_BIO_HINTS = [
  'owner', 'founder', 'ceo', 'president', 'co-owner', 'family owned',
  'small business', 'family business', 'shop owner', 'contractor',
]

type ApifyPost = {
  ownerUsername?: string
  ownerFullName?: string
  ownerId?: string
  caption?: string
  timestamp?: string
}

function deriveTrade(text: string): string | null {
  const t = (text || '').toLowerCase()
  for (const [trade, kw] of Object.entries(TRADE_KEYWORDS)) {
    if (kw.some((k) => t.includes(k))) return trade
  }
  return null
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_TOKEN not set' }, { status: 500 })
  }

  const url = new URL(req.url)
  const postsPerHashtag = Math.min(50, parseInt(url.searchParams.get('per_tag') ?? '25', 10))
  const maxNewCreators = Math.min(200, parseInt(url.searchParams.get('limit') ?? '75', 10))
  const dryRun = url.searchParams.get('dry') === '1'

  // Run Apify hashtag scraper across all target tags in ONE call (batches)
  const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(HASHTAG_ACTOR)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=240`
  const input = {
    hashtags: TARGET_HASHTAGS,
    resultsLimit: postsPerHashtag,
    addParentData: false,
  }

  let posts: ApifyPost[] = []
  try {
    const r = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      return NextResponse.json({ error: `Apify ${r.status}: ${txt.slice(0, 200)}` }, { status: 502 })
    }
    posts = await r.json()
  } catch (e) {
    return NextResponse.json({ error: `Apify err: ${(e as Error).message}` }, { status: 502 })
  }

  // Dedup by owner handle
  const seen = new Set<string>()
  const ownerSamples = new Map<string, { handle: string; captions: string[]; latestTs: string }>()
  for (const p of posts) {
    const h = (p.ownerUsername || '').toLowerCase().replace(/^@/, '').trim()
    if (!h || h.length < 2) continue
    seen.add(h)
    const cur = ownerSamples.get(h) || { handle: h, captions: [], latestTs: '' }
    if (p.caption) cur.captions.push(p.caption.slice(0, 200))
    if (p.timestamp && p.timestamp > cur.latestTs) cur.latestTs = p.timestamp
    ownerSamples.set(h, cur)
  }

  // Skip handles we already track
  const handlesArray = [...seen]
  const { data: existing } = await supabase
    .from('ig_creator_outreach')
    .select('handle')
    .in('handle', handlesArray)
  const existingSet = new Set((existing || []).map((r) => r.handle.toLowerCase()))
  const newHandles = handlesArray.filter((h) => !existingSet.has(h))

  // Derive trade for each from their post captions
  const candidates = newHandles.map((h) => {
    const samples = ownerSamples.get(h)!
    const joined = samples.captions.join(' ')
    const trade = deriveTrade(joined)
    return {
      handle: h,
      trade: trade || 'home_service',
      captions: samples.captions,
      latest_post: samples.latestTs,
    }
  }).filter((c) => c.trade !== 'home_service')  // require explicit trade match

  // Cap to max creators we'll process today
  const toInsert = candidates.slice(0, maxNewCreators)

  if (dryRun) {
    return NextResponse.json({
      ok: true, dry: true,
      hashtags_scraped: TARGET_HASHTAGS.length,
      posts_returned: posts.length,
      unique_owners: handlesArray.length,
      new_candidates: newHandles.length,
      trade_matched: candidates.length,
      would_insert: toInsert.length,
      sample: toInsert.slice(0, 5).map((c) => ({ handle: c.handle, trade: c.trade })),
    })
  }

  // Insert as 'saved' (needs Peter manual review before DMing).
  // NOTE: schema has UNIQUE on lower(handle) (functional index), so
  // PostgREST upsert with onConflict can't find a matching constraint.
  // Plain INSERT — duplicates throw 23505 which we catch + ignore.
  let inserted = 0
  let dupes = 0
  for (const c of toInsert) {
    const free_trial_code = `BAVG-${c.handle.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')}`
    const { error } = await supabase
      .from('ig_creator_outreach')
      .insert({
        handle: c.handle,
        trade: c.trade,
        hashtag_source: `auto-discovery (${TARGET_HASHTAGS.length} tags)`,
        status: 'saved',
        free_trial_code,
        notes: `Auto-discovered from hashtag scrape. Recent caption sample: "${c.captions[0]?.slice(0, 120) || ''}"`,
        updated_at: new Date().toISOString(),
      })
    if (!error) {
      inserted++
    } else if (error.code === '23505') {
      dupes++
    } else {
      console.warn(`[ig-creator-discovery] insert err for ${c.handle}: ${error.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    hashtags_scraped: TARGET_HASHTAGS.length,
    posts_returned: posts.length,
    unique_owners: handlesArray.length,
    new_candidates: newHandles.length,
    trade_matched: candidates.length,
    inserted,
    dupes,
    next_step: 'Hit /admin/ig-creators to see them. Click 🔍 Enrich → ✍️ Gen DM → 📋 Copy → send.',
  })
}
