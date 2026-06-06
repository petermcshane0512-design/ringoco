import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * GET /r/[code]
 *
 * Creator-tagged landing entry. Sets the `bavg_creator_code` attribution
 * cookie (180-day) + redirects to /pricing?creator=<code>. Stripe
 * checkout route reads the cookie + extends trial to 14 days for code
 * holders. Customer signup → /api/stripe/webhook attributes the
 * referral to the creator via metadata.creator_code.
 *
 * Code format: BAVG-XXXXXX (6 alphanumeric). Anything else = 404.
 *
 * Cookie max age: 180 days (Hormozi recommends 90-180 day attribution
 * windows for affiliate programs — most paid signups happen within 30
 * days of first touch).
 */

const CODE_REGEX = /^BAVG-[A-Z0-9]{6}$/

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await params
  const code = (rawCode || '').toUpperCase()

  if (!CODE_REGEX.test(code)) {
    // Invalid code format → send to public pricing (no trial)
    return NextResponse.redirect(new URL('/pricing', req.url))
  }

  const target = new URL('/pricing', req.url)
  target.searchParams.set('creator', code)
  target.searchParams.set('trial', '14')

  const res = NextResponse.redirect(target)
  res.cookies.set('bavg_creator_code', code, {
    maxAge: 180 * 24 * 60 * 60,
    httpOnly: false, // readable client-side so checkout JS can grab it
    sameSite: 'lax',
    path: '/',
  })
  return res
}
