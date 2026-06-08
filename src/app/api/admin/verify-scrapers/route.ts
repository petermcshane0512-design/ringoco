import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/admin/verify-scrapers
 *
 * Browser-friendly one-shot sanity check. Hits all 4 non-Chicago city
 * scrapers with a tiny limit and returns each one's records_seen and
 * candidates_kept counts. If any return 0/0, the upstream dataset has
 * rotated and the city falls through to census-aging via discover-for-tenant.
 *
 * Run after deploy to confirm the scrapers are alive without waiting for
 * the nightly cron to surface a silent failure.
 */

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

const SCRAPERS = [
  { city: 'phoenix', route: '/api/crons/scrape-permits-phoenix' },
  { city: 'dallas',  route: '/api/crons/scrape-permits-dallas'  },
  { city: 'orlando', route: '/api/crons/scrape-permits-orlando' },
  { city: 'austin',  route: '/api/crons/scrape-permits-austin'  },
]

type ScraperResult = {
  ok: boolean
  city: string
  records_seen?: number
  candidates_kept?: number
  inserted_or_dedup?: number
  error?: string
  http_status?: number
  ms?: number
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10)

  const results = await Promise.all(SCRAPERS.map(async (s): Promise<ScraperResult> => {
    const start = Date.now()
    try {
      const r = await fetch(`${APP_URL}${s.route}?limit=${limit}&days=14`, {
        headers: { 'x-admin-secret': process.env.ADMIN_API_SECRET || '' },
      })
      const ms = Date.now() - start
      let json: { records_seen?: number; candidates_kept?: number; inserted_or_dedup?: number; error?: string } = {}
      try { json = await r.json() } catch { /* non-json */ }
      return {
        ok: r.ok,
        city: s.city,
        http_status: r.status,
        records_seen: json.records_seen,
        candidates_kept: json.candidates_kept,
        inserted_or_dedup: json.inserted_or_dedup,
        error: json.error,
        ms,
      }
    } catch (e) {
      return { ok: false, city: s.city, error: (e as Error).message, ms: Date.now() - start }
    }
  }))

  const summary = {
    healthy: results.filter((r) => r.ok && (r.candidates_kept ?? 0) > 0).map((r) => r.city),
    empty:   results.filter((r) => r.ok && (r.candidates_kept ?? 0) === 0).map((r) => r.city),
    broken:  results.filter((r) => !r.ok).map((r) => r.city),
  }

  return NextResponse.json({
    ok: summary.broken.length === 0,
    summary,
    results,
    checked_at: new Date().toISOString(),
  })
}
