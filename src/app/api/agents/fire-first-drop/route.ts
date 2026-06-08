import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fireLeadEngineForUser } from '@/lib/leadEngine'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/agents/fire-first-drop
 *
 * Triggered by the onboarding wizard's Save button. Re-runs the
 * discover-for-tenant agent + lead-engine drop for the current user.
 * Idempotent — lead engine's dedup prevents double-drops.
 *
 * Why this exists: payment-first onboarding means the Stripe webhook
 * fires fireLeadEngineForUser BEFORE the wizard saves business_type +
 * service_zips. That early attempt either:
 *   (a) errored with "no_business_type_set" (correct guard) and stamped
 *       first_lead_drop_at = null, OR
 *   (b) silently fell back to default 'hvac' trade and dropped wrong-
 *       trade leads (the pre-2026-06-07 bug we just fixed).
 *
 * This route gives us a clean re-fire path the moment the user has all
 * required fields populated.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    // First trigger the discovery agent (city scraper or census-aging fallback)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'
    await fetch(`${appUrl}/api/agents/discover-for-tenant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_API_SECRET || '',
      },
      body: JSON.stringify({ user_id: userId }),
    }).catch(() => {})

    // Then drop 5 leads
    const result = await fireLeadEngineForUser(userId)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ ok: false, error: err.message || String(e) }, { status: 500 })
  }
}
