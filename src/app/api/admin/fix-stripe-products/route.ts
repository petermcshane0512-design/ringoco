import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

/**
 * One-shot admin route — overwrites the name + description of the 3 BellAveGo
 * Stripe products with the 2026-06-06 single-tier Hormozi offer copy.
 *
 * Reason this exists: the live Stripe Checkout page was still showing the old
 * 7-day-trial / 300-calls description because the product object on Stripe
 * had not been touched. Updating from the dashboard is fine, but doing it via
 * API lets the same copy be re-applied later (e.g. after Stripe support
 * touches the product on our behalf).
 *
 * Auth: requireAdmin — either Clerk admin session or x-admin-secret header.
 * Idempotent: safe to re-POST.
 */
const UPDATES = [
  {
    id: 'prod_UVUw8kOSSqciIr',
    name: 'BellAveGo Starter',
    description:
      'AI receptionist answers every missed call in your business name. Lead captured + texted to your phone in 20 seconds. 30-day money-back guarantee.',
  },
  {
    id: 'prod_UVUwulTFFELqnk',
    name: 'BellAveGo',
    description:
      "Unlimited calls answered by your AI receptionist. 5 fresh neighborhood leads delivered every Monday — real homeowners in your service area with contact info + pitch script. Auto-booking, lead alerts, Google review manager, monthly revenue intelligence reports. 30-day money-back guarantee: if it doesn't pay for itself in 30 days, click cancel in your dashboard and we refund every penny.",
  },
  {
    id: 'prod_UVUwZwbvhdpRwR',
    name: 'BellAveGo Elite',
    description:
      'Everything in BellAveGo plus the full AI Marketing Operations stack — ad creative generator, permit + storm lead sourcing, competitor watcher, local SEO, custom CRM integrations, 4-hour priority SLA, direct founder access. 30-day money-back guarantee.',
  },
]

export async function POST() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const results: { id: string; ok: boolean; name?: string; error?: string }[] = []
  for (const u of UPDATES) {
    try {
      const updated = await stripe.products.update(u.id, {
        name: u.name,
        description: u.description,
      })
      results.push({ id: u.id, ok: true, name: updated.name ?? undefined })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ id: u.id, ok: false, error: msg })
    }
  }
  return NextResponse.json({ ok: true, results })
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const out: { id: string; name: string | null; description: string | null }[] = []
  for (const u of UPDATES) {
    try {
      const p = await stripe.products.retrieve(u.id)
      out.push({ id: u.id, name: p.name ?? null, description: p.description ?? null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      out.push({ id: u.id, name: null, description: `ERROR: ${msg}` })
    }
  }
  return NextResponse.json({ ok: true, products: out })
}
