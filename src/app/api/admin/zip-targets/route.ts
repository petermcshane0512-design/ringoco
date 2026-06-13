import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/zip-targets — today's prospecting orders.
 *
 * Returns the ranked zip list daily-zip-intelligence wrote this morning.
 * The full list (top 50 by default) so Peter can scan beyond the SMS
 * preview (top 3) and dig into where the 14 enforcement agents are
 * pointing us.
 *
 * Query:
 *   ?date=2026-06-13   override the run date (default = today)
 *   ?limit=50          how many to return
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10)))

  const { data, error } = await supabase
    .from('daily_zip_targets')
    .select('*')
    .eq('run_date', date)
    .order('rank', { ascending: true })
    .limit(limit)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    run_date: date,
    count: (data || []).length,
    targets: data || [],
  })
}
