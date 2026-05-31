import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSignals } from '@/lib/leadScoring/fetchSignals'
import { scoreProspect } from '@/lib/leadScoring/scoreProspect'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/score-prospects
 *
 * Nightly batch — score every unscored queued lead. Uses Claude Haiku
 * 4.5 (~$0.001/lead). Writes buyer_score + score_reasoning + scored_at.
 *
 * Send pipeline filters by buyer_score >= 7. Low-score leads stay
 * queued but unsent (free to rescore later if scoring prompt improves).
 *
 * Auth: x-vercel-cron OR x-admin-secret.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isVercelCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const batchLimit = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const dryRun = url.searchParams.get('dry') === '1'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, business_name, trade, city, state, owner_phone, review_count:open_count, website_snippet')
    .eq('status', 'queued')
    .is('scored_at', null)
    .limit(batchLimit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, scored: 0, message: 'queue all scored' })
  }

  // Pull live review counts from the joined sample_reports if possible —
  // outreach_leads doesn't have its own column.
  const names = leads.map((l) => l.business_name).filter(Boolean) as string[]
  const { data: reports } = await supabase
    .from('sample_reports')
    .select('business_name, report')
    .in('business_name', names)
  const reviewsByName = new Map<string, { reviews: number; rating: number | null }>()
  for (const r of reports ?? []) {
    const reviews = r.report?.competitive?.yourReviewCount ?? 0
    const rating = r.report?.competitive?.yourRating ?? null
    reviewsByName.set((r.business_name || '').toLowerCase(), { reviews, rating })
  }

  let scored = 0
  let skipped = 0
  let highScore = 0
  let lowScore = 0
  const errors: { name: string; error: string }[] = []

  for (const l of leads) {
    try {
      const stats = reviewsByName.get((l.business_name || '').toLowerCase()) ?? { reviews: 0, rating: null }
      const signals = await buildSignals({
        business_name: l.business_name ?? '',
        trade_raw: l.trade ?? 'HVAC',
        city: l.city ?? null,
        state: l.state ?? null,
        review_count: stats.reviews,
        rating: stats.rating,
        website_url: null, // outreach_leads doesn't store website yet; future field
        cached_snippet: l.website_snippet,
      })
      const result = await scoreProspect(signals)

      if (dryRun) {
        scored++
        if (result.buyer_score >= 7) highScore++
        else lowScore++
        continue
      }

      await supabase
        .from('outreach_leads')
        .update({
          buyer_score: result.buyer_score,
          score_reasoning: result.reasoning,
          scored_at: new Date().toISOString(),
          score_version: result.score_version,
          trade_normalized: signals.trade,
          website_snippet: signals.website_snippet,
        })
        .eq('id', l.id)

      scored++
      if (result.buyer_score >= 7) highScore++
      else lowScore++
    } catch (e) {
      skipped++
      const msg = e instanceof Error ? e.message : String(e)
      if (errors.length < 5) errors.push({ name: l.business_name ?? '', error: msg.slice(0, 200) })
    }
  }

  return NextResponse.json({
    ok: true,
    dry: dryRun,
    scored,
    high_score_count: highScore,
    low_score_count: lowScore,
    skipped,
    errors,
  })
}
