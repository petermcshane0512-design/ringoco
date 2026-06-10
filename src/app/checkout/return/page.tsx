import { redirect } from 'next/navigation'
import Stripe from 'stripe'

/**
 * /checkout/return?session_id={CHECKOUT_SESSION_ID}
 *
 * Frictionless-checkout return target (per Peter 2026-06-10). Stripe
 * sends every successful checkout here. Two paths:
 *
 *   1. Authed flow (Clerk session already exists)
 *      → just redirect to /dashboard/leads?welcome=1
 *
 *   2. Anonymous flow (account created post-payment by webhook)
 *      → read sign-in token URL stashed on subscription metadata by
 *        the webhook, redirect to it. Clerk's hosted ticket page
 *        completes the session then forwards to /dashboard/leads.
 *
 * Webhook runs before Stripe redirects the user — race is fine because
 * Stripe waits for the webhook 200-OK before issuing the success
 * redirect on hosted-checkout return. If webhook fails, this page
 * still degrades to "Payment complete — check your email for the login
 * link" (no client-side blank screen).
 *
 * Server component — no client-side Stripe SDK, no token exposed in
 * client JS. Token lives only in 302 Location header.
 */

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

type SP = Promise<{ session_id?: string }>

export default async function CheckoutReturnPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const sessionId = (sp.session_id || '').trim()

  // No session_id (someone hit the URL directly) → just send them home.
  if (!sessionId) {
    redirect('/dashboard/leads?welcome=1')
  }

  let signInTokenUrl: string | null = null
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    })
    const sub = session.subscription as Stripe.Subscription | null
    const cust = session.customer as Stripe.Customer | null
    signInTokenUrl =
      (sub?.metadata?.signin_token_url as string | undefined) ||
      (cust?.metadata?.signin_token_url as string | undefined) ||
      null
  } catch (e) {
    console.warn('[checkout/return] session retrieve failed:', (e as Error).message)
  }

  if (signInTokenUrl) {
    redirect(signInTokenUrl)
  }

  // Fallback — payment is real, session-creation race or token-missing.
  // Land them on dashboard; if their Clerk session isn't set, middleware
  // bounces to /sign-in, which is the legacy flow. They paid, they have
  // an account, they can recover via email + password reset.
  redirect('/dashboard/leads?welcome=1&checkout_session=ok')
}
