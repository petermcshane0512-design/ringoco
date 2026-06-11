import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * /start — GUTTED to a zero-dependency redirect, 2026-06-11.
 *
 * The previous version did server-side work on every hit: Supabase
 * click-logging, UTM cookie writes via next/headers, IP hashing. It was
 * 500-ing in production (undiagnosable without runtime logs — see the
 * 2026-06-10 note in OpportunityChecker, which already bypassed it).
 * But the nav / footer / sticky-bar / exit-popup "$97" CTAs still
 * pointed here, so every one of those clicks hit the 500 page.
 *
 * Algorithm step 2: this route's only irreplaceable job is forwarding
 * the visitor (with their query params) to /start/area — which already
 * persists promo / ref / b / zip / trade to cookies CLIENT-side. So now
 * that is ALL this does. Zero imports beyond redirect(), zero env vars,
 * zero db, zero headers() — nothing left that can throw.
 *
 * Dropped (acceptable losses, can rebuild client-side later if missed):
 *   - outreach_link_clicks server logging (Instantly click tracking
 *     still covers cold-email attribution)
 *   - UTM cookie capture (T5 attribution) — utm params still pass
 *     through in the URL below if /start/area ever wants them.
 */

type SP = Promise<Record<string, string | string[] | undefined>>

export default async function StartRedirect({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v
    if (val) qs.set(k, val)
  }
  redirect(`/start/area${qs.toString() ? `?${qs.toString()}` : ''}`)
}
