import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/ig-creators/export?status=saved
 *
 * CSV download of creators (filtered by status). Open in Excel.
 * Daily morning workflow: GET this URL, open Excel, paste DMs into IG.
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
  const status = url.searchParams.get('status') || 'saved'
  const hasDmOnly = url.searchParams.get('with_dm') === '1'

  let q = supabase
    .from('ig_creator_outreach')
    .select('handle, followers, trade, hashtag_source, status, generated_dm, free_trial_code, bio, engagement_rate')
    .order('engagement_rate', { ascending: false, nullsFirst: false })
    .order('followers', { ascending: false, nullsFirst: false })
  if (status !== 'all') q = q.eq('status', status)
  if (hasDmOnly) q = q.not('generated_dm', 'is', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = 'handle,ig_url,followers,trade,hashtag_source,engagement_rate,status,referral_code,bio,personalized_dm'
  const esc = (v: unknown) => v == null ? '' : `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
  const csv = header + '\n' + (data ?? []).map((r) => [
    esc(r.handle),
    esc(`https://instagram.com/${r.handle}`),
    r.followers ?? '',
    esc(r.trade),
    esc(r.hashtag_source),
    r.engagement_rate ?? '',
    esc(r.status),
    esc(r.free_trial_code),
    esc(r.bio),
    esc(r.generated_dm),
  ].join(',')).join('\n')

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ig-creators-${status}-${today}.csv"`,
    },
  })
}
