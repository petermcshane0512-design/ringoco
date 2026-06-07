import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/admin/ig-creators/bulk-enrich
 *
 * One-shot Apify Profile Scraper run that hits ALL un-enriched IG creator
 * rows in a single batch. Way cheaper than 125 individual calls (Apify
 * billing is per actor-run, not per profile).
 *
 * Body (all optional):
 *   { only_missing?: boolean = true,   // skip already-enriched rows
 *     min_followers?: number = 800,    // optional follower floor after fetch
 *     max_followers?: number = 12700,  // optional ceiling
 *     limit?: number = 200 }           // safety cap on rows per run
 *
 * Updates ig_creator_outreach with:
 *   followers, bio, recent_posts_json, engagement_rate, enriched_at
 *
 * Optionally flips rows that fall OUTSIDE the follower window to
 * status='dropped' so they stop polluting the reach-out list. Inside the
 * window stays at 'saved'.
 *
 * Cost: ~$0.05 per profile via Apify (one actor run, batched). For 125
 * un-enriched creators = ~$6.25 total.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN
const ACTOR_ID = 'apify~instagram-profile-scraper'

type ApifyPost = {
  caption?: string
  likesCount?: number
  commentsCount?: number
  videoViewCount?: number
  timestamp?: string
  type?: string
}

type ApifyProfile = {
  username?: string
  fullName?: string
  biography?: string
  followersCount?: number
  followsCount?: number
  postsCount?: number
  latestPosts?: ApifyPost[]
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    if (!APIFY_TOKEN) {
      return NextResponse.json({ error: 'APIFY_TOKEN env not set' }, { status: 500 })
    }

    let body: { only_missing?: boolean; min_followers?: number; max_followers?: number; limit?: number } = {}
    try { body = await req.json() } catch { /* optional */ }
    const onlyMissing = body.only_missing !== false
    const minFollowers = body.min_followers ?? 800
    const maxFollowers = body.max_followers ?? 12700
    const limit = Math.min(500, body.limit ?? 200)

    // Pull rows that need enrichment.
    let q = supabase
      .from('ig_creator_outreach')
      .select('id, handle, enriched_at, followers, status')
      .order('updated_at', { ascending: true })
      .limit(limit)
    if (onlyMissing) q = q.is('enriched_at', null)
    const { data: rows, error: fetchErr } = await q
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    type Row = { id: string; handle: string; enriched_at: string | null; followers: number | null; status: string }
    const candidates = (rows ?? []) as Row[]
    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, message: 'nothing to enrich', enriched: 0 })
    }

    const handleToId = new Map<string, string>()
    const usernames: string[] = []
    for (const r of candidates) {
      const h = (r.handle || '').toLowerCase().trim()
      if (!h) continue
      handleToId.set(h, r.id)
      usernames.push(h)
    }

    // Single Apify actor run for ALL usernames at once. The actor accepts
    // up to ~200 usernames per call comfortably; we keep our limit at 200.
    const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=270`
    const input = {
      usernames,
      resultsLimit: 8,
    }

    let profiles: ApifyProfile[] = []
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
      profiles = await r.json()
    } catch (e) {
      return NextResponse.json({ error: `Apify err: ${(e as Error).message}` }, { status: 502 })
    }

    let enriched = 0
    let inRange = 0
    let dropped = 0
    let notFound = 0

    for (const p of profiles) {
      const handle = (p.username || '').toLowerCase()
      const rowId = handleToId.get(handle)
      if (!rowId) { continue }

      const followers = p.followersCount ?? null
      const posts = p.latestPosts ?? []
      let engagementRate: number | null = null
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

      // Filter: drop if outside window. Active partners stay regardless.
      const inWindow = followers != null && followers >= minFollowers && followers <= maxFollowers
      const update: Record<string, unknown> = {
        followers,
        bio: p.biography || null,
        recent_posts_json: slimPosts,
        engagement_rate: engagementRate,
        enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const matched = candidates.find((c) => c.id === rowId)
      const protectedStatus = matched && ['active_creator', 'paid_bonus_hit', 'replied_yes', 'dmed'].includes(matched.status)
      if (!inWindow && !protectedStatus) {
        update.status = 'dropped'
        dropped++
      } else if (inWindow) {
        inRange++
      }

      const { error: updErr } = await supabase
        .from('ig_creator_outreach')
        .update(update)
        .eq('id', rowId)
      if (!updErr) enriched++
    }

    // Profiles in our request that Apify didn't return = dead/private handles.
    notFound = usernames.length - profiles.length

    return NextResponse.json({
      ok: true,
      requested: usernames.length,
      apify_profiles_returned: profiles.length,
      enriched,
      in_window: inRange,
      dropped_out_of_window: dropped,
      not_found_or_private: notFound,
      window: { min: minFollowers, max: maxFollowers },
    })
  } catch (e) {
    const err = e as { message?: string; stack?: string }
    return NextResponse.json({
      error: 'unhandled exception',
      detail: err.message || String(e),
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    }, { status: 500 })
  }
}
