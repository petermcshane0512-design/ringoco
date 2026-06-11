import { redirect } from 'next/navigation'

/**
 * /pricing — KILLED 2026-06-10 per Peter.
 *
 * The pricing page was a second decision-point between "I want in" and
 * "swipe card." Every prospect who landed here had already decided on
 * the homepage; making them re-confirm the offer on a separate page
 * leaked conversion. Hormozi/Elon: every click before card-swipe = leak.
 *
 * New behavior: any visit to /pricing → /start/area. Same outcome,
 * one less screen. Promo code carried through via the query string so
 * cold-email links like /pricing?promo=FIRST400 still apply the
 * discount.
 *
 * The old /pricing component is preserved in git history (commit
 * 989511b series). Re-enable by reverting this file if a real reason
 * surfaces. Until then, this redirect is the single source of truth.
 */

type SP = Promise<{ promo?: string; ref?: string; b?: string }>

export default async function PricingRedirect({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  if (sp.promo) qs.set('promo', sp.promo)
  if (sp.ref) qs.set('ref', sp.ref)
  if (sp.b) qs.set('b', sp.b)
  redirect(`/start/area${qs.toString() ? `?${qs.toString()}` : ''}`)
}
