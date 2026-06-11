import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'No webhook secret configured' }, { status: 500 })
  }

  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const body = await req.text()
  const wh = new Webhook(webhookSecret)

  let event: any
  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'user.created') {
    const userId = event.data.id
    const email = event.data.email_addresses?.[0]?.email_address || ''
    const firstName = event.data.first_name || ''
    const lastName = event.data.last_name || ''

    // Create initial profile record.
    // 2026-06-10 — ignoreDuplicates is LOAD-BEARING. In the frictionless
    // anon-checkout flow the Stripe webhook mints the Clerk user and
    // upserts the FULL paid profile (officemgr, is_active, zips, geocode)
    // BEFORE this user.created event arrives. The old plain upsert then
    // clobbered that paid row back to starter/inactive/'My Business' —
    // which froze the lead engine and the dashboard spinner forever.
    // ON CONFLICT DO NOTHING: this handler only seeds profiles that don't
    // exist yet (organic sign-ups), never overwrites.
    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: userId,
      business_name: `${firstName} ${lastName}`.trim() || 'My Business',
      plan_tier: 'starter',
      is_active: false,
    }, { onConflict: 'user_id', ignoreDuplicates: true })

    if (profileError) {
      console.error('Profile creation error:', profileError)
    }

    // NOTE: Twilio number provisioning is intentionally NOT here. Free signups
    // (plan_tier='starter', is_active=false) must not get a paid Twilio line —
    // that was a ~$1.15/mo leak per unpaid user. The authoritative provisioner
    // is the Stripe webhook on checkout.session.completed → provisionNumberForUser.
  }

  return NextResponse.json({ received: true })
}
