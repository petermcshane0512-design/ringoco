import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /ref/[code]
 *
 * Creator-tagged landing entry. Sets the `bavg_creator_code` attribution
 * cookie (180-day) + redirects to /pricing?creator=<code>&discount=200.
 * Stripe checkout reads the cookie, applies the personalized $400-off
 * promotion_code, and stamps `creator_code` on the subscription metadata.
 *
 * Accepted formats (2026-06-06 pivot):
 *   - PERSONALIZED  e.g. HVACMIKE, PLUMBERJON   (current)
 *     1-12 chars, A-Z + 0-9 only
 *   - LEGACY BAVG-XXXXXX (kept so old DMs still resolve)
 *
 * Anything else → graceful redirect to /pricing without cookie.
 *
 * Cookie max age: 180 days — Hormozi-recommended affiliate attribution
 * window (most paid signups happen within 30 days of first touch).
 */

// Personalized codes: uppercase, alphanumeric, 1-12 chars (mirrors
// vanityCodeFromHandle slice in src/lib/creatorCodes.ts).
const PERSONALIZED_REGEX = /^[A-Z0-9]{1,12}$/
const LEGACY_BAVG_REGEX = /^BAVG-[A-Z0-9]{6}$/

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params
  const code = (rawCode || '').toUpperCase()

  const isLegacy = LEGACY_BAVG_REGEX.test(code)
  const isPersonalized = PERSONALIZED_REGEX.test(code) && !isLegacy
  if (!isLegacy && !isPersonalized) {
    return NextResponse.redirect(new URL('/pricing', req.url))
  }

  const target = new URL('/pricing', req.url)
  target.searchParams.set('creator', code)
  target.searchParams.set('discount', '200')

  const res = NextResponse.redirect(target)
  res.cookies.set('bavg_creator_code', code, {
    maxAge: 180 * 24 * 60 * 60,
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
  })
  // 2026-06-09 fix: customer-to-customer refs (BAVG-XXXXXX) need a
  // SECOND cookie (`bavg_ref`) because /api/profile reads `bavg_ref`
  // (not `bavg_creator_code`) when populating `referred_by` on first
  // profile create. Without this the referral credit chain dies
  // silently. Personalized creator codes (HVACMIKE etc.) still flow
  // through the original `bavg_creator_code` cookie.
  if (isLegacy) {
    res.cookies.set('bavg_ref', code, {
      maxAge: 180 * 24 * 60 * 60,
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
    })
  }
  return res
}
