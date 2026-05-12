import { NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { ensureMessagingService } from '@/lib/a2p'

const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com'])

/**
 * POST /api/admin/a2p/bootstrap
 *
 * One-time admin action: creates the BellAveGo Messaging Service (the container
 * for all customer numbers under the approved 10DLC campaign).
 *
 * After this returns a SID, paste it into Vercel env as TWILIO_MESSAGING_SERVICE_SID
 * and redeploy. Then provisioned numbers will auto-attach.
 *
 * Prereq: you must already have completed in Twilio Console:
 *   1. Customer Profile (Trust Hub)
 *   2. Brand Registration ($4 one-time)
 *   3. Standard A2P Campaign ($10 vetting + $1.50/mo)
 * and linked them. Twilio takes 1–3 days to approve the campaign.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() || ''
  if (!ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
  }

  const result = await ensureMessagingService({})
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    messaging_service_sid: result.sid,
    reused: result.reused,
    next_steps: [
      '1. Copy the messaging_service_sid below.',
      '2. Paste into Vercel env vars: TWILIO_MESSAGING_SERVICE_SID',
      '3. Redeploy.',
      '4. In Twilio Console → Messaging → Services → BellAveGo Platform → A2P 10DLC, attach your approved campaign to this service.',
      '5. POST /api/admin/a2p/sync to enroll all existing numbers.',
    ],
  })
}
