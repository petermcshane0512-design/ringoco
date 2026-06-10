import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * POST /api/admin/hot-leads/dial
 * Body: { biz_id: string }
 *
 * Stamps prospect_free_leads.hot_call_dialed_at so the row drops out
 * of /admin/hot-leads' "to-call" section. Idempotent.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const body = await req.json().catch(() => ({})) as { biz_id?: string }
  const bizId = (body.biz_id || '').slice(0, 64)
  if (!bizId) return NextResponse.json({ ok: false, error: 'biz_id required' }, { status: 400 })
  const { error } = await supabase
    .from('prospect_free_leads')
    .update({ hot_call_dialed_at: new Date().toISOString() })
    .eq('biz_id', bizId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
