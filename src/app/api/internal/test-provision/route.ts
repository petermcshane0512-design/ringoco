import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { provisionNumberForUser } from '@/lib/provisionNumber'

/**
 * Admin-only dry-run endpoint for per-tenant provisioning. NOT exposed in
 * any UI. Used by Peter (or by Claude on Peter's behalf via the admin
 * secret) to test the provisioning pipeline end-to-end against a test
 * profile BEFORE the first paying customer triggers it via the Stripe
 * webhook.
 *
 * AUTH — dual-mode via requireAdmin() (see src/lib/auth/requireAdmin.ts):
 *   (a) x-admin-secret: $ADMIN_API_SECRET   — for curl / scripts / Claude
 *   (b) Clerk session with admin email      — for browser usage
 *
 * USAGE (Claude / server-side)
 *   curl -X POST https://www.bellavego.com/api/internal/test-provision \
 *     -H "x-admin-secret: $ADMIN_API_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"user_id":"user_xxxxx"}'
 *
 * SAFETY
 *   - requireAdmin() fails closed if ADMIN_API_SECRET is unset AND the
 *     caller has no admin Clerk session. No fail-open path.
 *   - provisionNumberForUser is idempotent — re-running on a fully
 *     provisioned profile is a no-op (returns reused). First-run on a
 *     clean profile WILL spend ~$1.15/mo on a Twilio number and create
 *     a real Vapi assistant. Do not run against random user_ids.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

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
    `[/api/internal/test-provision] mode=${gate.mode} caller=${gate.email ?? gate.userId ?? 'secret'} target=${targetUserId} — invoking provisionNumberForUser`,
  )
  const result = await provisionNumberForUser(targetUserId)
  console.log(
    `[/api/internal/test-provision] result for target=${targetUserId}:`,
    JSON.stringify(result),
  )

  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
