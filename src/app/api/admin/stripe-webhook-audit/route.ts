import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * Stripe webhook event audit + auto-enable.
 *
 *   GET  /api/admin/stripe-webhook-audit  → diagnose only
 *   POST /api/admin/stripe-webhook-audit  → diagnose + auto-add missing events
 *
 * Required header: x-admin-secret: $ADMIN_API_SECRET
 *
 * Why this exists: the webhook handler in /api/stripe/webhook handles 6
 * event types, but a webhook endpoint in Stripe Dashboard only fires the
 * events listed in its `enabled_events` array. If trial_will_end is not
 * in that array, the day-5 SMS to the customer silently never fires and
 * they get surprise-charged on day 8 → chargebacks.
 *
 * This route lists every webhook endpoint pointing at bellavego.com,
 * checks each one's enabled_events covers all 6 required types, and on
 * POST adds any missing types. Idempotent. Safe to run repeatedly.
 */
const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
  'customer.subscription.trial_will_end',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

type EndpointReport = {
  id: string
  url: string
  status: string
  livemode: boolean
  enabled_events_count: number
  wildcard: boolean
  missing_events: string[]
  ok: boolean
}

async function audit(): Promise<{ endpoints: EndpointReport[]; warnings: string[] }> {
  const warnings: string[] = []
  const endpoints: EndpointReport[] = []
  let cursor: string | undefined
  do {
    const page = await stripe.webhookEndpoints.list({ limit: 100, starting_after: cursor })
    for (const ep of page.data) {
      const wildcard = ep.enabled_events.includes('*')
      const missing = wildcard
        ? []
        : REQUIRED_EVENTS.filter((evt) => !ep.enabled_events.includes(evt))
      endpoints.push({
        id: ep.id,
        url: ep.url,
        status: ep.status,
        livemode: ep.livemode,
        enabled_events_count: ep.enabled_events.length,
        wildcard,
        missing_events: missing,
        ok: missing.length === 0,
      })
    }
    cursor = page.has_more ? page.data[page.data.length - 1]?.id : undefined
  } while (cursor)

  const livemode = endpoints.filter((e) => e.livemode)
  const bellavego = livemode.filter((e) => e.url.includes('bellavego.com'))
  if (bellavego.length === 0) {
    warnings.push(
      'No live-mode webhook endpoint pointing at bellavego.com — production webhooks are not flowing. Add one in Stripe Dashboard → Webhooks → Add endpoint, target https://www.bellavego.com/api/stripe/webhook.',
    )
  }
  for (const ep of bellavego) {
    if (ep.status !== 'enabled') warnings.push(`Endpoint ${ep.id} is ${ep.status} — Stripe will not deliver events to it. Re-enable in Stripe Dashboard.`)
  }

  return { endpoints, warnings }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  try {
    const { endpoints, warnings } = await audit()
    return NextResponse.json({
      ok: endpoints.every((e) => e.ok) && warnings.length === 0,
      required_events: REQUIRED_EVENTS,
      endpoints,
      warnings,
    })
  } catch (e) {
    const err = e as Error
    console.error('[stripe-webhook-audit] GET failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  void req
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  try {
    const { endpoints: before, warnings } = await audit()
    const fixes: Array<{ id: string; url: string; added: string[] }> = []

    for (const ep of before) {
      if (ep.ok) continue
      if (!ep.livemode) continue // skip test-mode endpoints; only fix prod
      if (!ep.url.includes('bellavego.com')) continue // never touch endpoints we don't own

      const existing = await stripe.webhookEndpoints.retrieve(ep.id)
      const merged = Array.from(
        new Set([...existing.enabled_events, ...ep.missing_events]),
      ) as Stripe.WebhookEndpointUpdateParams.EnabledEvent[]
      await stripe.webhookEndpoints.update(ep.id, { enabled_events: merged })
      fixes.push({ id: ep.id, url: ep.url, added: ep.missing_events })
    }

    const { endpoints: after } = await audit()

    return NextResponse.json({
      ok: after.filter((e) => e.url.includes('bellavego.com') && e.livemode).every((e) => e.ok),
      required_events: REQUIRED_EVENTS,
      fixes_applied: fixes,
      before_summary: before.map((e) => ({ id: e.id, url: e.url, missing: e.missing_events })),
      after_summary: after.map((e) => ({ id: e.id, url: e.url, missing: e.missing_events })),
      warnings,
    })
  } catch (e) {
    const err = e as Error
    console.error('[stripe-webhook-audit] POST failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  void req
}
