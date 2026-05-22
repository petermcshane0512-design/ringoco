import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { provisionNumberForUser } from '@/lib/provisionNumber'

/**
 * Admin-only dry-run endpoint for per-tenant provisioning. NOT exposed in
 * any UI. Used by Peter to test the provisioning pipeline (Vapi assistant
 * creation + Twilio number purchase + binding + DB persist) end-to-end
 * against a test profile BEFORE the first paying customer triggers it
 * via the Stripe webhook.
 *
 * USAGE
 *   curl -X POST https://www.bellavego.com/api/internal/test-provision \
 *     -H "Cookie: __session=<peter's-clerk-session>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"user_id":"user_xxxxx"}'
 *
 * SAFETY
 *   - Hardcoded admin gate (ADMIN_USER_ID below). Returns 403 for anyone
 *     else, including authenticated non-admin Clerk users.
 *   - The underlying provisionNumberForUser is idempotent — if the target
 *     profile already has all three resources (twilio_number,
 *     vapi_assistant_id, vapi_phone_number_id), it returns reused without
 *     spending money or creating duplicates.
 *   - First-run on a clean profile WILL spend ~$1.15/mo on a real Twilio
 *     number and create a real Vapi assistant. Do not run against random
 *     user_ids.
 */

// HARDCODED admin user_id. Replace before first use.
//
// To find your Clerk user_id:
//   1. Visit clerk.com/dashboard → BellAveGo → Users
//   2. Click your row (pmcshane@fordham.edu / bellavegollc@gmail.com)
//   3. Copy "User ID" (format: user_2a1b2c3d4e5f6g7h8i9j0k)
//
// Until this is filled in with a real ID, the route always returns 403,
// which is the safe default.
const ADMIN_USER_ID = 'user_REPLACE_WITH_PETERS_CLERK_ID'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: { user_id?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  const targetUserId = typeof body.user_id === 'string' ? body.user_id : null
  if (!targetUserId) {
    return NextResponse.json({ error: 'missing user_id in body' }, { status: 400 })
  }

  console.log(
    `[/api/internal/test-provision] caller=${userId} target=${targetUserId} — invoking provisionNumberForUser`,
  )
  const result = await provisionNumberForUser(targetUserId)
  console.log(
    `[/api/internal/test-provision] result for target=${targetUserId}:`,
    JSON.stringify(result),
  )

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
