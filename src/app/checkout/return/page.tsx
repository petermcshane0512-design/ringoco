import { redirect } from 'next/navigation'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { clerkClient } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { geocodeBusinessAddress } from '@/lib/geocodeBusinessAddress'

/**
 * /checkout/return?session_id={CHECKOUT_SESSION_ID}
 *
 * 2026-06-11 REWRITE — this page is now the SOURCE OF TRUTH for account
 * activation, not the Stripe webhook.
 *
 * Why: forensics on 2026-06-10/11 showed three PAID checkout sessions
 * whose subscriptions landed in ZERO profiles — the webhook handler was
 * dying somewhere before the profile upsert on every invocation, and
 * each new deploy changed the failure surface. Customers paid and got
 * an infinite scan spinner. Algorithm step 2: delete the dependency.
 *
 * Stripe redirects the customer HERE synchronously after payment. This
 * server component does everything activation needs, idempotently, in
 * the same request the customer is waiting on:
 *
 *   1. Retrieve the session, verify payment_status === 'paid'.
 *   2. Resolve the Clerk user: metadata.userId when the buyer was
 *      signed in; otherwise find-by-email or mint a new Clerk user
 *      (passwordless; phone attached when /start/area collected one).
 *   3. UPSERT the full paid profile: tier, is_active, zips, trade,
 *      address (+ inline geocode), phone, Stripe ids.
 *   4. Create a one-shot Clerk sign-in ticket and 302 the customer
 *      through Clerk's hosted ticket page → /dashboard/leads, signed in.
 *
 * The dashboard's kick + 5s poll then drives the first lead drop. The
 * Stripe webhook still runs in the background for extras (founder SMS,
 * territory bookkeeping, free-lead attribution) — every write here is
 * idempotent so double-execution is harmless.
 *
 * Failure posture: ANY step that throws falls through to the dashboard
 * redirect rather than a dead end. Worst case the customer signs in via
 * email and the ProfileGate + dashboard kick recover the rest.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type SP = Promise<{ session_id?: string }>

export default async function CheckoutReturnPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const sessionId = (sp.session_id || '').trim()

  if (!sessionId) {
    redirect('/dashboard/leads?welcome=1')
  }

  let signInTokenUrl: string | null = null

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    })

    if (session.payment_status !== 'paid') {
      console.warn(`[checkout/return] session ${sessionId} not paid (${session.payment_status}) — no activation`)
      redirect('/start/area')
    }

    const meta = session.metadata ?? {}
    const sub = session.subscription as Stripe.Subscription | null
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : sub?.id ?? null
    const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as Stripe.Customer | null)?.id ?? null
    const email = session.customer_details?.email?.trim().toLowerCase() ?? null

    // ── Resolve the Clerk user ─────────────────────────────────────────
    const cc = await clerkClient()
    let userId = meta.userId && !meta.userId.startsWith('anon_') ? meta.userId : null

    if (!userId && email) {
      const phoneDigits = (meta.owner_phone || '').replace(/\D/g, '')
      const phoneE164 = phoneDigits.length === 10 ? `+1${phoneDigits}`
        : phoneDigits.length === 11 && phoneDigits.startsWith('1') ? `+${phoneDigits}`
        : null
      const existing = await cc.users.getUserList({ emailAddress: [email] }).catch(() => null)
      if (existing?.data?.[0]) {
        userId = existing.data[0].id
      } else {
        try {
          const created = await cc.users.createUser({
            emailAddress: [email],
            ...(phoneE164 ? { phoneNumber: [phoneE164] } : {}),
            skipPasswordRequirement: true,
            skipPasswordChecks: true,
          })
          userId = created.id
        } catch (e) {
          // e.g. phone already on another user — retry without phone
          console.warn('[checkout/return] createUser failed, retrying email-only:', (e as Error).message)
          const created = await cc.users.createUser({
            emailAddress: [email],
            skipPasswordRequirement: true,
            skipPasswordChecks: true,
          })
          userId = created.id
        }
      }
    }

    if (!userId) {
      console.error(`[checkout/return] could not resolve user for session ${sessionId} (email=${email})`)
      redirect('/dashboard/leads?welcome=1&activation=pending')
    }

    // ── Seed the paid profile (idempotent upsert) ──────────────────────
    const businessAddress = (meta.business_address || '').trim()
    const ownerPhoneDigits = (meta.owner_phone || '').replace(/\D/g, '')
    const ownerPhoneE164 = ownerPhoneDigits.length === 10 ? `+1${ownerPhoneDigits}`
      : ownerPhoneDigits.length >= 11 ? `+${ownerPhoneDigits}`
      : null

    let geocoded: { lat: number; lng: number } | null = null
    if (businessAddress.length >= 8) {
      try {
        geocoded = await geocodeBusinessAddress(businessAddress)
      } catch { /* fail-soft; engine falls back to zip-radius */ }
    }

    const { error: upsertErr } = await supabase.from('profiles').upsert({
      user_id: userId,
      plan_tier: meta.tier || 'officemgr',
      is_active: true,
      setup_complete: true,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      ...(meta.territory_zip ? { service_zips: [meta.territory_zip] } : {}),
      ...(meta.territory_trade ? { business_type: meta.territory_trade, services_offered: meta.territory_trade } : {}),
      ...(businessAddress ? { business_address: businessAddress } : {}),
      ...(ownerPhoneE164 ? { owner_phone: ownerPhoneE164 } : {}),
      ...(geocoded ? {
        business_lat: geocoded.lat,
        business_lng: geocoded.lng,
        business_geocoded_at: new Date().toISOString(),
      } : {}),
      // paid_at REMOVED 2026-06-11 — the column does not exist on profiles
      // (T5 UTM migration never applied). Including it made Postgres reject
      // the ENTIRE upsert: activation "succeeded" (token minted, redirect
      // fired) while the profile silently stayed unseeded — the root of the
      // pay -> homepage -> redo-onboarding -> pay-again loop.
    }, { onConflict: 'user_id' })
    if (upsertErr) {
      console.error(`[checkout/return] profile upsert failed for ${userId}: ${upsertErr.message}`)
    } else {
      console.log(`[checkout/return] ACTIVATED ${userId} tier=${meta.tier} zip=${meta.territory_zip} trade=${meta.territory_trade} geocoded=${!!geocoded}`)
    }

    // ── Sign the customer in ───────────────────────────────────────────
    try {
      const token = await cc.signInTokens.createSignInToken({
        userId,
        expiresInSeconds: 60 * 60,
      })
      signInTokenUrl = (token as { url?: string }).url ?? null
    } catch (e) {
      console.warn('[checkout/return] sign-in token failed:', (e as Error).message)
    }
  } catch (e) {
    // redirect() throws NEXT_REDIRECT — let those through untouched.
    if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e
    console.error('[checkout/return] activation error:', (e as Error).message)
  }

  if (signInTokenUrl) {
    redirect(signInTokenUrl)
  }

  // Fallback: payment real, token missing. Dashboard recovers via the
  // ProfileGate + kick; middleware sends them to /sign-in if no session.
  redirect('/dashboard/leads?welcome=1&checkout_session=ok')
}
