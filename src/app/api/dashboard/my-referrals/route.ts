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

/**
 * Mint a unique BAVG-XXXXXX referral code. Excludes ambiguous chars
 * (0/O, 1/I) so a buddy reading it off a phone screen never gets the
 * wrong code. 6 chars × 32 alphabet = 1B combinations, retries on rare
 * unique-constraint collisions.
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
function mintCode(): string {
  let out = 'BAVG-'
  for (let i = 0; i < 6; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

async function ensureReferralCode(userId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintCode()
    const { error } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('user_id', userId)
      .is('referral_code', null)
    if (!error) {
      // Either it took (set the code) or it was already set by a race —
      // re-read to find out which.
      const { data } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('user_id', userId)
        .maybeSingle()
      if (data?.referral_code) return data.referral_code
    }
  }
  return null
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code, business_name')
    .eq('user_id', userId)
    .maybeSingle()

  // 2026-06-13 — auto-mint a referral_code for any logged-in user who
  // doesn't have one yet. Previously the route 404'd with "no referral
  // code on profile" — every customer hitting /dashboard/refer saw the
  // dead-end "Email peter@bellavego.com" screen because nothing in the
  // signup flow ever wrote a referral_code. Every customer SHOULD have
  // their own code so the referral flywheel actually spins.
  let referralCode = profile?.referral_code
  if (!referralCode) {
    referralCode = await ensureReferralCode(userId)
    if (!referralCode) {
      return NextResponse.json({ error: 'could not mint referral code' }, { status: 500 })
    }
  }

  // Count paid referrals — customers who used this code AND have paid
  // (creator_referral_credited_at stamped = first non-zero invoice fired).
  const { data: referred, count } = await supabase
    .from('profiles')
    .select('business_name, created_at, creator_referral_credited_at, plan_tier', { count: 'exact' })
    .eq('referred_by', referralCode)

  const paidCount = (referred ?? []).filter((r) => r.creator_referral_credited_at).length
  const pendingCount = (referred ?? []).length - paidCount

  return NextResponse.json({
    ok: true,
    referral_code: referralCode,
    referral_link: `https://www.bellavego.com/ref/${referralCode}`,
    business_name: profile?.business_name ?? null,
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
