import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/admin/leads
 *
 * Admin-only feed of recent customer calls across ALL tenants, used by
 * /admin/forward to surface real-time lead alerts on Peter's iPhone during
 * the A2P registration period (when automated SMS to contractors is
 * carrier-blocked). Returns the data needed to render an sms: deep link
 * that opens iMessage on iOS pre-filled with the contractor's phone +
 * a formatted lead message.
 */
export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const hoursBack = parseInt(url.searchParams.get('hours') || '48', 10)
  const sinceISO = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

  // Pull recent jobs joined with the contractor profile for each
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, user_id, customer_name, customer_phone, job_type, title, status, created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('admin/leads jobs fetch failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Batch-fetch the contractor profiles
  const userIds = Array.from(new Set((jobs ?? []).map((j) => j.user_id).filter(Boolean)))
  let profilesByUserId = new Map<string, { business_name: string | null; owner_first_name: string | null; owner_phone: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, business_name, owner_first_name, owner_phone')
      .in('user_id', userIds)
    profilesByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p as never]))
  }

  const leads = (jobs ?? []).map((j) => {
    const p = profilesByUserId.get(j.user_id) ?? null
    return {
      id: j.id,
      created_at: j.created_at,
      contractor: {
        business_name: p?.business_name ?? '(unknown business)',
        owner_first_name: p?.owner_first_name ?? 'the owner',
        owner_phone: p?.owner_phone ?? null,
      },
      caller: {
        name: j.customer_name,
        phone: j.customer_phone,
      },
      message: j.job_type,
      status: j.status,
    }
  })

  return NextResponse.json({ leads, sinceISO, count: leads.length })
}
