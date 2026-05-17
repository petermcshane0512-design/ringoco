import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import crypto from 'crypto'
import { buildGoogleAuthUrl } from '@/lib/calendar/google'

/**
 * Kicks off Google Calendar OAuth.
 * Stores a CSRF token in a short-lived cookie and includes it in the OAuth
 * state param so the callback can verify the round-trip wasn't tampered with.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const csrf = crypto.randomBytes(16).toString('hex')
  let url: string
  try {
    url = buildGoogleAuthUrl(userId, csrf)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const res = NextResponse.redirect(url)
  res.cookies.set('cal_oauth_csrf', csrf, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',  // 'lax' lets the cookie travel on the Google redirect back
    maxAge: 600,      // 10 min
    path: '/',
  })
  return res
}
