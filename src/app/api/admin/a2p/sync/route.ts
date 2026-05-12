import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { syncExistingNumbersToCampaign } from '@/lib/a2p'

const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com'])

/**
 * POST /api/admin/a2p/sync
 *
 * Walks every active customer's twilio_number and attaches it to the
 * BellAveGo Messaging Service (= the approved A2P 10DLC campaign).
 *
 * Idempotent. Safe to re-run.
 * Run after `bootstrap` once Twilio approves your campaign.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || ''
  if (!ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const result = await syncExistingNumbersToCampaign()
  return NextResponse.json({ ok: true, ...result })
}
