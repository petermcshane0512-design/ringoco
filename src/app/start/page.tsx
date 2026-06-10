import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { extractUtmFromSearchParams, COOKIE_OPTS } from '@/lib/utm'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.ADMIN_API_SECRET || 'salt')).digest('hex').slice(0, 32)
}

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

type SP = Promise<{
  promo?: string
  ref?: string
  b?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
}>

export default async function StartPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const promo = (sp.promo || '').trim().toUpperCase()
  const ref = (sp.ref || '').trim()
  // 2026-06-09 — biz_id from /free-lead?b={biz_id} cold-email landing.
  // Cookied so it survives sign-up bounce, then read by checkout to
  // stamp Stripe metadata for prospect_free_leads attribution.
  const bizId = (sp.b || '').trim().slice(0, 64)

  // 2026-06-10 — T5 attribution. Capture UTM params at first touch
  // into cookies so we can stamp them on the profile at checkout.
  const h = await headers()
  const incomingUrl = h.get('x-url') || h.get('referer') || null
  const utmSp = new URLSearchParams()
  if (sp.utm_source)   utmSp.set('utm_source',   sp.utm_source)
  if (sp.utm_medium)   utmSp.set('utm_medium',   sp.utm_medium)
  if (sp.utm_campaign) utmSp.set('utm_campaign', sp.utm_campaign)
  if (sp.utm_term)     utmSp.set('utm_term',     sp.utm_term)
  if (sp.utm_content)  utmSp.set('utm_content',  sp.utm_content)
  const { cookies: utmCookies } = extractUtmFromSearchParams(utmSp, incomingUrl)
  if (utmCookies.length > 0) {
    const cookieStore = await cookies()
    for (const c of utmCookies) {
      cookieStore.set(c.name, c.value, COOKIE_OPTS)
    }
  }

  // 2026-06-08 — server-log every /start hit so we capture clicks Apple
  // Mail proxy strips from Instantly's tracking pixel. Non-blocking; never
  // fails the redirect even if supabase is down.
  try {
    const h = await headers()
    const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0]?.trim() || ''
    await supabase.from('outreach_link_clicks').insert({
      path: '/start',
      promo: promo || null,
      ref: ref || null,
      referer: h.get('referer') || null,
      user_agent: h.get('user-agent')?.slice(0, 500) || null,
      ip_hash: ip ? hashIp(ip) : null,
    })
  } catch { /* non-fatal */ }

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
  if (bizId) {
    const cookieStore = await cookies()
    cookieStore.set('bavg_biz_id', bizId, {
      httpOnly: false,         // /pricing reads + posts to checkout
      sameSite: 'lax',
      secure: true,
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    })
  }

  // 2026-06-10 — T3 territory gate. Redirect to /start/area instead of
  // /pricing so the prospect picks (zip, trade) BEFORE Stripe checkout.
  // /start/area checks territory availability + routes:
  //   open    → /pricing?zip=X&trade=Y (passed into Stripe metadata)
  //   taken   → waitlist email capture
  const qs = new URLSearchParams()
  if (promo) qs.set('promo', promo)
  if (ref) qs.set('ref', ref)
  if (bizId) qs.set('b', bizId)
  redirect(`/start/area${qs.toString() ? `?${qs.toString()}` : ''}`)
}
