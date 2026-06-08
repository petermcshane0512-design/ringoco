import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

/**
 * /start?promo=FIRST200
 *
 * Cold-email + IG-DM landing entry point. Captures the promo code into
 * an httpOnly cookie so the entire signup → pricing → checkout flow can
 * auto-apply it. Then redirects to /pricing where the customer picks tier.
 *
 * Why a cookie + redirect (vs. just passing the param through):
 *   - Pricing page is client-rendered + has sign-up auto-resume logic
 *     (see pricing/page.tsx:86-127). Cookie survives the Clerk sign-up
 *     bounce that would strip URL params.
 *   - Cookie expires in 14 days — captures the entire 3-step Instantly
 *     follow-up sequence window + a couple bonus days.
 */

type SP = Promise<{ promo?: string; ref?: string }>

export default async function StartPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const promo = (sp.promo || '').trim().toUpperCase()
  const ref = (sp.ref || '').trim()

  if (promo) {
    const cookieStore = await cookies()
    cookieStore.set('bavg_promo', promo, {
      httpOnly: false,        // pricing page reads this client-side
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 14,  // 14 days
      path: '/',
    })
  }
  if (ref) {
    const cookieStore = await cookies()
    cookieStore.set('bavg_ref', ref, {
      httpOnly: false,
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    })
  }

  // Send to pricing w/ promo in URL so banner shows + checkout sees it.
  const qs = new URLSearchParams()
  if (promo) qs.set('promo', promo)
  if (ref) qs.set('ref', ref)
  redirect(`/pricing${qs.toString() ? `?${qs.toString()}` : ''}`)
}
