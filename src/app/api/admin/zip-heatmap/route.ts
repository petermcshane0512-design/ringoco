import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/zip-heatmap — the violation-density view (path-to-250).
 *
 * Surfaces the top zip codes by live enforcement-violation count from the
 * enforcement_zip_density view. Drives:
 *   1. /admin/master heatmap: shows Peter the metros where supply is real
 *   2. cohort-filter logic on refill-outreach-queue: targets contractors
 *      in zips that PROVE we can fulfill 10/wk supply
 *
 * Query params:
 *   ?limit=20      — top-N zips (default 50, max 500)
 *   ?min_30d=5     — drop zips with < N violations in the last 30 days
 *
 * Returns: { ok, zips: [{ zip, last_30d, last_7d, live_violations, trades_seen, most_recent_at }] }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))
  const min30d = Math.max(0, parseInt(url.searchParams.get('min_30d') ?? '0', 10))

  const { data, error } = await supabase
    .from('enforcement_zip_density')
    .select('*')
    .gte('last_30d', min30d)
    .limit(limit)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    count: (data || []).length,
    zips: data || [],
  })
}
