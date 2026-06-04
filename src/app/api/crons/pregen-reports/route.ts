import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/pregen-reports
 *
 * Pre-warms /sample-report cached entries for the next batch of cold-email
 * recipients. Without this, the FIRST click on an Instantly link triggers
 * a live 20-40s generation (Claude + Places + Census) — prospect bounces.
 *
 * Strategy:
 *   1. Pull next N outreach_leads with status='in_instantly_queue' (about
 *      to be sent) OR status='sent' (sent today, might click any second)
 *      that don't yet have a cached row in sample_reports.
 *   2. For each, hit /api/sample-report/personalize internally so the
 *      cache row gets written and the next click is instant.
 *
 * Runs nightly 1am UTC (before Instantly daily send at 9am). Default
 * batch 200 — enough to cover one day's send at full warmup (580/day).
 *
 * Cost: ~$0.04/report × 200 = ~$8/night. Cheap vs the 20-40s bounce.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.bellavego.com'

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(800, parseInt(url.searchParams.get('limit') ?? '200', 10))
  const dryRun = url.searchParams.get('dry') === '1'

  // Pull leads about to be sent (in queue) or recently sent that we haven't
  // pre-generated for yet. We probe sample_reports cache by business_name +
  // zip (matches the personalize route cache key).
  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, email, business_name, city, trade')
    .in('status', ['in_instantly_queue', 'sent'])
    .not('business_name', 'is', null)
    .order('pushed_at', { ascending: false })
    .limit(limit * 2)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, message: 'no eligible leads' })
  }

  // Check which ones already have a cached report (skip those — already warm)
  const candidates: typeof leads = []
  for (const l of leads) {
    if (!l.business_name) continue
    const { data: hit } = await supabase
      .from('sample_reports')
      .select('id')
      .ilike('business_name', l.business_name)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!hit) candidates.push(l)
    if (candidates.length >= limit) break
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, message: 'all leads already cached', scanned: leads.length })
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry: true,
      would_generate: candidates.length,
      sample: candidates.slice(0, 5).map((c) => c.business_name),
    })
  }

  // Generate in parallel batches of 5 — Claude rate limits + Vercel
  // concurrency. Each report ~$0.04, ~25-40sec.
  const BATCH = 5
  let generated = 0
  let failed = 0
  const errors: Array<{ business: string; error: string }> = []

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (l) => {
        const personalizeUrl = `${BASE_URL}/api/sample-report/personalize`
        const r = await fetch(personalizeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName: l.business_name,
            businessType: l.trade || 'HVAC',
            city: l.city || '',
            leadEmail: l.email,
          }),
        })
        if (!r.ok) {
          const txt = await r.text().catch(() => '')
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 120)}`)
        }
        return l.business_name
      }),
    )
    for (let j = 0; j < results.length; j++) {
      const res = results[j]
      if (res.status === 'fulfilled') {
        generated++
      } else {
        failed++
        if (errors.length < 10) {
          errors.push({ business: batch[j].business_name || '?', error: String(res.reason).slice(0, 120) })
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    leads_scanned: leads.length,
    candidates_needed_pregen: candidates.length,
    generated,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  })
}
