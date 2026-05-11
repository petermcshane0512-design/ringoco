import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { provisionNumberForUser } from '@/lib/provisionNumber'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ADMIN_EMAILS = ['pmcshane@fordham.edu', 'peter@bellavego.com']

/**
 * Admin-only: grant the calling user any tier instantly, no Stripe checkout.
 * Lets Peter (and only Peter) flip between Receptionist / AI Office Manager / Concierge
 * dashboards on demand for testing + demos.
 *
 * POST /api/admin/grant-tier
 * Body: { tier: 'receptionist' | 'officemgr' | 'concierge', provisionNumber?: boolean }
 *
 * Auth: must be signed in with an email in ADMIN_EMAILS.
 *
 * Activates the profile (is_active = true), sets plan_tier, optionally provisions a Twilio
 * number, and marks onboarding_complete + setup_complete so the customer flow opens straight
 * to the activated dashboard.
 */

type Tier = 'receptionist' | 'officemgr' | 'concierge'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is admin
  let email = ''
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    email = user.emailAddresses?.[0]?.emailAddress?.toLowerCase() ?? ''
  } catch (e) {
    console.error('admin/grant-tier: clerk user lookup failed', e)
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
  if (!ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { tier?: Tier; provisionNumber?: boolean }
  const tier: Tier = body.tier ?? 'officemgr'
  if (!['receptionist', 'officemgr', 'concierge'].includes(tier)) {
    return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
  }

  // Upsert the profile to active + the requested tier
  // (Also marks onboarding/setup complete so dashboard opens directly.)
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        plan_tier: tier,
        is_active: true,
        onboarding_complete: true,
        setup_complete: true,
        business_name: 'BellAveGo (admin test)',
        owner_phone: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
        services: 'HVAC, plumbing, electrical, home services',
        service_area: 'Atlanta metro',
        ai_tone: 'friendly',
      },
      { onConflict: 'user_id' },
    )
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  // Optionally provision a Twilio number (only if requested + don't already have one)
  let provisionedNumber: string | undefined
  if (body.provisionNumber) {
    try {
      const result = await provisionNumberForUser(userId)
      if (result.ok) provisionedNumber = result.phoneNumber
    } catch (e) {
      console.error('admin grant tier: number provisioning failed', e)
    }
  }

  return NextResponse.json({
    ok: true,
    tier,
    email,
    provisionedNumber,
    message: `You are now active on the ${tier} tier. Open /dashboard to see the tier-specific view.`,
  })
}
