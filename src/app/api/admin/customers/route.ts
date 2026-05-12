import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ADMIN_EMAILS = ['pmcshane@fordham.edu', 'peter@bellavego.com']

// Admin-only: list every signed-up customer with their tier + activity.
// Used by /admin/customers (Peter's ops cockpit). Returns at most 500 rows.
const TIER_MRR: Record<string, number> = {
  receptionist: 179,
  officemgr: 497,
  concierge: 997,
  // legacy
  starter: 49,
  growth: 89,
  scale: 149,
  foundation: 79,
  premium: 499,
  solo: 147,
  multiloc: 0,
  cancelled: 0,
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const client = await clerkClient()
  const me = await client.users.getUser(userId).catch(() => null)
  const myEmail = me?.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? ''
  if (!ADMIN_EMAILS.includes(myEmail)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, plan_tier, is_active, setup_complete, twilio_number, owner_phone, created_at, welcomed_at, forwarding_confirmed_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calls this month for each (one query, group in JS)
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  firstOfMonth.setHours(0, 0, 0, 0)

  const { data: callRows } = await supabase
    .from('call_logs')
    .select('user_id, created_at, booking_completed')
    .gte('created_at', firstOfMonth.toISOString())

  const callsByUser: Record<string, { total: number; booked: number; lastAt?: string }> = {}
  for (const row of callRows ?? []) {
    const uid = (row as { user_id?: string }).user_id
    if (!uid) continue
    const r = callsByUser[uid] ??= { total: 0, booked: 0 }
    r.total += 1
    if ((row as { booking_completed?: boolean }).booking_completed) r.booked += 1
    const at = (row as { created_at?: string }).created_at
    if (at && (!r.lastAt || at > r.lastAt)) r.lastAt = at
  }

  // Enrich with email from Clerk (best-effort, in parallel)
  const enrichments = await Promise.all(
    (profiles ?? []).map(async p => {
      const uid = (p as { user_id?: string }).user_id
      if (!uid) return { email: '' }
      try {
        const u = await client.users.getUser(uid)
        return { email: u.emailAddresses?.[0]?.emailAddress ?? '' }
      } catch {
        return { email: '' }
      }
    }),
  )

  const customers = (profiles ?? []).map((p, i) => {
    const uid = (p as { user_id?: string }).user_id ?? ''
    const tier = (p as { plan_tier?: string }).plan_tier ?? 'starter'
    const callStats = callsByUser[uid] ?? { total: 0, booked: 0 }
    return {
      user_id: uid,
      email: enrichments[i].email,
      business_name: (p as { business_name?: string }).business_name ?? '',
      plan_tier: tier,
      is_active: !!(p as { is_active?: boolean }).is_active,
      setup_complete: !!(p as { setup_complete?: boolean }).setup_complete,
      twilio_number: (p as { twilio_number?: string }).twilio_number ?? '',
      owner_phone: (p as { owner_phone?: string }).owner_phone ?? '',
      created_at: (p as { created_at?: string }).created_at ?? '',
      welcomed_at: (p as { welcomed_at?: string }).welcomed_at ?? '',
      forwarding_confirmed_at: (p as { forwarding_confirmed_at?: string }).forwarding_confirmed_at ?? '',
      mrr: (p as { is_active?: boolean }).is_active ? (TIER_MRR[tier] ?? 0) : 0,
      calls_mtd: callStats.total,
      bookings_mtd: callStats.booked,
      last_call_at: callStats.lastAt,
    }
  })

  const totals = {
    count: customers.length,
    active: customers.filter(c => c.is_active).length,
    mrr: customers.reduce((s, c) => s + c.mrr, 0),
    calls_mtd: customers.reduce((s, c) => s + c.calls_mtd, 0),
  }

  return NextResponse.json({ customers, totals })
}
