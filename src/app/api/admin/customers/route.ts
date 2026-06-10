import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Admin-only: list every signed-up customer with their tier + activity.
// Used by /admin/customers (Peter's ops cockpit). Returns at most 500 rows.
const TIER_MRR: Record<string, number> = {
  // v7 active (May 12 2026)
  receptionist: 397,
  officemgr: 797,
  concierge: 1997,
  // v6 grandfathered (price IDs still resolve via PRICE_TO_TIER)
  receptionist_v6: 179,
  officemgr_v6: 497,
  concierge_v6: 997,
  // even older legacy
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
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const client = await clerkClient()

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(
      'user_id, business_name, business_type, plan_tier, is_active, setup_complete, twilio_number, owner_phone, created_at, welcomed_at, forwarding_confirmed_at, ' +
      'stripe_subscription_id, stripe_customer_id, owner_first_name, service_area, zip_code, ai_greeting_style, ai_voice_id, ' +
      'crm_provider, push_nudge_sent_at',
    )
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

  // Push device counts (one query, group in JS) — Peter wants to see who
  // has alerts enabled vs who's relying on email only.
  const { data: pushRows } = await supabase
    .from('push_subscriptions')
    .select('user_id')
  const pushByUser: Record<string, number> = {}
  for (const r of pushRows ?? []) {
    const uid = (r as { user_id?: string }).user_id
    if (uid) pushByUser[uid] = (pushByUser[uid] ?? 0) + 1
  }

  // Calendar connections (one query) — book-mode vs summarize-only
  const { data: calRows } = await supabase
    .from('calendar_connections')
    .select('user_id, provider, enabled')
    .eq('enabled', true)
  const calByUser: Record<string, string[]> = {}
  for (const r of calRows ?? []) {
    const uid = (r as { user_id?: string }).user_id
    const prov = (r as { provider?: string }).provider
    if (uid && prov) (calByUser[uid] ??= []).push(prov)
  }

  // Enrich with Clerk email AND Stripe subscription status / trial_end.
  // Stripe lookups parallelize but each adds ~150ms — fine for an admin
  // ops page that loads infrequently.
  const enrichments = await Promise.all(
    (profiles ?? []).map(async p => {
      const uid = (p as { user_id?: string }).user_id
      const subId = (p as { stripe_subscription_id?: string | null }).stripe_subscription_id

      const out: {
        email: string
        stripe_status: string | null
        trial_end_at: string | null
        current_period_end: string | null
        cancel_at_period_end: boolean
      } = {
        email: '',
        stripe_status: null,
        trial_end_at: null,
        current_period_end: null,
        cancel_at_period_end: false,
      }

      if (uid) {
        try {
          const u = await client.users.getUser(uid)
          out.email = u.emailAddresses?.[0]?.emailAddress ?? ''
        } catch {}
      }
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId)
          out.stripe_status = sub.status
          out.cancel_at_period_end = !!sub.cancel_at_period_end
          if (sub.trial_end) out.trial_end_at = new Date(sub.trial_end * 1000).toISOString()
          const cpe = (sub as unknown as { current_period_end?: number }).current_period_end
          if (cpe) out.current_period_end = new Date(cpe * 1000).toISOString()
        } catch {
          // sub deleted/expired — leave nulls so UI shows "no sub"
        }
      }
      return out
    }),
  )

  const now = Date.now()
  const customers = (profiles ?? []).map((p, i) => {
    const uid = (p as { user_id?: string }).user_id ?? ''
    const tier = (p as { plan_tier?: string }).plan_tier ?? 'starter'
    const callStats = callsByUser[uid] ?? { total: 0, booked: 0 }
    const enr = enrichments[i]

    let trial_days_remaining: number | null = null
    if (enr.stripe_status === 'trialing' && enr.trial_end_at) {
      const ms = new Date(enr.trial_end_at).getTime() - now
      trial_days_remaining = Math.max(0, Math.ceil(ms / 86_400_000))
    }

    return {
      user_id: uid,
      email: enr.email,
      business_name: (p as { business_name?: string }).business_name ?? '',
      business_type: (p as { business_type?: string }).business_type ?? '',
      owner_first_name: (p as { owner_first_name?: string }).owner_first_name ?? '',
      plan_tier: tier,
      is_active: !!(p as { is_active?: boolean }).is_active,
      setup_complete: !!(p as { setup_complete?: boolean }).setup_complete,
      twilio_number: (p as { twilio_number?: string }).twilio_number ?? '',
      owner_phone: (p as { owner_phone?: string }).owner_phone ?? '',
      service_area: (p as { service_area?: string }).service_area ?? '',
      zip_code: (p as { zip_code?: string }).zip_code ?? '',
      ai_greeting_style: (p as { ai_greeting_style?: string }).ai_greeting_style ?? 'friendly_intro',
      created_at: (p as { created_at?: string }).created_at ?? '',
      welcomed_at: (p as { welcomed_at?: string }).welcomed_at ?? '',
      forwarding_confirmed_at: (p as { forwarding_confirmed_at?: string }).forwarding_confirmed_at ?? '',
      stripe_status: enr.stripe_status,
      trial_end_at: enr.trial_end_at,
      trial_days_remaining,
      current_period_end: enr.current_period_end,
      cancel_at_period_end: enr.cancel_at_period_end,
      push_devices: pushByUser[uid] ?? 0,
      calendar_providers: calByUser[uid] ?? [],
      crm_provider: (p as { crm_provider?: string }).crm_provider ?? '',
      mrr: (p as { is_active?: boolean }).is_active && enr.stripe_status !== 'trialing'
        ? (TIER_MRR[tier] ?? 0)
        : 0,
      calls_mtd: callStats.total,
      bookings_mtd: callStats.booked,
      last_call_at: callStats.lastAt,
    }
  })

  const trialing = customers.filter(c => c.stripe_status === 'trialing').length
  const paying = customers.filter(c => c.stripe_status === 'active' && !c.cancel_at_period_end).length

  const totals = {
    count: customers.length,
    active: customers.filter(c => c.is_active).length,
    trialing,
    paying,
    mrr: customers.reduce((s, c) => s + c.mrr, 0),
    calls_mtd: customers.reduce((s, c) => s + c.calls_mtd, 0),
  }

  return NextResponse.json({ customers, totals })
}
