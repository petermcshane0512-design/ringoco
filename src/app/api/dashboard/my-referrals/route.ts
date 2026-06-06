import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

/**
 * GET /api/dashboard/my-referrals
 *
 * Returns the customer's referral code + stats:
 *   - referral_link (full URL with their BAVG-XXXXXX code)
 *   - paid_referrals_count (people who signed up + paid month 1)
 *   - earned_free_months_count (1 free month per paid referral)
 *
 * Customer-to-customer referral program — separate from /admin/ig-creators
 * (which tracks IG creator partnerships). This is for paying customers
 * referring their HVAC buddies.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code, business_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.referral_code) {
    return NextResponse.json({ error: 'no referral code on profile' }, { status: 404 })
  }

  // Count paid referrals — customers who used this code AND have paid
  // (creator_referral_credited_at stamped = first non-zero invoice fired).
  const { data: referred, count } = await supabase
    .from('profiles')
    .select('business_name, created_at, creator_referral_credited_at, plan_tier', { count: 'exact' })
    .eq('referred_by', profile.referral_code)

  const paidCount = (referred ?? []).filter((r) => r.creator_referral_credited_at).length
  const pendingCount = (referred ?? []).length - paidCount

  return NextResponse.json({
    ok: true,
    referral_code: profile.referral_code,
    referral_link: `https://www.bellavego.com/ref/${profile.referral_code}`,
    business_name: profile.business_name,
    total_referred: count ?? 0,
    paid_referrals_count: paidCount,
    pending_referrals_count: pendingCount,
    earned_free_months_count: paidCount, // 1 free month per paid referral
    referrals: (referred ?? []).map((r) => ({
      business_name: r.business_name,
      signed_up_at: r.created_at,
      paid: !!r.creator_referral_credited_at,
      tier: r.plan_tier,
    })),
  })
}
