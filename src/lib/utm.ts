/**
 * UTM capture helpers — T5 of offer-rebuild plan (2026-06-10).
 *
 * Server-side (called from /start route): read utm_* params from the
 * request, set httpOnly cookies that survive the Clerk sign-up bounce,
 * stamp profile UTM fields on the first request that knows a user_id.
 *
 * Client-side: trivial — the cookies are non-httpOnly for utm_source +
 * utm_medium so analytics widgets can read them. The other UTM fields
 * are server-only.
 *
 * Stripe metadata limit is 40 fields × 500 chars each — well above what
 * we forward (5 utm fields + first_touch_url), so no truncation needed.
 */

export const UTM_COOKIE_KEYS = [
  'bavg_utm_source',
  'bavg_utm_medium',
  'bavg_utm_campaign',
  'bavg_utm_term',
  'bavg_utm_content',
  'bavg_first_touch_url',
  'bavg_first_touch_at',
] as const

export type UtmFields = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  first_touch_url: string | null
  first_touch_at: string | null
}

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90 // 90 days

/**
 * Build cookie spec objects from a request's URLSearchParams.
 * Returns the list of cookies that should be set + the canonical UTM
 * object that can also be stamped into a profile.
 *
 * Caller is responsible for setting the cookies via next/headers
 * `cookies()` API (server components) or NextResponse.cookies.set
 * (route handlers). This helper stays framework-agnostic.
 */
export function extractUtmFromSearchParams(
  sp: URLSearchParams,
  currentUrl: string | null,
): { cookies: { name: string; value: string }[]; utm: UtmFields } {
  const utm: UtmFields = {
    utm_source: sp.get('utm_source')?.slice(0, 100) || null,
    utm_medium: sp.get('utm_medium')?.slice(0, 100) || null,
    utm_campaign: sp.get('utm_campaign')?.slice(0, 100) || null,
    utm_term: sp.get('utm_term')?.slice(0, 100) || null,
    utm_content: sp.get('utm_content')?.slice(0, 100) || null,
    first_touch_url: currentUrl?.slice(0, 500) || null,
    first_touch_at: new Date().toISOString(),
  }
  const cookies: { name: string; value: string }[] = []
  if (utm.utm_source)   cookies.push({ name: 'bavg_utm_source',   value: utm.utm_source })
  if (utm.utm_medium)   cookies.push({ name: 'bavg_utm_medium',   value: utm.utm_medium })
  if (utm.utm_campaign) cookies.push({ name: 'bavg_utm_campaign', value: utm.utm_campaign })
  if (utm.utm_term)     cookies.push({ name: 'bavg_utm_term',     value: utm.utm_term })
  if (utm.utm_content)  cookies.push({ name: 'bavg_utm_content',  value: utm.utm_content })
  if (utm.first_touch_url) cookies.push({ name: 'bavg_first_touch_url', value: utm.first_touch_url })
  cookies.push({ name: 'bavg_first_touch_at', value: utm.first_touch_at })
  return { cookies, utm }
}

export const COOKIE_OPTS = {
  httpOnly: false,
  sameSite: 'lax' as const,
  secure: true,
  maxAge: COOKIE_MAX_AGE_SECONDS,
  path: '/',
}

/**
 * Read UTM cookies from a request's cookie header. Used by the
 * /api/stripe/checkout route to forward UTM to Stripe metadata.
 */
export function readUtmFromCookieMap(get: (name: string) => string | undefined): UtmFields {
  return {
    utm_source:      get('bavg_utm_source')      ?? null,
    utm_medium:      get('bavg_utm_medium')      ?? null,
    utm_campaign:    get('bavg_utm_campaign')    ?? null,
    utm_term:        get('bavg_utm_term')        ?? null,
    utm_content:     get('bavg_utm_content')     ?? null,
    first_touch_url: get('bavg_first_touch_url') ?? null,
    first_touch_at:  get('bavg_first_touch_at')  ?? null,
  }
}

/**
 * Compact UTM into Stripe metadata. Stripe caps each metadata value at
 * 500 chars + max 40 keys, so we use short keys.
 */
export function utmToStripeMetadata(utm: UtmFields): Record<string, string> {
  const out: Record<string, string> = {}
  if (utm.utm_source)      out.utm_source      = utm.utm_source.slice(0, 250)
  if (utm.utm_medium)      out.utm_medium      = utm.utm_medium.slice(0, 250)
  if (utm.utm_campaign)    out.utm_campaign    = utm.utm_campaign.slice(0, 250)
  if (utm.utm_term)        out.utm_term        = utm.utm_term.slice(0, 250)
  if (utm.utm_content)     out.utm_content     = utm.utm_content.slice(0, 250)
  if (utm.first_touch_url) out.first_touch_url = utm.first_touch_url.slice(0, 250)
  if (utm.first_touch_at)  out.first_touch_at  = utm.first_touch_at
  return out
}
