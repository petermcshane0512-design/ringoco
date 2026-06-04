import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/hot-prospects
 *
 * Returns outreach_leads who CLICKED their personalized report from a
 * cold email. Ordered by last_opened_at DESC. This is Peter's dial list
 * — prospects who consumed the report are 10-20x more likely to convert
 * than blind dials.
 *
 * Query params:
 *   - days: how far back to look (default 14)
 *   - includeContacted: if 'true', also returns rows already dialed/SMS'd
 *   - limit: cap rows (default 200)
 *
 * Auth: admin only (Clerk session OR x-admin-secret header).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '14', 10)
  const includeContacted = url.searchParams.get('includeContacted') === 'true'
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '200', 10))

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('outreach_leads')
    .select(
      'id, email, business_name, owner_first_name, owner_phone, city, state, trade, ' +
      'first_opened_at, last_opened_at, open_count, report_visit_at, ' +
      'call_attempted_at, text_sent_at, demo_booked_at, paid_at, dnc_until, ' +
      'buyer_score, status',
    )
    .not('report_visit_at', 'is', null)
    .gte('last_opened_at', sinceIso)
    .order('last_opened_at', { ascending: false })
    .limit(limit)

  // Hide leads we've already dialed/SMS'd unless requested
  if (!includeContacted) {
    query = query.is('call_attempted_at', null).is('text_sent_at', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    count: data?.length ?? 0,
    since: sinceIso,
    prospects: data ?? [],
  })
}
