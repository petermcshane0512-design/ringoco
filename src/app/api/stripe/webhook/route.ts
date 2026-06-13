import { NextRequest, NextResponse, after } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { provisionNumberForUser, deprovisionForUser } from '@/lib/provisionNumber'
import { PRICE_TO_TIER } from '@/lib/pricing'
import { applyLedgerEntry } from '@/lib/marketing/growth-wallet'
import { recordPendingReferral, applyPendingReferralCredit, voidPendingReferral } from '@/lib/referrals'
import { sendEmail } from '@/lib/email'
import { lookupOwnerEmail } from '@/lib/notify'
import { fireLeadEngineForUser } from '@/lib/leadEngine'
import { LEADS_PER_WEEK } from '@/lib/offer'
import { claimTerritory, releaseCustomerTerritories } from '@/lib/territory'
import { geocodeBusinessAddress } from '@/lib/geocodeBusinessAddress'
import { skipTraceAddress } from '@/lib/skipTrace'

function escapeHtmlMin(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

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
    let userId = session.metadata?.userId
    const subscriptionId = session.subscription as string
    const customerId = session.customer as string
    const isAnon = session.metadata?.anon === '1' || (userId?.startsWith('anon_') ?? false)

    // 2026-06-10 — FRICTIONLESS-CHECKOUT account creation.
    // Anonymous Stripe Checkout sessions arrive w/ a placeholder userId
    // (`anon_<uuid>`). Mint a real Clerk user from Stripe-collected email,
    // swap the placeholder for the real Clerk user_id everywhere
    // downstream, and stash a sign-in token in subscription metadata so
    // /checkout/return can auto-sign the prospect in on the success
    // redirect. Net friction: 4 steps → 1.
    if (isAnon) {
      const email = session.customer_details?.email?.trim().toLowerCase()
      if (!email) {
        console.error('[webhook] anon checkout missing customer_details.email — cannot mint Clerk user')
        return NextResponse.json({ received: true })
      }
      // 2026-06-10 — pull phone from /start/area metadata and pass to Clerk
      // so the customer can also sign in via SMS OTP later (not just email
      // magic link). Phone has to be E.164 (+1XXXXXXXXXX); /start/area
      // collected 10 raw digits in metadata.owner_phone. Clerk dashboard
      // must have SMS auth enabled for the OTP path to work; this code is
      // a no-op for the email-only mode.
      const phoneDigits = (session.metadata?.owner_phone || '').replace(/\D/g, '')
      const phoneE164 = phoneDigits.length === 10
        ? `+1${phoneDigits}`
        : phoneDigits.length === 11 && phoneDigits.startsWith('1')
        ? `+${phoneDigits}`
        : null
      try {
        const { clerkClient } = await import('@clerk/nextjs/server')
        const cc = await clerkClient()
        // Reuse if email OR phone already belongs to a Clerk user (returning
        // visitor who used a different browser / cleared cookies / signed up
        // via the other channel).
        const byEmail = await cc.users.getUserList({ emailAddress: [email] }).catch(() => null)
        const byPhone = phoneE164
          ? await cc.users.getUserList({ phoneNumber: [phoneE164] }).catch(() => null)
          : null
        const existing = byEmail?.data?.[0] ?? byPhone?.data?.[0] ?? null
        const realUserId = existing?.id ?? (await cc.users.createUser({
          emailAddress: [email],
          ...(phoneE164 ? { phoneNumber: [phoneE164] } : {}),
          skipPasswordRequirement: true,
          skipPasswordChecks: true,
        })).id
        // Sign-in token: one-shot URL that completes Clerk session on first
        // load. /checkout/return redeems it then redirects to dashboard.
        let signInTokenUrl: string | null = null
        try {
          const token = await cc.signInTokens.createSignInToken({
            userId: realUserId,
            expiresInSeconds: 60 * 60, // 1 hour
          })
          signInTokenUrl = (token as { token?: string; url?: string }).url ?? null
        } catch (e) {
          console.warn('[webhook] signInTokens.createSignInToken failed:', (e as Error).message)
        }
        // Stash on subscription metadata so /checkout/return can read it.
        // Stripe metadata limit 500ch — token URL is ~150ch.
        if (subscriptionId && signInTokenUrl) {
          try {
            await stripe.subscriptions.update(subscriptionId, {
              metadata: { signin_token_url: signInTokenUrl, real_user_id: realUserId },
            })
          } catch (e) {
            console.warn('[webhook] sub metadata stash failed:', (e as Error).message)
          }
        }
        // Mirror onto the Stripe Customer too — /checkout/return reads
        // session.customer first, which is the cheaper lookup.
        if (customerId) {
          try {
            await stripe.customers.update(customerId, {
              metadata: { signin_token_url: signInTokenUrl ?? '', real_user_id: realUserId },
            })
          } catch (e) {
            console.warn('[webhook] customer metadata stash failed:', (e as Error).message)
          }
        }
        console.log(`[webhook] anon→clerk user=${realUserId} email=${email}`)
        userId = realUserId
      } catch (e) {
        console.error('[webhook] anon Clerk-user creation failed:', (e as Error).message)
        return NextResponse.json({ received: true })
      }
    }

    if (!userId) {
      console.error('No userId in checkout session metadata')
      return NextResponse.json({ received: true })
    }

    // 2026-06-09 â€” stamp signed_up_at on prospect_free_leads if this
    // checkout came from the /free-lead?b={biz_id} cold-email landing.
    // 2026-06-10 â€” Fable 5: also skip-trace the FULL phone now (was
    // redacted on the free-lead landing â€” phone unlocks on payment).
    const bizId = (session.metadata?.biz_id || '').slice(0, 64)
    if (bizId) {
      try {
        await supabase
          .from('prospect_free_leads')
          .update({
            signed_up_at: new Date().toISOString(),
            signed_up_user_id: userId,
          })
          .eq('biz_id', bizId)
          .is('signed_up_at', null)
        console.log(`[free-lead] attributed signup user=${userId} â†’ biz_id=${bizId}`)

        // Fire skip-trace AFTER payment so the customer gets the real
        // phone number on first dashboard view. Cheap ($0.10) + only
        // fires for paying customers, no PII exposure to anonymous
        // clickers. Non-fatal â€” if it fails, customer still has redacted
        // phone visible + can call us for manual lookup.
        try {
          const { data: pfl } = await supabase
            .from('prospect_free_leads')
            .select('lead_street, zip, city, state, lead_owner_name')
            .eq('biz_id', bizId)
            .maybeSingle()
          if (pfl && (pfl as { lead_street?: string }).lead_street) {
            const row = pfl as { lead_street: string; zip?: string; city?: string; state?: string; lead_owner_name?: string }
            // 2026-06-11 — was a raw BatchData fetch (no spend gate, no
            // spend log). Now goes through skipTraceAddress, which arms the
            // daily cap + logs to batchdata_spend_log centrally.
            const trace = await skipTraceAddress({
              street: row.lead_street,
              city: row.city || undefined,
              state: row.state || undefined,
              zip: row.zip || undefined,
            })
            const phone = trace.owner_phones?.[0]
            if (trace.ok && phone) {
              await supabase
                .from('prospect_free_leads')
                .update({ lead_phone: phone })  // FULL phone now
                .eq('biz_id', bizId)
              console.log(`[free-lead] skip-trace unlocked phone for biz_id=${bizId}`)
            }
          }
        } catch (e) {
          console.warn('[free-lead] skip-trace at signup failed:', (e as Error).message)
        }
      } catch (e) {
        console.warn('[free-lead] attribution stamp failed:', (e as Error).message)
      }
    }

    // â”€â”€ Growth Wallet top-up (one-time payment, not subscription) â”€â”€
    if (session.metadata?.kind === 'wallet_topup') {
      const amountCents = parseInt(session.metadata.amountCents ?? '0', 10)
      if (amountCents > 0) {
        try {
          await applyLedgerEntry({
            supabase, userId, kind: 'topup',
            amountCents,
            stripeChargeId: session.payment_intent as string,
            note: `Top-up via Stripe Checkout â€” $${(amountCents / 100).toLocaleString()}`,
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
    // don't recognize still produces a VALID tier slug â€” 'starter' was
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
            ` â€” defaulted to 'receptionist'. Update src/lib/pricing.ts PRICE_TO_TIER.`,
        )
      }
    }

    // Read creator_code from checkout session metadata (set by /api/stripe/checkout
    // when prospect signed up via /ref/[code] flow). Two accepted formats:
    //   PERSONALIZED  HVACMIKE, PLUMBERJON (current $200-off promotion_code path)
    //   LEGACY        BAVG-XXXXXX          (old DMs still in the wild, attribution-only)
    // Stored both on profiles.creator_referral_code (legacy column) and
    // referred_by_promo_code (new 2026-06-06 schema) so old code paths keep working.
    const creatorCode = (session.metadata?.creator_code || '').toUpperCase().trim()
    const isLegacyCode = /^BAVG-[A-Z0-9]{6}$/.test(creatorCode)
    const isPersonalizedCode = /^[A-Z0-9]{1,12}$/.test(creatorCode) && !isLegacyCode
    const validCreatorCode = isLegacyCode || isPersonalizedCode ? creatorCode : null

    // 2026-06-12 — customer-to-customer referral attribution. Separate from
    // creator codes: this is the BAVG-XXXXXX a paying customer shared via
    // ?ref=. It must land on profiles.referred_by (NOT referred_by_promo_code)
    // because recordPendingReferral() below reads referred_by. Without this
    // the whole referral flywheel silently no-ops in the anon-checkout flow.
    const referralCodeMeta = (session.metadata?.referral_code || '').toUpperCase().trim()
    const validReferralCode = /^BAVG-[A-Z0-9]{6}$/.test(referralCodeMeta) ? referralCodeMeta : null

    // 2026-06-10 â€” T5 attribution. Read UTM fields off session metadata
    // (set by checkout from /start's cookies). All nullable for direct
    // and organic visitors.
    const utmStamp = {
      utm_source:      session.metadata?.utm_source      || null,
      utm_medium:      session.metadata?.utm_medium      || null,
      utm_campaign:    session.metadata?.utm_campaign    || null,
      utm_term:        session.metadata?.utm_term        || null,
      utm_content:     session.metadata?.utm_content     || null,
      first_touch_url: session.metadata?.first_touch_url || null,
      first_touch_at:  session.metadata?.first_touch_at  || null,
      paid_at: new Date().toISOString(),
    }

    // 2026-06-10 â€” fix #5: stamp owner_phone, business_address, service_zips,
    // business_type from /start/area metadata BEFORE find-real-leads fires.
    // Also geocode the business address so find-real-leads can use the
    // address-anchored tight-radius branch (3mi from business_lat/lng) on
    // the very first pull, not just on subsequent pulls after the wizard.
    const metaBusinessAddress = (session.metadata?.business_address || '').trim()
    const metaOwnerPhoneDigits = (session.metadata?.owner_phone || '').replace(/\D/g, '')
    const ownerPhoneE164 = metaOwnerPhoneDigits.length >= 10
      ? (metaOwnerPhoneDigits.length === 10 ? `+1${metaOwnerPhoneDigits}` : `+${metaOwnerPhoneDigits}`)
      : ''

    let geocoded: { lat: number; lng: number; formatted: string } | null = null
    if (metaBusinessAddress.length >= 8) {
      try {
        geocoded = await geocodeBusinessAddress(metaBusinessAddress)
      } catch (e) {
        console.warn(`[signup geocode] threw for ${userId}: ${(e as Error).message}`)
      }
    }

    // 2026-06-10 — UPSERT not UPDATE. In the anon-checkout flow the Clerk
    // user is minted by THIS handler seconds earlier; its profile row may
    // not exist yet (Clerk's user.created webhook is async). The old
    // .update().eq() matched 0 rows and silently dropped the entire paid
    // seeding — tier, zips, trade, geocode — leaving the lead engine
    // triple-blocked (inactive + starter + no zips) and the dashboard
    // spinning forever. Upsert creates-or-updates atomically.
    await supabase.from('profiles').upsert({
      user_id: userId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      stripe_metered_item_id: meteredItemId,
      plan_tier: planTier,
      is_active: true,
      ...(validCreatorCode ? {
        creator_referral_code: validCreatorCode,
        referred_by_promo_code: validCreatorCode,
      } : {}),
      ...(validReferralCode ? { referred_by: validReferralCode } : {}),
      ...(metaBusinessAddress ? { business_address: metaBusinessAddress } : {}),
      ...(ownerPhoneE164 ? { owner_phone: ownerPhoneE164 } : {}),
      // 2026-06-10 — kill wizard. 4-field /start/area is the whole flow.
      // Anything the wizard captured (sub_trade, value_props, tone) is now
      // optional polish via Settings.
      setup_complete: true,
      ...(geocoded ? {
        business_lat: geocoded.lat,
        business_lng: geocoded.lng,
        business_geocoded_at: new Date().toISOString(),
      } : {}),
      // service_zips seeded from /start/area zip so find-real-leads has the
      // primary search zip without waiting on the post-checkout wizard.
      ...(session.metadata?.territory_zip ? { service_zips: [session.metadata.territory_zip] } : {}),
      // business_type seeded from territory_trade so trade-recipe routing
      // in find-real-leads + lead-engine works on day 1.
      ...(session.metadata?.territory_trade ? { business_type: session.metadata.territory_trade } : {}),
      ...utmStamp,
    }, { onConflict: 'user_id' })

    console.log(`Subscription activated for user ${userId}: ${planTier}` + (geocoded ? ` (geocoded ${geocoded.lat.toFixed(4)}, ${geocoded.lng.toFixed(4)})` : ''))

    // 2026-06-10 â€” T3 territory enforcement. Claim the (zip, trade)
    // territory now that payment cleared. zip + trade were captured at
    // /start/area and forwarded through checkout metadata.
    // Fail-soft: if the territory was concurrently claimed by another
    // shop (UNIQUE collision), log it for Peter to handle manually â€”
    // do NOT throw, the customer already paid and Stripe owns the truth.
    const territoryZip = session.metadata?.territory_zip || ''
    const territoryTrade = session.metadata?.territory_trade || ''
    if (territoryZip && territoryTrade) {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('business_name')
          .eq('user_id', userId)
          .maybeSingle()
        const claim = await claimTerritory({
          zip: territoryZip,
          trade: territoryTrade,
          customerId: userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId || null,
          businessName: prof?.business_name ?? null,
        })
        if (!claim.ok) {
          console.error(
            `[territory] CONFLICT â€” user ${userId} paid for ${territoryZip}/${territoryTrade} ` +
            `but it is held by ${claim.conflict?.claimed_by_user_id ?? 'unknown'}. Peter needs to refund.`,
          )
        } else {
          console.log(`[territory] claimed ${territoryZip}/${territoryTrade} for ${userId}`)
        }
      } catch (e) {
        console.error('[territory] claim threw:', e)
      }
    }

    // â”€â”€ Day-1 lead drop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Fire lead-engine for this tenant NOW, not next 4am cron. Service
    // ZIPs + radius were captured during onboarding (before checkout),
    // so the profile is ready. Fire-and-forget so it doesn't block the
    // 200 we owe Stripe. Logs the assigned count for debugging.
    // Step A â€” fire the discovery agent FIRST. This will:
    //   1. trigger any registered city scraper for the tenant's metro
    //   2. fall back to census-aging if the pool is light
    //   3. skip-trace untraced leads in their 50mi radius
    // Step B â€” only THEN call fireLeadEngineForUser which actually drops
    // 5 leads to their dashboard. Without A â†’ B order, brand-new tenants
    // in metros we don't pre-scrape get 0 leads on day 1.
    //
    // 2026-06-10 - LATENCY FIX. The prior bare fire-and-forget
    // fetch(...).then(fireLeadEngineForUser) chain DIED the moment this
    // handler returned 200 to Stripe - Vercel freezes the lambda after the
    // response, so the .then() continuation almost never ran. New tenants
    // silently waited for the HOURLY lead-engine cron. That was the entire
    // smoke-test "leads taking forever" pain.
    //
    // after() (Next 15+) keeps the function instance alive until the
    // callback settles WITHOUT delaying the 200 to Stripe.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'
    const dayOneUserId = userId
    after(async () => {
      try {
        const r = await fetch(`${appUrl}/api/agents/discover-for-tenant`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.ADMIN_API_SECRET || '',
          },
          body: JSON.stringify({ user_id: dayOneUserId }),
        })
        const d = r.ok ? await r.json() : { ok: false, status: r.status }
        console.log(`[discover-agent] tenant ${dayOneUserId}: leads_in_radius=${d.leads_in_radius ?? '?'} steps=${(d.steps ?? []).length}`)
        const drop = await fireLeadEngineForUser(dayOneUserId)
        if (drop.assigned > 0) {
          console.log(`[day-1 leads] dropped ${drop.assigned} leads to new tenant ${dayOneUserId}`)
        } else {
          console.log(`[day-1 leads] no drop for ${dayOneUserId}: ${drop.skipped_reason}`)
        }
      } catch (e) {
        console.error(`[day-1 leads] discover->drop chain threw for ${dayOneUserId}:`, e)
      }
    })

    // ── Founder paid-alert SMS — per Peter, fired the second a card swipes ──
    // Hormozi speed-to-lead: customer who gets a personal text from the
    // founder within 5min of signup converts to month-2 retention ~2x
    // versus customer who gets only the automated welcome. THIS is the
    // single highest-leverage action on the path to 100 by Sept 1.
    //
    // 2026-06-13: rewritten for the leads-only pivot. Old copy showed
    // pre-pivot tier names (Starter $147 / Pro $297 / Elite $597) which
    // are mothballed; new copy shows the actual paid amount, the city +
    // trade + zip Peter needs to open the call, and the promo code so he
    // knows the entry price was $97 not $497.
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('business_name, owner_first_name, owner_phone, email, service_zips, plan_tier')
        .eq('user_id', userId)
        .maybeSingle()

      const founderPhone = process.env.FOUNDER_ALERT_PHONE ?? '+17737109565'
      const businessName = prof?.business_name ?? 'unknown shop'
      const ownerName = prof?.owner_first_name ?? ''
      const ownerPhoneClean = prof?.owner_phone?.replace(/[^\d+]/g, '') ?? ''
      const territoryZip = session.metadata?.territory_zip ?? (Array.isArray(prof?.service_zips) ? prof?.service_zips?.[0] : '') ?? ''
      const territoryTrade = (session.metadata?.territory_trade ?? '').toString().toUpperCase()
      const promoCode = (session.metadata?.promo_code ?? session.metadata?.creator_code ?? '').toString().toUpperCase()
      const amountCents = (session.amount_total ?? 0)
      const amountUsd = amountCents > 0 ? `$${(amountCents / 100).toFixed(0)}` : '—'
      const bizIdAttribution = (session.metadata?.biz_id ?? '').toString()

      const sms =
        `🎉 NEW PAID CUSTOMER — ${amountUsd}\n\n` +
        `${businessName}${ownerName ? ` (${ownerName})` : ''}\n` +
        `${territoryTrade || '—'} · ${territoryZip || '—'}\n` +
        `Email: ${prof?.email ?? '—'}\n` +
        `Phone: ${ownerPhoneClean || '—'}\n` +
        (promoCode ? `Promo: ${promoCode}\n` : '') +
        (bizIdAttribution ? `Source: cold email ${bizIdAttribution}\n` : '') +
        `\nText them in next 5 min — 2x retention to month 2.`

      await twilioClient.messages.create({
        body: sms,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: founderPhone,
      })
      console.log(`[founder alert] SMS sent to ${founderPhone} for new subscription ${userId}`)
    } catch (e) {
      console.error('[founder alert] SMS failed (non-blocking):', e)
    }

    // â”€â”€ 2026-06-10 â€” fix #7: contractor welcome SMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Set expectation in the first minute after paying. Per Fable: include
    // what Monday's list actually is â€” a concrete preview kills minute-1
    // refund anxiety better than a generic "thanks for signing up." If
    // we couldn't geocode the address we omit the street fragment instead
    // of guessing â€” never fake a delivery promise.
    if (ownerPhoneE164) {
      try {
        const tradeForCopy = (session.metadata?.territory_trade || '').toLowerCase() === 'roofing'
          ? 'aging-roof homes'
          : (session.metadata?.territory_trade || '').toLowerCase() === 'plumbing'
            ? 'owner-occupied homes likely needing plumbing work'
            : 'owner-occupied homes with aging HVAC systems'
        const nearLine = geocoded ? ` near ${metaBusinessAddress}` : ''
        const welcomeBody =
          `BellAveGo: you're in. Your first ${LEADS_PER_WEEK} ${tradeForCopy}${nearLine} are landing in your dashboard now (~30 min). Next batch in 7 days.\n\n` +
          `We'll text you the second any of them shows real interest. Reply HELP anytime.`
        await twilioClient.messages.create({
          body: welcomeBody,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: ownerPhoneE164,
        })
        console.log(`[welcome SMS] sent to ${ownerPhoneE164} for ${userId}`)
      } catch (e) {
        console.error(`[welcome SMS] send failed for ${userId} (non-blocking):`, e)
      }
    }

    // â”€â”€ Stage 1: record PENDING referral (anti-abuse) â”€â”€
    // If this new customer was referred (profiles.referred_by set from the
    // bavg_ref cookie at signup), record a pending referral row. NO Stripe
    // credit fires yet â€” that waits until the referred customer survives the
    // 7-day trial AND completes their first full paid month (~day 38). The
    // actual credit grant happens in the invoice.payment_succeeded handler below.
    try {
      if (subscriptionId) {
        const subForReferral = await stripe.subscriptions.retrieve(subscriptionId)
        const referralResult = await recordPendingReferral({
          newUserId: userId,
          subscriptionId,
          subscriptionCreatedISO: new Date(subForReferral.created * 1000).toISOString(),
        })
        if (referralResult.ok) {
          console.log(`Pending referral recorded for ${userId} â€” credit fires after referred customer's day 31`)
        } else if (referralResult.reason && referralResult.reason !== 'no referral attribution') {
          console.warn(`Pending referral skipped for ${userId}: ${referralResult.reason}`)
        }
      }
    } catch (e) {
      console.error(`recordPendingReferral threw for ${userId}:`, e)
    }

    // Provision a Twilio number now that they're paid. Idempotent.
    // Failures are no longer silent â€” alert Peter + log to provisioning_failures
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
      //   - vapiImportError: number bought but stuck on legacy voice â€” still
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
          ? `ðŸš¨ Provisioning failed â€” ${contractor?.business_name || userId}`
          : `âš ï¸ Vapi import failed â€” ${contractor?.business_name || userId}`
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

    // Welcome SMS to the contractor (idempotent â€” only sends if welcomed_at is null).
    if (provisionedNumber) {
      try {
        const { data: contractor } = await supabase
          .from('profiles')
          .select('owner_phone, business_name, welcomed_at')
          .eq('user_id', userId)
          .maybeSingle()

        if (contractor?.owner_phone && !contractor.welcomed_at) {
          // 1. Welcome SMS â€” fast, immediate, ringtone-grade alert.
          await twilioClient.messages.create({
            body: `ðŸŽ¯ Welcome to BellAveGo, ${contractor.business_name || 'partner'}! Your first ${LEADS_PER_WEEK} neighborhood leads land in your dashboard within 24h. View them anytime: https://www.bellavego.com/dashboard/leads. 30-day money-back guarantee â€” cancel anytime in your dashboard if you're not booking more jobs. â€” Peter, BellAveGo`,
            from: provisionedNumber,
            to: contractor.owner_phone,
          })

          // 2. Welcome EMAIL â€” receipt-grade record of trial start.
          // SMS can be missed / muted / land in unknown-sender. Email gives
          // them a paper trail with the charge-day-8 disclosure and the
          // dashboard link they can click from any device.
          try {
            const contractorEmail = await lookupOwnerEmail(userId)
            if (contractorEmail) {
              const biz = contractor.business_name || 'partner'
              const subject = `Welcome to BellAveGo â€” your AI receptionist is live`
              const html =
                `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0B1F3A;">` +
                `<div style="text-align:center;margin-bottom:24px;"><div style="display:inline-block;background:#0AA89F;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;font-size:18px;letter-spacing:0.3px;">ðŸ”” BellAveGo</div></div>` +
                `<h1 style="font-size:22px;margin:0 0 12px;">Welcome, ${escapeHtmlMin(biz)} ðŸ‘‹</h1>` +
                `<p style="font-size:15px;line-height:1.55;margin:0 0 18px;">Your AI receptionist is live and ready to answer calls. Here's what's next:</p>` +
                `<div style="background:#F5F1EA;border-radius:10px;padding:16px 18px;margin:0 0 20px;">` +
                  `<p style="margin:0 0 8px;font-size:13px;color:#4A6670;">Your dedicated number</p>` +
                  `<p style="margin:0;font-size:20px;font-weight:800;color:#0AA89F;">${provisionedNumber}</p>` +
                `</div>` +
                `<h2 style="font-size:16px;margin:24px 0 8px;">Get up and running (5 min)</h2>` +
                `<ol style="font-size:14px;line-height:1.7;padding-left:20px;margin:0 0 20px;">` +
                  `<li><strong>Set up call forwarding</strong> so missed calls ring our AI. <a href="https://www.bellavego.com/dashboard/forwarding" style="color:#0AA89F;">Step-by-step walkthrough â†’</a></li>` +
                  `<li><strong>Save the dashboard to your phone home screen</strong> so you get push alerts the second a lead comes in.</li>` +
                  `<li><strong>Test it</strong> â€” call your new number from a different phone and hear Emma in action.</li>` +
                `</ol>` +
                `<p style="text-align:center;margin:24px 0;"><a href="https://www.bellavego.com/dashboard" style="display:inline-block;background:#0AA89F;color:#fff;text-decoration:none;font-weight:800;padding:14px 28px;border-radius:10px;font-size:15px;">Open your dashboard</a></p>` +
                `<div style="border-top:1px solid #E5E7EB;margin-top:24px;padding-top:16px;font-size:12px;color:#4A6670;line-height:1.6;">` +
                  `<p style="margin:0 0 6px;"><strong>Trial details:</strong> You're in a 7-day free trial. Your card won't be charged until day 8. Cancel anytime from the billing tab â€” no questions, no fees.</p>` +
                  `<p style="margin:0 0 6px;"><strong>Need help?</strong> Text Peter (founder) directly: (773) 710-9565. Replies under 10 min during business hours.</p>` +
                  `<p style="margin:6px 0 0;">â€” BellAveGo team</p>` +
                `</div>` +
                `</div>`
              const text =
                `Welcome to BellAveGo, ${biz}!\n\n` +
                `Your AI receptionist is live at ${provisionedNumber}.\n\n` +
                `Get up and running (5 min):\n` +
                `1. Set up call forwarding: https://www.bellavego.com/dashboard/forwarding\n` +
                `2. Save the dashboard to your phone home screen for push alerts\n` +
                `3. Test it â€” call your new number from a different phone\n\n` +
                `Dashboard: https://www.bellavego.com/dashboard\n\n` +
                `Trial details: 7-day free trial. Card charged day 8 unless you cancel. Cancel anytime from the billing tab.\n\n` +
                `Need help? Text Peter directly: (773) 710-9565.\n\nâ€” BellAveGo team`
              await sendEmail({ to: contractorEmail, subject, html, text })
            }
          } catch (e) {
            console.error(`Welcome email failed for ${userId}:`, e)
          }

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

      // 2026-06-10 â€” T3 territory enforcement. Move owned territories into
      // a 14-day grace window so we don't double-sell during dunning/retry.
      // territory-release-grace cron flips them back to 'open' after the
      // window expires.
      try {
        const released = await releaseCustomerTerritories(profile.user_id)
        console.log(`[territory] released ${released} territories to 14-day grace for ${profile.user_id}`)
      } catch (e) {
        console.error('[territory] release threw:', e)
      }

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

      // Fallback email â€” ONLY when auto-deprovision didn't fully complete.
      // If everything released cleanly, no email needed.
      if (deprovisionFailed && profile.twilio_number) {
        try {
          const consoleUrl = `https://console.twilio.com/us1/develop/phone-numbers/manage/active?query=${encodeURIComponent(profile.twilio_number)}`
          const ownerEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
          await sendEmail({
            to: ownerEmail,
            subject: `âš ï¸ Cancellation â€” auto-deprovision FAILED for ${profile.business_name ?? 'unknown'}`,
            html: `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0B1F3A;">
<h2 style="margin:0 0 12px;font-size:20px;font-weight:900;">Auto-deprovision failed â€” manual cleanup needed</h2>
<p style="margin:0 0 14px;color:#7C2D12;font-size:13px;">Errors: ${deprovisionErrors.join('; ').slice(0, 400)}</p>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;width:140px;">Business</td><td style="padding:6px 0;font-weight:700;">${profile.business_name ?? '(unknown)'}</td></tr>
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Owner phone</td><td style="padding:6px 0;">${profile.owner_phone ?? '(none)'}</td></tr>
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Twilio number</td><td style="padding:6px 0;font-family:'SF Mono',Monaco,monospace;font-weight:700;">${profile.twilio_number}</td></tr>
  <tr><td style="padding:6px 0;color:#7AAAB2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Tier at cancel</td><td style="padding:6px 0;">${profile.plan_tier ?? '(unknown)'}</td></tr>
</table>
<div style="margin-top:22px;padding:16px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;">
  <div style="font-weight:800;margin-bottom:8px;">Action â€” 2 minutes:</div>
  <ol style="margin:0;padding-left:20px;line-height:1.6;">
    <li><a href="${consoleUrl}" style="color:#C84B26;font-weight:700;">Open the number in Twilio Console</a></li>
    <li>Bottom of page â†’ <strong>"Release this number"</strong> â†’ confirm</li>
    <li><a href="https://dashboard.vapi.ai/phone-numbers" style="color:#C84B26;font-weight:700;">Delete the matching number in Vapi dashboard</a></li>
  </ol>
</div>
<p style="margin-top:20px;font-size:12px;color:#7AAAB2;">Skipping this costs ~$1.15/mo per orphaned number on Twilio + a Vapi line item.</p>
</div>`,
            text: `Customer ${profile.business_name ?? 'unknown'} (owner ${profile.owner_phone ?? 'no phone'}, tier ${profile.plan_tier ?? 'unknown'}) cancelled. Release Twilio number ${profile.twilio_number} via console: ${consoleUrl} â€” then delete the matching Vapi import at https://dashboard.vapi.ai/phone-numbers. Skipping costs ~$1.15/mo per orphan.`,
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

  // â”€â”€ invoice.payment_succeeded â€” Stage 2 of referral credit + un-pause â”€â”€
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
        .select('user_id, is_active, plan_tier, creator_referral_code, referred_by_promo_code, first_paid_charge_at, second_paid_charge_at')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      // 2026-06-10 â€” T5 retention. Snapshot the pre-stamp state so the
      // creator branch downstream can still compute isFirstPaid /
      // isSecondPaid correctly (it depends on whether the columns were
      // already set BEFORE this invoice). Then stamp on every paid
      // invoice for every customer â€” was previously only stamped for
      // creator-attributed signups, so non-creator retention was
      // invisible. second_paid_charge_at is the month-2 conversion
      // signal that powers /admin/retention.
      const hadFirstPaidBefore = !!profile?.first_paid_charge_at
      const hadSecondPaidBefore = !!profile?.second_paid_charge_at
      if (profile?.user_id && invoice.amount_paid && invoice.amount_paid > 0) {
        try {
          if (!hadFirstPaidBefore) {
            await supabase
              .from('profiles')
              .update({ first_paid_charge_at: new Date().toISOString() })
              .eq('user_id', profile.user_id)
          } else if (!hadSecondPaidBefore) {
            await supabase
              .from('profiles')
              .update({ second_paid_charge_at: new Date().toISOString() })
              .eq('user_id', profile.user_id)
            console.log(`[retention] month-2 paid charge for ${profile.user_id}`)
          }
        } catch (e) {
          console.error('[retention] first/second_paid stamp failed:', e)
        }
      }

      // â”€â”€ IG creator payout staging (pivot 2026-06-06, refined) â”€â”€
      // Two-stage flow tied to fan's first + second paid invoices:
      //
      //   FIRST  paid charge (~$97 with FIRST400 $400-off code applied):
      //     • stamp profiles.first_paid_charge_at
      //     • add creator commission to creator.pending_payout_cents (1-Job Guarantee window)
      //
      //   SECOND paid charge (~$497, day ~30):
      //     • stamp profiles.second_paid_charge_at
      //     • move pending commission → payable_friday_cents
      //     • bump paid_referrals_count
      //     • flip status to 'paid_bonus_hit' at 5 refs
      //
      // The Friday cron (/api/crons/creator-payout-batch) drains
      // payable_friday_cents and ACHs the creator.
      //
      // amount_paid > 0 filters out $0 invoices (trial extensions, etc.) so
      // we only count real cash collected. Each profile column is set
      // exactly once â€” repeat invoices fall through.
      const promoCode = profile?.referred_by_promo_code ?? profile?.creator_referral_code
      const isFirstPaid = !profile?.first_paid_charge_at && invoice.amount_paid && invoice.amount_paid > 0
      const isSecondPaid = !!profile?.first_paid_charge_at && !profile?.second_paid_charge_at && invoice.amount_paid && invoice.amount_paid > 0

      if (profile?.user_id && promoCode && (isFirstPaid || isSecondPaid)) {
        try {
          // Find the creator by NEW promo_code first; fall back to legacy
          // free_trial_code for rows that predate the 2026-06-06 schema.
          let creatorQuery = await supabase
            .from('ig_creator_outreach')
            .select('id, pending_payout_cents, payable_friday_cents, paid_referrals_count, status')
            .eq('promo_code', promoCode)
            .maybeSingle()
          if (!creatorQuery.data) {
            creatorQuery = await supabase
              .from('ig_creator_outreach')
              .select('id, pending_payout_cents, payable_friday_cents, paid_referrals_count, status')
              .eq('free_trial_code', promoCode)
              .maybeSingle()
          }
          const creator = creatorQuery.data

          if (!creator) {
            console.warn(`[creator-payout] no creator found for code ${promoCode}`)
          } else if (isFirstPaid) {
            await supabase
              .from('profiles')
              .update({ first_paid_charge_at: new Date().toISOString() })
              .eq('user_id', profile.user_id)
            await supabase
              .from('ig_creator_outreach')
              .update({
                pending_payout_cents: (creator.pending_payout_cents ?? 0) + 20000,
                updated_at: new Date().toISOString(),
              })
              .eq('id', creator.id)
            console.log(`[creator-payout] PENDING +$200 to ${promoCode} (fan first paid charge)`)
          } else if (isSecondPaid) {
            const nextCount = (creator.paid_referrals_count ?? 0) + 1
            const shouldFlipBonus = nextCount >= 5 && creator.status === 'active_creator'
            await supabase
              .from('profiles')
              .update({ second_paid_charge_at: new Date().toISOString() })
              .eq('user_id', profile.user_id)
            await supabase
              .from('ig_creator_outreach')
              .update({
                pending_payout_cents: Math.max(0, (creator.pending_payout_cents ?? 0) - 20000),
                payable_friday_cents: (creator.payable_friday_cents ?? 0) + 20000,
                paid_referrals_count: nextCount,
                ...(shouldFlipBonus ? { status: 'paid_bonus_hit', bonus_paid_at: null } : {}),
                updated_at: new Date().toISOString(),
              })
              .eq('id', creator.id)
            console.log(`[creator-payout] PAYABLE +$200 to ${promoCode} (fan second paid charge) â€” total refs now ${nextCount}`)

            // â”€â”€ Founder text-line unlock at 5 paid refs (Hormozi loyalty hook) â”€â”€
            // Auto-SMS the creator with Peter's direct cell so top performers
            // feel like partners not affiliates. Fires once per creator.
            if (nextCount === 5) {
              try {
                const { data: creatorFull } = await supabase
                  .from('ig_creator_outreach')
                  .select('handle, notes')
                  .eq('id', creator.id)
                  .maybeSingle()
                // We don't have creator's own phone in ig_creator_outreach.
                // Look up via profiles where referred_by_promo_code points
                // back at this creator (if they signed up themselves with
                // their personal code) â€” that gives us their owner_phone.
                const { data: creatorProfile } = await supabase
                  .from('profiles')
                  .select('owner_phone, business_name')
                  .eq('referred_by_promo_code', (creatorFull as { handle?: string } | null)?.handle || '')
                  .maybeSingle()
                const phone = (creatorProfile as { owner_phone?: string } | null)?.owner_phone
                if (phone) {
                  const FOUNDER_CELL = process.env.FOUNDER_CELL ?? '+17737109565'
                  await twilioClient.messages.create({
                    body: `ðŸ”¥ 5 paid refs hit. $1K bonus on its way Friday. You're in the inner circle now â€” my personal cell: ${FOUNDER_CELL}. Text me anytime with what you need. Let's get you to 15. â€” Peter, BellAveGo`,
                    from: process.env.TWILIO_PHONE_NUMBER!,
                    to: phone,
                  })
                  await supabase
                    .from('ig_creator_outreach')
                    .update({
                      notes: ((creatorFull as { notes?: string } | null)?.notes || '') + ` | ${new Date().toISOString().slice(0,10)} founder-text unlocked at 5 refs`,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', creator.id)
                  console.log(`[founder-unlock] SMS sent to ${phone} for creator at 5 refs`)
                }
              } catch (e) {
                console.warn('[founder-unlock] failed:', (e as Error).message)
              }
            }
          }
        } catch (e) {
          console.error('[creator-payout] staging failed:', e)
        }
      }

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

      // â”€â”€ Customer-to-customer referral credit (pivot 2026-06-06) â”€â”€
      // When this paying customer was REFERRED by another paying customer
      // (profiles.referred_by points to another profile's referral_code),
      // credit the REFERRER's Stripe account w/ 1 month free ($497) on
      // their next invoice. One-time per referred customer, gated by
      // creator_referral_credited_at flag (same column reused â€” when set,
      // either IG creator OR customer referrer has been credited).
      const profileForReferrer = await supabase
        .from('profiles')
        .select('user_id, referred_by, creator_referral_credited_at')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()

      const refByCode = (profileForReferrer.data as { referred_by?: string | null } | null)?.referred_by
      const alreadyCredited = (profileForReferrer.data as { creator_referral_credited_at?: string | null } | null)?.creator_referral_credited_at
      if (
        refByCode &&
        !alreadyCredited &&
        invoice.amount_paid &&
        invoice.amount_paid > 0
      ) {
        try {
          // Find the REFERRER profile by their referral_code
          const { data: referrer } = await supabase
            .from('profiles')
            .select('user_id, stripe_customer_id')
            .eq('referral_code', refByCode)
            .maybeSingle()

          if (referrer?.stripe_customer_id) {
            // Credit referrer's Stripe balance with $497 (1 month off next invoice).
            // 2026-06-09: bumped 297 -> 497 to match v9 leads-only pricing.
            await stripe.customers.createBalanceTransaction(referrer.stripe_customer_id, {
              amount: -49700, // negative = credit (Stripe convention)
              currency: 'usd',
              description: `BellAveGo referral credit â€” 1 month free for referring a paid customer`,
            })
            // Stamp the credited flag so we don't double-credit on renewals
            await supabase
              .from('profiles')
              .update({ creator_referral_credited_at: new Date().toISOString() })
              .eq('user_id', (profileForReferrer.data as { user_id: string }).user_id)
            console.log(`[customer-referral] credited referrer ${referrer.user_id} $497 for new paid customer w/ code ${refByCode}`)
          } else {
            console.warn(`[customer-referral] no referrer found for code ${refByCode}`)
          }
        } catch (e) {
          console.error('[customer-referral] credit failed:', e)
        }
      }
    }
  }

  // â”€â”€ Payment failure â†’ pause service immediately + notify customer â”€â”€
  // Stripe will continue retrying the card for ~3 days. During that window
  // we previously left is_active=true, which meant calls kept being answered
  // (and minutes burned) by a delinquent customer. Now we flip is_active=false
  // right away â€” assistant-request returns the "service paused" message â€”
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
            `âš ï¸ Card declined â€” ${profile.business_name || profile.user_id} (${profile.plan_tier || '?'})\n\n` +
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

  // â”€â”€ customer.subscription.trial_will_end â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Stripe fires this 72 hours before the trial ends. Send the contractor
  // a heads-up SMS so the first charge isn't a surprise. Stripe also fires
  // its own default email if email is configured on the customer object.
  //
  // Only sent once per subscription (the event itself only fires once at
  // trial_end - 72h). No idempotency guard needed.
  if (event.type === 'customer.subscription.trial_will_end') {
    const subscription = event.data.object as Stripe.Subscription
    const customerId = subscription.customer as string

    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id, business_name, owner_phone, plan_tier')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    if (profile?.owner_phone) {
      // Compute the charge date in the contractor's local language. trial_end
      // is a Unix timestamp in seconds.
      const trialEnd = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : new Date(Date.now() + 72 * 60 * 60 * 1000)
      const trialEndLabel = trialEnd.toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
        timeZone: 'America/Chicago',
      })

      try {
        await twilioClient.messages.create({
          body:
            `Heads up â€” your 7-day BellAveGo free trial wraps up ${trialEndLabel}. ` +
            `Your first month bills automatically that day. ` +
            `Loving it? Do nothing. Want to cancel? Open your dashboard â†’ Settings â†’ Subscription before then. ` +
            `Questions: text Peter at (773) 710-9565.`,
          from: process.env.TWILIO_PHONE_NUMBER!,
          to: profile.owner_phone,
        })
        console.log(`[trial_will_end] notified ${profile.user_id} â€” trial ends ${trialEndLabel}`)
      } catch (e) {
        console.error('trial_will_end SMS failed:', e)
      }
    }
  }

  return NextResponse.json({ received: true })
}
