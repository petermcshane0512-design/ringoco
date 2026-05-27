import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleGoogleOAuthCallback } from '@/lib/calendar/google'
import { backfillProviderForUser } from '@/lib/calendar/syncOut'

/**
 * Google's redirect target after the contractor approves the consent screen.
 * Verifies the CSRF state, exchanges the code for tokens, persists encrypted,
 * then bounces back to /dashboard/settings with a success flash.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')

  const settingsUrl = new URL('/dashboard/calendar', req.url)

  if (error) {
    settingsUrl.searchParams.set('calendar', 'error')
    settingsUrl.searchParams.set('reason', error)
    return NextResponse.redirect(settingsUrl)
  }
  if (!code) {
    settingsUrl.searchParams.set('calendar', 'error')
    settingsUrl.searchParams.set('reason', 'no_code')
    return NextResponse.redirect(settingsUrl)
  }

  // CSRF check — state is "<userId>:<csrf>" and we set csrf in cookie
  const [stateUserId, stateCsrf] = state.split(':')
  const cookieCsrf = req.cookies.get('cal_oauth_csrf')?.value
  if (!stateUserId || !stateCsrf || stateUserId !== userId || stateCsrf !== cookieCsrf) {
    settingsUrl.searchParams.set('calendar', 'error')
    settingsUrl.searchParams.set('reason', 'csrf_mismatch')
    return NextResponse.redirect(settingsUrl)
  }

  const result = await handleGoogleOAuthCallback({ code, userId })
  if (!result.ok) {
    settingsUrl.searchParams.set('calendar', 'error')
    settingsUrl.searchParams.set('reason', result.error.slice(0, 80))
    return NextResponse.redirect(settingsUrl)
  }

  settingsUrl.searchParams.set('calendar', 'connected')
  settingsUrl.searchParams.set('provider', 'google')
  if (result.email) settingsUrl.searchParams.set('account', result.email)

  // BACKFILL — fire-and-forget. Push every already-booked future
  // appointment to the newly-connected Google calendar so the
  // contractor sees their AI-booked jobs on their phone immediately
  // (not just bookings made from this moment forward). Not awaited:
  // user gets the redirect instantly while sync runs in the background.
  backfillProviderForUser({ userId, provider: 'google' }).catch((e) => {
    console.warn('[google/callback] backfill threw:', (e as Error).message)
  })

  const res = NextResponse.redirect(settingsUrl)
  res.cookies.delete('cal_oauth_csrf')
  return res
}
