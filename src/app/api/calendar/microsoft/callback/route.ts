import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleMicrosoftOAuthCallback } from '@/lib/calendar/microsoft'
import { backfillProviderForUser } from '@/lib/calendar/syncOut'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL('/sign-in', req.url))

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')
  const errorDesc = url.searchParams.get('error_description')

  const target = new URL('/dashboard/calendar', req.url)

  if (error) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'microsoft')
    target.searchParams.set('reason', errorDesc?.slice(0, 80) || error)
    return NextResponse.redirect(target)
  }
  if (!code) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'microsoft')
    target.searchParams.set('reason', 'no_code')
    return NextResponse.redirect(target)
  }

  const [stateUserId, stateCsrf] = state.split(':')
  const cookieCsrf = req.cookies.get('cal_oauth_csrf_ms')?.value
  if (!stateUserId || !stateCsrf || stateUserId !== userId || stateCsrf !== cookieCsrf) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'microsoft')
    target.searchParams.set('reason', 'csrf_mismatch')
    return NextResponse.redirect(target)
  }

  const result = await handleMicrosoftOAuthCallback({ code, userId })
  if (!result.ok) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'microsoft')
    target.searchParams.set('reason', result.error.slice(0, 80))
    return NextResponse.redirect(target)
  }

  target.searchParams.set('calendar', 'connected')
  target.searchParams.set('provider', 'microsoft')
  if (result.email) target.searchParams.set('account', result.email)

  // BACKFILL — push every already-booked future appointment to the
  // newly-connected Outlook calendar so the contractor's phone shows
  // the AI's prior bookings immediately. Fire-and-forget; don't make
  // the redirect wait on potentially-slow Microsoft Graph calls.
  backfillProviderForUser({ userId, provider: 'microsoft' }).catch((e) => {
    console.warn('[microsoft/callback] backfill threw:', (e as Error).message)
  })

  const res = NextResponse.redirect(target)
  res.cookies.delete('cal_oauth_csrf_ms')
  return res
}
