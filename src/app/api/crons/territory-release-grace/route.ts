import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { reopenExpiredGrace } from '@/lib/territory'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/crons/territory-release-grace
 *
 * Daily. Flips territories whose grace window has expired (status='grace'
 * AND released_at < NOW()) back to 'open'. Should also notify waitlisted
 * contractors but that hook is TODO — kept the cron lean for the T3 MVP.
 *
 * Schedule in vercel.json. Admin-gated like other crons.
 *
 * TODO(post-T3): on each flipped territory, look up territory_waitlist
 * rows for that (zip, trade) and email each waitlisted contractor that
 * their area opened up. Stamp notified_at to dedup.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const flipped = await reopenExpiredGrace()
  return NextResponse.json({ ok: true, flipped })
}
