import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { provisionNumberForUser, deprovisionForUser } from '@/lib/provisionNumber'
import { PRICE_TO_TIER } from '@/lib/pricing'
import { applyLedgerEntry } from '@/lib/marketing/growth-wallet'
import { recordPendingReferral, applyPendingReferralCredit, voidPendingReferral } from '@/lib/referrals'
import { sendEmail } from '@/lib/email'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

    // ── Growth Wallet top-up (one-time payment, not subscription) ──
    if (session.metadata?.kind === 'wallet_topup') {
      const amountCents = parseInt(session.metadata.amountCents ?? '0', 10)
      if (amountCents > 0) {
        try {
          await applyLedgerEntry({
            supabase, userId, kind: 'topup',
            amountCents,
            stripeChargeId: session.payment_intent as string,
            note: `Top-up via Stripe Checkout — $${(amountCents / 100).toLocaleString()}`,
          })
          console.log(`Growth wallet top-up: +$${(amountCents / 100).toFixed(2)} for ${userId}`)
        } catch (e) {
          console.error('wallet topup ledger write failed:', e)
        }
      }
      return NextResponse.json({ received: true })
    }

    // Get subscription details to find the price/tier.
    // Default to 'receptionist' (the lowest paying tier) so a price ID we
    // don't recognize still produces a VALID tier slug — 'starter' was
    // the previous fallback but isn't in TIER_METADATA, so any unknown
    // price would break dashboard tier lookups downstream. (Audit 2026-05-24)
    let planTier: string = 'receptionist'
    let meteredItemId: string | null = null

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      })

      let matchedPrice = false
      for (const item of subscription.items.data) {
        const priceId = item.price.id
        if (PRICE_TO_TIER[priceId]) {
          planTier = PRICE_TO_TIER[priceId].tier
          matchedPrice = true
        }
        // Metered item has no_periods usage type
        if (item.price.recurring?.usage_type === 'metered') {
          meteredItemId = item.id
        }
      }
      if (!matchedPrice) {
        console.error(
          `[stripe webhook] Subscription ${subscriptionId} has price IDs not in PRICE_TO_TIER: ` +
            subscription.items.data.map((i) => i.price.id).join(', ') +
            ` — defaulted to 'receptionist'. Update src/lib/pricing.ts PRICE_TO_TIER.`,
        )
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

    // ── Stage 1: record PENDING referral (anti-abuse) ──
    // If this new customer was referred (profiles.referred_by set from the
    // bavg_ref cookie at signup), record a pending referral row. NO Stripe
    // credit fires yet — that waits until the referred customer survives past
    // day 31 (30-day money-back window + 1). The actual credit grant happens
    // in the invoice.payment_succeeded handler below.
    try {
      if (subscriptionId) {
        const subForReferral = await stripe.subscriptions.retrieve(subscriptionId)
        const referralResult = await recordPendingReferral({
          newUserId: userId,
          subscriptionId,
          subscriptionCreatedISO: new Date(subForReferral.created * 1000).toISOString(),
        })
        if (referralResult.ok) {
          console.log(`Pending referral recorded for ${userId} — credit fires after referred customer's day 31`)
        } else if (referralResult.reason && referralResult.reason !== 'no referral attribution') {
          console.warn(`Pending referral skipped for ${userId}: ${referralResult.reason}`)
        }
      }
    } catch (e) {
      console.error(`recordPendingReferral threw for ${userId}:`, e)
    }

    // Provision a Twilio number now that they're paid. Idempotent.
    // Failures are no longer silent — alert Peter + log to provisioning_failures
    // so the half-hourly retry cron picks it up.
    let provisionedNumber: string | undefined
    let provisioningError: string | undefined
    let vapiImportError: string | undefined
    try {
      const provision = await provisionNumberForUser(userId)
      if (provision.ok) {
        provisionedNumber = provision.phoneNumber
        console.log(`Provisioned ${provision.phoneNumber} for ${userId} (reused=${provision.reused})`)
        // Partial failure: Twilio number bought but Vapi import didn't take.
        // Number works on legacy voice; we still want a provisioning_failures
        // row so the retry cron re-attempts the Vapi import + Peter is paged.
        if (provision.vapiImportFailed) {
          vapiImportError = provision.vapiImportError ?? 'unknown Vapi import error'
          console.error(`Vapi import failed for ${userId} after Twilio purchase: ${vapiImportError}`)
        }
      } else {
        provisioningError = provision.error
        console.error(`Provisioning failed for ${userId}: ${provision.error}`)
      }
    } catch (e) {
      provisioningError = (e as Error).message
      console.error(`Provisioning threw for ${userId}:`, e)
    }

    if (provisioningError || vapiImportError) {
      // Log the failure for the retry cron + alert Peter immediately.
      // Two flavors:
      //   - provisioningError: nothing got bought, customer has no number.
      //   - vapiImportError: number bought but stuck on legacy voice — still
      //     needs intervention because the customer paid for Cartesia/Claude.
      const { data: contractor } = await supabase
        .from('profiles')
        .select('business_name, owner_phone')
        .eq('user_id', userId)
        .maybeSingle()

      const lastError = provisioningError ?? `vapi import failed: ${vapiImportError}`

      try {
        await supabase.from('provisioning_failures').upsert(
          {
            user_id: userId,
            business_name: contractor?.business_name,
            owner_phone: contractor?.owner_phone,
            last_error: lastError,
            status: 'pending',
            attempts: 1,
            next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
      } catch (e) {
        console.error('provisioning_failures upsert failed:', e)
      }

      try {
        const headline = provisioningError
          ? `🚨 Provisioning failed — ${contractor?.business_name || userId}`
          : `⚠️ Vapi import failed — ${contractor?.business_name || userId}`
        const detail = provisioningError
          ? `Customer paid but has no Twilio number.`
          : `Customer has a working Twilio number on the LEGACY Polly voice. Cartesia/Claude won't activate until Vapi import succeeds.`
        await twilioClient.messages.create({
          body:
            `${headline}\n\nError: ${lastError}\n\n${detail} Auto-retry will fire in 5min (half-hourly cron). ` +
            `Manual override: https://www.bellavego.com/admin/provisioning`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: process.env.FALLBACK_OWNER_PHONE ?? '+17737109565',
        })
      } catch (e) {
        console.error('Provisioning-failure Peter SMS error:', e)
      }
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
            body: `Welcome to BellAveGo, ${contractor.business_name || 'partner'}! Your AI receptionist is live at ${provisionedNumber}. Next step: set up call forwarding so missed calls ring through — walkthrough: https://www.bellavego.com/dashboard/forwarding. Heads up: full 30-day money-back guarantee if it's not the right fit, no questions asked. — BellAveGo team`,
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
      .select('user_id, business_name, owner_phone, twilio_number, plan_tier')
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

      // Auto-deprovision: release Twilio number + delete Vapi assistant +
      // phone-number binding immediately. Stops the $1.15/mo Twilio rental
      // and Vapi rental from continuing on cancelled accounts.
      let deprovisionFailed = false
      let deprovisionErrors: string[] = []
      try {
        const result = await deprovisionForUser(profile.user_id)
        deprovisionFailed = !result.ok
        deprovisionErrors = result.errors
        console.log(
          `[cancel] auto-deprovision for ${profile.user_id}: ok=${result.ok} ` +
            `vapi-pn=${result.vapiPhoneNumberDeleted} vapi-asst=${result.vapiAssistantDeleted} ` +
            `twilio=${result.twilioNumberReleased}`,
        )
      } catch (e) {
        deprovisionFailed = true
        deprovisionErrors = [`deprovisionForUser threw: ${(e as Error).message}`]
        console.error('auto-deprovision failed:', e)
      }

      // Fallback email — ONLY when auto-deprovision didn't fully complete.
      // If everything released cleanly, no email needed.
      if (deprovisionFailed && profile.twilio_number) {
        try {
          const consoleUrl = `https://console.twilio.com/us1/develop/phone-numbers/manage/active?query=${encodeURIComponent(profile.twilio_number)}`
          const ownerEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
          await sendEmail({
            to: ownerEmail,
            subject: `⚠️ Cancellation — auto-deprovision FAILED for ${profile.business_name ?? 'unknown'}`,
            html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0B1F3A;">
<h2 style="margin:0 0 12px;font-size:20px;font-weight:900;">Auto-deprovision failed — manual cleanup needed</h2>
<p style="margin:0 0 14px;color:#7C2D12;font-size:13px;">Errors: ${deprovisionErrors.join('; ').slice(0, 400)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;width:140px;">Business</td><td style="padding:6px 0;font-weight:700;">${profile.business_name ?? '(unknown)'}</td></tr>
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Owner phone</td><td style="padding:6px 0;">${profile.owner_phone ?? '(none)'}</td></tr>
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Twilio number</td><td style="padding:6px 0;font-family:'SF Mono',Monaco,monospace;font-weight:700;">${profile.twilio_number}</td></tr>
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Tier at cancel</td><td style="padding:6px 0;">${profile.plan_tier ?? '(unknown)'}</td></tr>
</table>
<div style="margin-top:22px;padding:16px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;">
  <div style="font-weight:800;margin-bottom:8px;">Action — 2 minutes:</div>
  <ol style="margin:0;padding-left:20px;line-height:1.6;">
    <li><a href="${consoleUrl}" style="color:#C84B26;font-weight:700;">Open the number in Twilio Console</a></li>
    <li>Bottom of page → <strong>"Release this number"</strong> → confirm</li>
    <li><a href="https://dashboard.vapi.ai/phone-numbers" style="color:#C84B26;font-weight:700;">Delete the matching number in Vapi dashboard</a></li>
  </ol>
</div>
<p style="margin-top:20px;font-size:12px;color:#7AAAB2;">Skipping this costs ~$1.15/mo per orphaned number on Twilio + a Vapi line item.</p>
</div>`,
            text: `Customer ${profile.business_name ?? 'unknown'} (owner ${profile.owner_phone ?? 'no phone'}, tier ${profile.plan_tier ?? 'unknown'}) cancelled. Release Twilio number ${profile.twilio_number} via console: ${consoleUrl} — then delete the matching Vapi import at https://dashboard.vapi.ai/phone-numbers. Skipping costs ~$1.15/mo per orphan.`,
          })
        } catch (e) {
          console.error('cancellation cleanup email failed:', e)
        }
      }
    }

    // Void any pending referral tied to this subscription so the referrer
    // doesn't get credit for a customer who bailed. No-op if the referral
    // already fired (status='credited') or never existed.
    try {
      const voidResult = await voidPendingReferral({
        subscriptionId: subscription.id,
        reason: 'subscription cancelled before qualifying age',
      })
      if (voidResult.voided) {
        console.log(`Voided pending referral for cancelled subscription ${subscription.id}`)
      }
    } catch (e) {
      console.error(`voidPendingReferral threw for ${subscription.id}:`, e)
    }
  }

  // ── invoice.payment_succeeded — Stage 2 of referral credit + un-pause ──
  // Fires on EVERY paid invoice (initial + renewals). Two jobs:
  //   1. Referral credit: no-op unless there's a pending referral for this
  //      subscription AND the subscription is >31 days old. When both true,
  //      the referrer's Stripe customer-balance credit fires.
  //   2. Un-pause: if the customer was paused by a prior payment_failed
  //      event, flip is_active back to true now that they paid.
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null }
    const subscriptionId = (invoice.subscription as string | null) ?? null
    if (subscriptionId) {
      try {
        const result = await applyPendingReferralCredit({ subscriptionId })
        if (result.ok) {
          console.log(`Referral credit fired on invoice payment: $${result.credited} to referrer of subscription ${subscriptionId}`)
        }
      } catch (e) {
        console.error(`applyPendingReferralCredit threw for subscription ${subscriptionId}:`, e)
      }
    }

    const customerId = invoice.customer as string
    if (customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, is_active, plan_tier')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      // Restore service only if it was paused AND the plan wasn't outright
      // cancelled (which sets plan_tier='cancelled' via subscription.deleted).
      if (profile?.user_id && profile.is_active === false && profile.plan_tier !== 'cancelled') {
        try {
          await supabase
            .from('profiles')
            .update({ is_active: true })
            .eq('user_id', profile.user_id)
          console.log(`Restored service for ${profile.user_id} on payment_succeeded`)
        } catch (e) {
          console.error('payment_succeeded is_active flip failed:', e)
        }
      }
    }
  }

  // ── Payment failure → pause service immediately + notify customer ──
  // Stripe will continue retrying the card for ~3 days. During that window
  // we previously left is_active=true, which meant calls kept being answered
  // (and minutes burned) by a delinquent customer. Now we flip is_active=false
  // right away — assistant-request returns the "service paused" message —
  // and invoice.payment_succeeded below flips it back when they pay.
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const customerId = invoice.customer as string

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, owner_phone, business_name, twilio_number, plan_tier')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    if (profile?.user_id) {
      try {
        await supabase
          .from('profiles')
          .update({ is_active: false })
          .eq('user_id', profile.user_id)
        console.log(`Paused service for ${profile.user_id} on payment_failed`)
      } catch (e) {
        console.error('payment_failed is_active flip failed:', e)
      }
    }

    // Seed invoice_followups so the Collections cron starts SMS chases.
    // Pulls amount + hosted invoice URL straight from Stripe so the chase
    // SMS includes a working pay-by-text link with zero contractor input.
    if (profile?.owner_phone && invoice.amount_due > 0) {
      try {
        const hostedUrl = (invoice as Stripe.Invoice & { hosted_invoice_url?: string }).hosted_invoice_url
        await supabase.from('invoice_followups').insert({
          user_id: profile.user_id,
          customer_name: profile.business_name,
          customer_phone: profile.owner_phone,
          invoice_amount: invoice.amount_due / 100,
          invoice_description: invoice.description || `BellAveGo subscription (${profile.plan_tier ?? 'plan'})`,
          due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString().slice(0, 10) : null,
          source: 'stripe_failed',
          status: 'pending',
          next_chase_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          stripe_payment_link: hostedUrl,
        })
      } catch (e) {
        console.error('invoice_followups seed failed:', e)
      }
    }

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
