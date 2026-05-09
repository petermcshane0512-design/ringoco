import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
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

    // Purchase a Twilio phone number for this contractor
    try {
      const availableNumbers = await twilioClient.availablePhoneNumbers('US')
        .local.list({ limit: 1 })

      if (availableNumbers.length === 0) {
        console.error('No available Twilio numbers')
        return NextResponse.json({ received: true })
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')
        ? 'https://bellavego.com'
        : process.env.NEXT_PUBLIC_APP_URL || 'https://bellavego.com'

      const purchased = await twilioClient.incomingPhoneNumbers.create({
        phoneNumber: availableNumbers[0].phoneNumber,
        voiceUrl: `${appUrl}/api/twilio/voice`,
        voiceMethod: 'POST',
        smsUrl: `${appUrl}/api/twilio/sms`,
        smsMethod: 'POST',
      })

      // Store Twilio number in profile
      await supabase.from('profiles').update({
        twilio_number: purchased.phoneNumber,
      }).eq('user_id', userId)

      console.log(`Provisioned ${purchased.phoneNumber} for user ${userId}`)
    } catch (twilioError) {
      console.error('Twilio provisioning error:', twilioError)
      // Don't fail the webhook — profile was created, number can be provisioned manually
    }
  }

  return NextResponse.json({ received: true })
}
