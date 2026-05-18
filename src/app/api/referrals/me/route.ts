import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getOrCreateReferralCode, getReferralStats, buildShareUrl } from '@/lib/referrals'

/**
 * GET /api/referrals/me
 *
 * Returns the current contractor's referral code, share URL, and stats.
 * Lazily generates the code if missing — first call creates it.
 *
 * Used by the dashboard referral widget.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = await getOrCreateReferralCode(userId)
  if (!code) {
    return NextResponse.json({ error: 'Could not generate referral code' }, { status: 500 })
  }

  const stats = await getReferralStats(userId)

  return NextResponse.json({
    code,
    shareUrl: buildShareUrl(code),
    pendingCount: stats.pendingCount,
    creditedCount: stats.creditedCount,
    count: stats.totalCount,
    totalCreditCents: stats.totalCreditCents,
    totalCreditDollars: Math.round(stats.totalCreditCents / 100),
  })
}
