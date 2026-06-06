import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/admin/ig-creators/[id]/enrich
 *
 * Pulls IG profile data via Apify Instagram Profile Scraper actor
 * (apify/instagram-profile-scraper). Stores follower count, bio, recent
 * 12 posts (captions + view counts) on the creator row.
 *
 * Cost: ~$0.05/profile via Apify.
 *
 * CRITICAL: Apify runs the scrape on THEIR proxy infrastructure, NOT
 * on Peter's IG account. His accounts are never used → CLAUDE.md rule
 * spirit preserved (no risk of bellavegollc business manager ban).
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
  url?: string
  type?: string
}

type ApifyProfile = {
  username?: string
  fullName?: string
  biography?: string
  followersCount?: number
  followsCount?: number
  postsCount?: number
  isBusinessAccount?: boolean
  profilePicUrl?: string
  latestPosts?: ApifyPost[]
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { id } = await params

  if (!APIFY_TOKEN) {
    return NextResponse.json({ error: 'APIFY_TOKEN env not set' }, { status: 500 })
  }

  const { data: creator } = await supabase
    .from('ig_creator_outreach')
    .select('handle')
    .eq('id', id)
    .maybeSingle()
  if (!creator) return NextResponse.json({ error: 'creator not found' }, { status: 404 })

  // Run Apify actor synchronously (gets all results back in one call)
  const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(ACTOR_ID)}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90`
  const input = {
    usernames: [creator.handle],
    resultsLimit: 12,
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

  const profile = profiles[0]
  if (!profile) {
    return NextResponse.json({ error: 'no profile data returned' }, { status: 404 })
  }

  // Compute engagement rate from latest posts (avg likes ÷ followers)
  const posts = profile.latestPosts ?? []
  let engagementRate: number | null = null
  if (profile.followersCount && profile.followersCount > 0 && posts.length > 0) {
    const avgLikes = posts.reduce((s, p) => s + (p.likesCount ?? 0), 0) / posts.length
    engagementRate = +(avgLikes / profile.followersCount * 100).toFixed(2)
  }

  // Slim down posts to essential fields only
  const slimPosts = posts.slice(0, 8).map((p) => ({
    caption: (p.caption || '').slice(0, 280),
    likes: p.likesCount ?? 0,
    comments: p.commentsCount ?? 0,
    views: p.videoViewCount ?? null,
    type: p.type || null,
    ts: p.timestamp || null,
  }))

  const { data, error } = await supabase
    .from('ig_creator_outreach')
    .update({
      followers: profile.followersCount ?? null,
      bio: profile.biography || null,
      recent_posts_json: slimPosts,
      engagement_rate: engagementRate,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, creator: data })
}
