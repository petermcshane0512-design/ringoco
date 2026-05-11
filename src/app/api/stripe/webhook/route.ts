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

// HARDCODED v6 PRICE_TO_TIER mapping (May 11 2026).
// Same reason as checkout/route.ts — Vercel env vars repeatedly fail to populate
// via CLI. Code is the source of truth. To change tiers, edit this object + push.
const PRICE_TO_TIER: Record<string, { tier: string; calls: number }> = {
  // v6 active (May 2026)
  'price_1TVLzIGrkP7VQmUjInufjfVe': { tier: 'receptionist', calls: 50 },     // $179/mo
  'price_1TVLzIGrkP7VQmUjoV1TYYMd': { tier: 'receptionist', calls: 50 },     // $1,790/yr
  'price_1TVXDFGrkP7VQmUjOVB3qgOh': { tier: 'officemgr', calls: 99999 },     // $497/mo
  'price_1TVXDFGrkP7VQmUjInUFNEni': { tier: 'officemgr', calls: 99999 },     // $4,970/yr
  'price_1TVXDGGrkP7VQmUjsBtcKsrE': { tier: 'concierge', calls: 99999 },     // $997/mo
  'price_1TVXDGGrkP7VQmUjbwIIv7qu': { tier: 'concierge', calls: 99999 },     // $9,970/yr
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

  // ── Payment failure → notify customer, don't suspend yet (Stripe will retry) ──
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, owner_phone, business_name, twilio_number, plan_tier')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    if (profile?.owner_phone) {
      try {
        const portalUrl = `https://www.bellavego.com/dashboard/billing`
        await twilioClient.messages.create({
          body:
            `BellAveGo: your card on file was declined for the ${profile.plan_tier || 'subscription'} plan. ` +
            `Update it before service pauses: ${portalUrl}\n\nQuestions? Text Peter at 773-710-9565.`,
          from: profile.twilio_number || process.env.TWILIO_PHONE_NUMBER!,
          to: profile.owner_phone,
        })
        console.log(`Payment-failed SMS sent to ${profile.user_id}`)
      } catch (e) {
        console.error('Payment-failed SMS error:', e)
      }

      // Also SMS Peter so he can do white-glove rescue on Concierge customers
      try {
        await twilioClient.messages.create({
          body:
            `⚠️ Card declined — ${profile.business_name || profile.user_id} (${profile.plan_tier || '?'})\n\n` +
            `Stripe is retrying. If it ultimately fails the account will suspend.\n\nReach out personally for Concierge customers.`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: process.env.FALLBACK_OWNER_PHONE!,
        })
      } catch (e) {
        console.error('Payment-failed Peter SMS error:', e)
      }
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
