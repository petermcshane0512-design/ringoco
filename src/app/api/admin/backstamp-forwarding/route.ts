import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Back-stamp forwarding_verified_at = NOW for every profile that has at
 * least one call_logs entry but no forwarding_verified_at. Closes the
 * legacy gap where successful calls never auto-stamped this column
 * (added in the same deploy as this endpoint). Idempotent: only updates
 * profiles where forwarding_verified_at IS NULL.
 *
 * Auth: requireAdmin().
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const userId = new URL(req.url).searchParams.get('user_id')

  // Find user_ids that have at least one call_log
  const { data: callLogUsers } = await supabase
    .from('call_logs')
    .select('user_id')
    .not('user_id', 'is', null)
  const userIdsWithCalls = new Set((callLogUsers || []).map((r) => r.user_id))

  // Pull profiles that need stamping
  let q = supabase
    .from('profiles')
    .select('user_id, business_name')
    .is('forwarding_verified_at', null)
  if (userId) q = q.eq('user_id', userId)
  const { data: profiles, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const stamped: Array<{ user_id: string; business_name: string | null }> = []
  for (const p of profiles ?? []) {
    if (!userIdsWithCalls.has(p.user_id)) continue
    await supabase
      .from('profiles')
      .update({ forwarding_verified_at: new Date().toISOString() })
      .eq('user_id', p.user_id)
    stamped.push({ user_id: p.user_id, business_name: p.business_name })
  }

  return NextResponse.json({
    scope: userId ? `single user_id=${userId}` : 'all profiles with calls but no forwarding_verified_at',
    total_candidates: profiles?.length || 0,
    stamped_count: stamped.length,
    stamped,
  })
}
