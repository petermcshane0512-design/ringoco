import { NextResponse } from 'next/server'
import { syncExistingNumbersToCampaign } from '@/lib/a2p'
import { requireAdmin } from '@/lib/auth/requireAdmin'

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
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const result = await syncExistingNumbersToCampaign()
  return NextResponse.json({ ok: true, ...result })
}
