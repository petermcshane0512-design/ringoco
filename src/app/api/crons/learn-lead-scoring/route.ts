import { NextRequest, NextResponse } from 'next/server'
import { runLearningCycle } from '@/lib/leadScoring/learnFromConverted'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * GET /api/crons/learn-lead-scoring
 *
 * Nightly self-learning. Pulls recent outcomes (paid, trial, bounced),
 * snapshots their signals, regenerates the scoring system prompt if the
 * corpus crossed the learning threshold.
 *
 * Should fire AFTER score-prospects, so we don't pick up outcomes that
 * haven't been used to score yet.
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

  try {
    const result = await runLearningCycle()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
