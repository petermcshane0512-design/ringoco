import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { createClient } from '@supabase/supabase-js'
import { PRICE_TO_TIER, type Tier } from '@/lib/pricing'

/**
 * Nightly Stripe â†” Supabase reconciliation cron.
 *
 * Why this exists: webhook deliveries can fail (Vercel cold-starts, transient
 * 502s, Stripe retry exhaustion after 3 days). When a webhook misses, the
 * profile state drifts from Stripe truth:
 *   - Stripe cancelled but DB says is_active=true â†’ customer keeps service
 *     they shouldn't have
 *   - Stripe active but DB says is_active=false  â†’ customer paid but sees
 *     activation banner
 *   - Tier downgraded in Stripe but DB still on old tier â†’ wrong feature gate
 *
 * Solution: a daily sweep that pulls every Supabase profile with a
 * stripe_subscription_id, fetches the live Stripe sub, and corrects any
 * is_active / plan_tier drift. Cron schedule lives in vercel.json.
 *
 * Auth: Vercel cron header (Vercel signs every cron invocation). Public
 * route blocked by Clerk middleware unless `/api/crons/*` is in the public
 * matcher (it already is per middleware.ts).
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: Request) {
  // Auth: Vercel cron signs every cron invocation with x-vercel-cron header.
  // Also accept x-admin-secret for manual curl from Peter's terminal.
  // Without ONE of these, reject â€” prevents anyone from spamming this
  // endpoint and burning Stripe API quota.
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expectedSecret = process.env.ADMIN_API_SECRET
  const isAdminAuthed =
    !!expectedSecret && !!adminSecret && adminSecret === expectedSecret
  if (!isVercelCron && !isAdminAuthed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY not set' }, { status: 500 })
  }

  // Pull every profile that's ever had a Stripe subscription. Includes
  // currently-cancelled rows so we can detect "Stripe reactivated but our
  // DB never got the webhook" cases (rare but real).
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('user_id, business_name, stripe_subscription_id, plan_tier, is_active')
    .not('stripe_subscription_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{
    user_id: string
    business: string | null
    action: 'no_change' | 'corrected' | 'sub_gone' | 'error'
    detail: string
  }> = []

  for (const row of profiles ?? []) {
    const p = row as {
      user_id: string
      business_name: string | null
      stripe_subscription_id: string
      plan_tier: string | null
      is_active: boolean | null
    }

    try {
      const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id)
      const subStatus = sub.status
      const stripeActive =
        subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due'
      const stripeCancelled =
        subStatus === 'canceled' || subStatus === 'incomplete_expired'

      // Map Stripe price â†’ our tier slug
      const currentPriceId = sub.items.data[0]?.price.id
      const stripeTier: Tier | undefined = currentPriceId
        ? PRICE_TO_TIER[currentPriceId]?.tier
        : undefined

      const updates: Record<string, unknown> = {}
      const changes: string[] = []

      // is_active correction
      if (stripeActive && p.is_active !== true) {
        updates.is_active = true
        changes.push(`is_active: ${p.is_active} â†’ true`)
      }
      if (stripeCancelled && p.is_active !== false) {
        updates.is_active = false
        updates.plan_tier = 'cancelled'
        changes.push(`is_active: ${p.is_active} â†’ false`)
        changes.push(`plan_tier: ${p.plan_tier} â†’ cancelled`)
      }

      // plan_tier correction (only when subscription is alive)
      if (stripeActive && stripeTier && p.plan_tier !== stripeTier) {
        updates.plan_tier = stripeTier
        changes.push(`plan_tier: ${p.plan_tier} â†’ ${stripeTier}`)
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('user_id', p.user_id)
        results.push({
          user_id: p.user_id,
          business: p.business_name,
          action: 'corrected',
          detail: `${subStatus} â€” ${changes.join('; ')}`,
        })
        console.log(`[stripe-reconcile] ${p.user_id} corrected: ${changes.join('; ')}`)
      } else {
        results.push({
          user_id: p.user_id,
          business: p.business_name,
          action: 'no_change',
          detail: `${subStatus} ${stripeTier ?? '?'} â€” already in sync`,
        })
      }
    } catch (e) {
      const err = e as { code?: string; message?: string; statusCode?: number }
      // 404 = sub literally doesn't exist in Stripe anymore (manually deleted
      // out of band, or test-mode/live-mode mismatch). Mark cancelled so we
      // don't keep retrying every night.
      if (err.code === 'resource_missing' || err.statusCode === 404) {
        await supabase
          .from('profiles')
          .update({
            stripe_subscription_id: null,
            is_active: false,
            plan_tier: 'cancelled',
          })
          .eq('user_id', p.user_id)
        results.push({
          user_id: p.user_id,
          business: p.business_name,
          action: 'sub_gone',
          detail: 'Stripe subscription no longer exists â€” cleared',
        })
      } else {
        results.push({
          user_id: p.user_id,
          business: p.business_name,
          action: 'error',
          detail: err.message || 'unknown',
        })
        console.error(`[stripe-reconcile] ${p.user_id} error:`, err.message)
      }
    }
  }

  const corrected = results.filter((r) => r.action === 'corrected').length
  const noChange = results.filter((r) => r.action === 'no_change').length
  const subGone = results.filter((r) => r.action === 'sub_gone').length
  const errored = results.filter((r) => r.action === 'error').length

  return NextResponse.json({
    ok: true,
    scanned: results.length,
    corrected,
    no_change: noChange,
    sub_gone: subGone,
    errors: errored,
    details: results,
  })
}
