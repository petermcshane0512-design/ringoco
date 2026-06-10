import { NextRequest, NextResponse } from 'next/server'
import { addToWaitlist } from '@/lib/territory'

export const runtime = 'nodejs'

/**
 * POST /api/territory/waitlist
 * Body: { zip: '12345', trade: 'hvac', email: 'shop@x.com' }
 *
 * Public. Captures a contractor's email + desired (zip, trade) when
 * their requested territory is already claimed. Writes to the shared
 * opportunity_waitlist table with reason='claimed' so the same inbox
 * also holds the homepage widget's 'uncovered' captures.
 *
 * The release-grace cron notifies these contractors when the territory
 * opens (post-T3 TODO — the cron currently just flips the row).
 */
export async function POST(req: NextRequest) {
  let body: { zip?: string; trade?: string; email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  const zip = (body.zip || '').trim().slice(0, 5)
  const trade = (body.trade || '').trim().toLowerCase()
  const email = (body.email || '').trim().toLowerCase()
  if (!zip || !trade || !email) {
    return NextResponse.json({ ok: false, error: 'zip, trade, email required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 })
  }
  const result = await addToWaitlist({ zip, trade, email })
  return NextResponse.json(result)
}
