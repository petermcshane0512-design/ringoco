import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

/**
 * POST /api/stripe/cancel-and-refund
 *
 * Honors the pricing-page guarantee: "5 jobs in 30 days OR full refund â€”
 * one click cancel from your dashboard." This is the one click.
 *
 * Behavior:
 *   1. Look up customer's subscription via profiles.stripe_subscription_id
 *   2. Cancel the subscription IMMEDIATELY (Stripe `cancel()`, not period-end)
 *   3. If this is within 30 days of first paid charge â†’ issue full refund
 *      of the most recent paid invoice
 *   4. Flip profiles.is_active = false, plan_tier = 'cancelled'
 *   5. Vapi assistant returns "service paused" message on any future call
 *
 * Outside 30-day window:
 *   - Cancellation still fires (no charge on next renewal)
 *   - No refund issued (returns 200 with refund_issued: false)
 *
 * Body params: { reason?: string } â€” captured for analytics
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const GUARANTEE_WINDOW_DAYS = 30

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { reason?: string }
  try { body = await req.json() } catch { body = {} }
  const reason = (body.reason || '').slice(0, 500)

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, stripe_subscription_id, stripe_customer_id, plan_tier, created_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: 'no active subscription' }, { status: 404 })
  }

  // Cancel the subscription immediately (not period-end)
  let cancelled = false
  try {
    await stripe.subscriptions.cancel(profile.stripe_subscription_id, {
      invoice_now: false,
      prorate: false,
    })
    cancelled = true
  } catch (e) {
    console.error('[cancel-and-refund] subscription cancel err:', e)
    return NextResponse.json({ error: 'failed to cancel subscription' }, { status: 502 })
  }

  // Decide refund: most recent paid invoice + within 30d of FIRST charge
  let refund_issued = false
  let refund_amount_cents = 0
  let refund_id: string | null = null
  let outside_window = false

  try {
    // Pull recent paid invoices for this customer
    const invoices = await stripe.invoices.list({
      customer: profile.stripe_customer_id!,
      status: 'paid',
      limit: 10,
    })

    if (invoices.data.length === 0) {
      // Trial-only customer â€” nothing to refund. Cancel was enough.
      outside_window = false
    } else {
      // Find FIRST paid invoice to anchor 30-day window
      const sortedByDate = [...invoices.data].sort((a, b) => (a.created || 0) - (b.created || 0))
      const firstPaidInvoice = sortedByDate[0]
      const firstPaidAt = firstPaidInvoice.created || 0
      const ageSeconds = Math.floor(Date.now() / 1000) - firstPaidAt
      const ageDays = ageSeconds / (24 * 60 * 60)

      if (ageDays > GUARANTEE_WINDOW_DAYS) {
        outside_window = true
      } else {
        // Refund THE MOST RECENT paid invoice via payment_intent
        // (Stripe API 2026-04 removed invoice.charge â†’ use payment_intent).
        const latestPaid = invoices.data[0] as Stripe.Invoice & { payment_intent?: string | null }
        const paymentIntentId = latestPaid.payment_intent ?? null
        if (paymentIntentId && latestPaid.amount_paid > 0) {
          const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
            metadata: {
              userId,
              guarantee: 'pricing_page_30d',
              user_reason: reason,
            },
          })
          refund_issued = true
          refund_amount_cents = latestPaid.amount_paid
          refund_id = refund.id
        }
      }
    }
  } catch (e) {
    console.error('[cancel-and-refund] refund flow err:', e)
    // Don't fail the request â€” cancel already succeeded.
  }

  // Flip profile inactive + stamp refund details
  try {
    const updates: Record<string, unknown> = {
      is_active: false,
      plan_tier: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason || null,
      updated_at: new Date().toISOString(),
    }
    if (refund_issued) {
      updates.refund_issued_at = new Date().toISOString()
      updates.refund_amount_cents = refund_amount_cents
    }
    await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', userId)
  } catch (e) {
    console.error('[cancel-and-refund] profile update err:', e)
  }

  return NextResponse.json({
    ok: true,
    cancelled,
    refund_issued,
    refund_amount_cents,
    refund_id,
    outside_window,
    message: refund_issued
      ? `Refund of $${(refund_amount_cents / 100).toFixed(2)} issued. Subscription cancelled.`
      : outside_window
      ? 'Cancelled. Outside 30-day guarantee window â€” no refund issued.'
      : 'Cancelled. No paid invoice to refund.',
  })
}
