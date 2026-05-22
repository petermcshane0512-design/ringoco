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

    // Create initial profile record
    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: userId,
      business_name: `${firstName} ${lastName}`.trim() || 'My Business',
      plan_tier: 'starter',
      is_active: false,
    }, { onConflict: 'user_id' })

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
