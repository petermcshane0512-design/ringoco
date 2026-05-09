import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_TO_TIER: Record<string, { tier: string; calls: number }> = {
  [process.env.STRIPE_PRICE_STARTER || '']: { tier: 'starter', calls: 200 },
  [process.env.STRIPE_PRICE_GROWTH || '']: { tier: 'growth', calls: 600 },
  [process.env.STRIPE_PRICE_SCALE || '']: { tier: 'scale', calls: 1500 },
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
