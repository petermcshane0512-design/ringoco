import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { provisionNumberForUser } from '@/lib/provisionNumber'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_TO_TIER: Record<string, { tier: string; calls: number }> = {
  // v3 active prices (unlimited calls)
  [process.env.STRIPE_PRICE_FOUNDATION_MONTHLY || '']: { tier: 'foundation', calls: 99999 },
  [process.env.STRIPE_PRICE_FOUNDATION_ANNUAL || '']: { tier: 'foundation', calls: 99999 },
  [process.env.STRIPE_PRICE_GROWTH_MONTHLY || '']: { tier: 'growth', calls: 99999 },
  [process.env.STRIPE_PRICE_GROWTH_ANNUAL || '']: { tier: 'growth', calls: 99999 },
  [process.env.STRIPE_PRICE_PREMIUM_MONTHLY || '']: { tier: 'premium', calls: 99999 },
  [process.env.STRIPE_PRICE_PREMIUM_ANNUAL || '']: { tier: 'premium', calls: 99999 },
  // v2 prices ($79/$179) — back-compat
  [process.env.STRIPE_PRICE_FOUNDATION_MONTHLY_V2 || '']: { tier: 'foundation', calls: 99999 },
  [process.env.STRIPE_PRICE_FOUNDATION_ANNUAL_V2 || '']: { tier: 'foundation', calls: 99999 },
  [process.env.STRIPE_PRICE_GROWTH_MONTHLY_V2 || '']: { tier: 'growth', calls: 99999 },
  [process.env.STRIPE_PRICE_GROWTH_ANNUAL_V2 || '']: { tier: 'growth', calls: 99999 },
  // legacy v1 prices ($147/$297/$597) — back-compat
  [process.env.STRIPE_PRICE_SOLO_MONTHLY_LEGACY || '']: { tier: 'solo', calls: 150 },
  [process.env.STRIPE_PRICE_SOLO_ANNUAL_LEGACY || '']: { tier: 'solo', calls: 150 },
  [process.env.STRIPE_PRICE_GROWTH_MONTHLY_LEGACY || '']: { tier: 'growth', calls: 500 },
  [process.env.STRIPE_PRICE_GROWTH_ANNUAL_LEGACY || '']: { tier: 'growth', calls: 500 },
  [process.env.STRIPE_PRICE_SCALE_MONTHLY_LEGACY || '']: { tier: 'scale', calls: 1500 },
  [process.env.STRIPE_PRICE_SCALE_ANNUAL_LEGACY || '']: { tier: 'scale', calls: 1500 },
  [process.env.STRIPE_PRICE_MULTILOC_MONTHLY_LEGACY || '']: { tier: 'multiloc', calls: 5000 },
  [process.env.STRIPE_PRICE_MULTILOC_ANNUAL_LEGACY || '']: { tier: 'multiloc', calls: 5000 },
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Webhook signature invalid' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId
    const subscriptionId = session.subscription as string
    const customerId = session.customer as string

    if (!userId) {
      console.error('No userId in checkout session metadata')
      return NextResponse.json({ received: true })
    }

    // Get subscription details to find the price/tier
    let planTier = 'starter'
    let meteredItemId: string | null = null

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      })

      for (const item of subscription.items.data) {
        const priceId = item.price.id
        if (PRICE_TO_TIER[priceId]) {
          planTier = PRICE_TO_TIER[priceId].tier
        }
        // Metered item has no_periods usage type
        if (item.price.recurring?.usage_type === 'metered') {
          meteredItemId = item.id
        }
      }
    }

    await supabase.from('profiles').update({
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      stripe_metered_item_id: meteredItemId,
      plan_tier: planTier,
      is_active: true,
    }).eq('user_id', userId)

    console.log(`Subscription activated for user ${userId}: ${planTier}`)

    // Provision a Twilio number now that they're paid. Idempotent.
    let provisionedNumber: string | undefined
    try {
      const provision = await provisionNumberForUser(userId)
      if (provision.ok) {
        provisionedNumber = provision.phoneNumber
        console.log(`Provisioned ${provision.phoneNumber} for ${userId} (reused=${provision.reused})`)
      } else {
        console.error(`Provisioning failed for ${userId}: ${provision.error}`)
      }
    } catch (e) {
      console.error(`Provisioning threw for ${userId}:`, e)
    }

    // Welcome SMS to the contractor (idempotent — only sends if welcomed_at is null).
    if (provisionedNumber) {
      try {
        const { data: contractor } = await supabase
          .from('profiles')
          .select('owner_phone, business_name, welcomed_at')
          .eq('user_id', userId)
          .maybeSingle()

        if (contractor?.owner_phone && !contractor.welcomed_at) {
          await twilioClient.messages.create({
            body: `Welcome to BellAveGo, ${contractor.business_name || 'partner'}! Your AI receptionist is live at ${provisionedNumber}. Next step: set up call forwarding so missed calls ring through. Walkthrough: https://www.bellavego.com/dashboard/forwarding — Peter`,
            from: provisionedNumber,
            to: contractor.owner_phone,
          })
          await supabase
            .from('profiles')
            .update({ welcomed_at: new Date().toISOString() })
            .eq('user_id', userId)
        }
      } catch (e) {
        console.error(`Welcome SMS failed for ${userId}:`, e)
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single()

    if (profile) {
      await supabase.from('profiles').update({
        stripe_subscription_id: null,
        stripe_metered_item_id: null,
        plan_tier: 'cancelled',
        is_active: false,
      }).eq('user_id', profile.user_id)

      console.log(`Subscription cancelled for user ${profile.user_id}`)
    }
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .single()

    if (profile) {
      let planTier = 'starter'
      let meteredItemId: string | null = null

      for (const item of subscription.items.data) {
        const priceId = item.price.id
        if (PRICE_TO_TIER[priceId]) {
          planTier = PRICE_TO_TIER[priceId].tier
        }
        if (item.price.recurring?.usage_type === 'metered') {
          meteredItemId = item.id
        }
      }

      await supabase.from('profiles').update({
        plan_tier: planTier,
        stripe_metered_item_id: meteredItemId,
      }).eq('user_id', profile.user_id)
    }
  }

  return NextResponse.json({ received: true })
}
