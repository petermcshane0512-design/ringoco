import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildPostsForDay, generateSlotsForRestOfDay } from '@/lib/socialContentGenerator'

/**
 * Daily social content cron. Runs at 11:00 UTC = 6 AM CT every day.
 *
 * Pipeline:
 *   1. Read last 3 days of social_posts to pick fresh themes
 *   2. Generate N posts via Claude (one per POST_SLOTS_CT slot)
 *   3. Fetch all connected Zernio accounts (FB + IG today)
 *   4. POST each generated post to Zernio with scheduledFor at its slot
 *   5. Write each post to social_posts with status='queued' + Zernio response
 *
 * Auth: Vercel cron header + CRON_SECRET if set. Same pattern as other crons.
 *
 * Cost per day:
 *   - 5 Claude Haiku calls × ~$0.001 = ~$0.005
 *   - Zernio API calls: included in subscription
 *   - Total: trivial
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ZERNIO_BASE = 'https://zernio.com/api/v1'

function authedCron(req: Request): boolean {
  // Vercel cron triggers carry an internal header; also allow CRON_SECRET
  // for manual invocation. Permissive: we don't want to block ourselves.
  const userAgent = req.headers.get('user-agent') ?? ''
  if (userAgent.startsWith('vercel-cron')) return true
  const auth = req.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  // Allow x-admin-secret too so Peter can invoke from curl/dashboard.
  const adminSecret = req.headers.get('x-admin-secret') ?? ''
  if (process.env.ADMIN_API_SECRET && adminSecret === process.env.ADMIN_API_SECRET) return true
  return false
}

export async function GET(req: Request) {
  if (!authedCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.ZERNIO_API_KEY) {
    return NextResponse.json({ error: 'ZERNIO_API_KEY not set' }, { status: 500 })
  }

  // Query params for manual mid-day invocations:
  //   ?count=8     → generate N posts (defaults to 5)
  //   ?now=true    → distribute slots across the rest of today instead of
  //                  the standard 7AM-8PM CT schedule. Use when you want
  //                  to start posting immediately, not wait until tomorrow.
  const url = new URL(req.url)
  // Default 8/day per Peter's spec. Override via ?count= up to 12 max.
  const count = Math.min(parseInt(url.searchParams.get('count') ?? '8', 10), 12)
  const nowMode = url.searchParams.get('now') === 'true'

  // Today's date in America/Chicago (the timezone scheduledFor uses)
  const nowCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const dateYYYYMMDD = nowCT.toISOString().slice(0, 10)

  // Recent themes — last 3 days, so we don't repeat
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('social_posts')
    .select('theme')
    .gte('created_at', threeDaysAgo)
  const recentThemeIds = (recent ?? []).map((r) => r.theme as string)

  // Slot strategy: if invoked mid-day with ?now=true, spread slots across
  // remaining hours of today. Otherwise use the default morning schedule.
  const slots = nowMode
    ? generateSlotsForRestOfDay({ count, nowCT })
    : undefined

  // 1. Generate posts via Claude
  const posts = await buildPostsForDay({ dateYYYYMMDD, recentThemeIds, count, slots })
  if (posts.length === 0) {
    return NextResponse.json({ error: 'Claude generation returned 0 posts' }, { status: 500 })
  }

  // 2. Fetch Zernio accounts
  const accRes = await fetch(`${ZERNIO_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${process.env.ZERNIO_API_KEY}` },
  })
  if (!accRes.ok) {
    return NextResponse.json(
      { error: `Zernio accounts HTTP ${accRes.status}`, body: (await accRes.text()).slice(0, 300) },
      { status: 502 },
    )
  }
  const acctData = (await accRes.json()) as { accounts: Array<{ _id: string; platform: string; isActive: boolean }> }
  const activeAccounts = (acctData.accounts ?? []).filter((a) => a.isActive)
  if (activeAccounts.length === 0) {
    return NextResponse.json({ error: 'no active Zernio accounts' }, { status: 400 })
  }

  // Platforms that REQUIRE media (image/video). For posts where image
  // generation succeeded we send to ALL active accounts; if image-gen
  // failed for a specific post we filter out these platforms on the fly.
  const REQUIRES_MEDIA = new Set(['instagram', 'tiktok'])
  const allPlatforms = activeAccounts.map((a) => ({ platform: a.platform, accountId: a._id }))
  const textOnlyPlatforms = activeAccounts
    .filter((a) => !REQUIRES_MEDIA.has(a.platform.toLowerCase()))
    .map((a) => ({ platform: a.platform, accountId: a._id }))
  const accountIds = activeAccounts.map((a) => a._id).join(',')

  // 3. Queue each post via Zernio + log to Supabase
  const results: Array<{
    theme: string
    scheduledFor: string
    status: 'queued' | 'failed'
    error?: string
    zernioPostId?: string
  }> = []

  for (const p of posts) {
    try {
      // If this post has an image, target ALL accounts (FB + IG).
      // If image generation failed, fall back to text-only platforms only.
      const perPostPlatforms = p.imageUrl ? allPlatforms : textOnlyPlatforms
      const body: Record<string, unknown> = {
        content: p.caption,
        scheduledFor: p.scheduledFor,
        timezone: p.timezone,
        platforms: perPostPlatforms,
      }
      // Zernio expects `mediaItems` (array of {type, url}), NOT `mediaUrls`.
      if (p.imageUrl) {
        body.mediaItems = [{ type: 'image', url: p.imageUrl, title: `BellAveGo ${p.theme}` }]
      }
      const r = await fetch(`${ZERNIO_BASE}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.ZERNIO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const text = await r.text()
      let parsed: unknown = null
      try { parsed = JSON.parse(text) } catch {}

      if (!r.ok) {
        results.push({ theme: p.theme, scheduledFor: p.scheduledFor, status: 'failed', error: `Zernio HTTP ${r.status}: ${text.slice(0, 200)}` })
        await supabase.from('social_posts').insert({
          theme: p.theme,
          caption: p.caption,
          scheduled_for: `${p.scheduledFor}-05:00`, // CT offset
          account_ids: accountIds,
          zernio_response: { error: text.slice(0, 500), status: r.status },
          status: 'failed',
        })
        continue
      }

      const zernioPostId = (parsed as { _id?: string; id?: string } | null)?._id ?? (parsed as { id?: string } | null)?.id
      results.push({ theme: p.theme, scheduledFor: p.scheduledFor, status: 'queued', zernioPostId })
      await supabase.from('social_posts').insert({
        theme: p.theme,
        caption: p.caption,
        scheduled_for: `${p.scheduledFor}-05:00`,
        account_ids: accountIds,
        zernio_response: parsed as object,
        status: 'queued',
      })
    } catch (e) {
      const msg = (e as Error).message
      results.push({ theme: p.theme, scheduledFor: p.scheduledFor, status: 'failed', error: msg })
      await supabase.from('social_posts').insert({
        theme: p.theme,
        caption: p.caption,
        scheduled_for: `${p.scheduledFor}-05:00`,
        account_ids: accountIds,
        zernio_response: { error: msg },
        status: 'failed',
      })
    }
  }

  const queued = results.filter((r) => r.status === 'queued').length
  const failed = results.filter((r) => r.status === 'failed').length

  const postsWithImages = posts.filter((p) => p.imageUrl).length
  return NextResponse.json({
    date: dateYYYYMMDD,
    generated: posts.length,
    postsWithImages,
    postsTextOnly: posts.length - postsWithImages,
    queued,
    failed,
    accountsActive: activeAccounts.map((a) => `${a.platform}:${a._id.slice(-6)}`),
    results,
  })
}
