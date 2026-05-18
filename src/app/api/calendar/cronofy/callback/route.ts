import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleCronofyOAuthCallback } from '@/lib/calendar/cronofy'

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
    target.searchParams.set('provider', 'cronofy')
    target.searchParams.set('reason', (errorDesc || error).slice(0, 80))
    return NextResponse.redirect(target)
  }
  if (!code) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'cronofy')
    target.searchParams.set('reason', 'no_code')
    return NextResponse.redirect(target)
  }

  const [stateUserId, stateCsrf] = state.split(':')
  const cookieCsrf = req.cookies.get('cal_oauth_csrf_cronofy')?.value
  if (!stateUserId || !stateCsrf || stateUserId !== userId || stateCsrf !== cookieCsrf) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'cronofy')
    target.searchParams.set('reason', 'csrf_mismatch')
    return NextResponse.redirect(target)
  }

  let result
  try {
    result = await handleCronofyOAuthCallback({ code, userId })
  } catch (e) {
    // Catch-all so we surface the actual error on the dashboard instead of a
    // raw 500 page. Most likely cause when this fires: missing env var
    // (CALENDAR_TOKEN_ENCRYPTION_KEY) or a DB constraint failure.
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'cronofy')
    target.searchParams.set('reason', `unexpected: ${(e as Error).message.slice(0, 80)}`)
    return NextResponse.redirect(target)
  }
  if (!result.ok) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'cronofy')
    target.searchParams.set('reason', result.error.slice(0, 80))
    return NextResponse.redirect(target)
  }

  target.searchParams.set('calendar', 'connected')
  target.searchParams.set('provider', 'cronofy')
  if (result.provider) target.searchParams.set('underlying', result.provider)
  if (result.email) target.searchParams.set('account', result.email)

  const res = NextResponse.redirect(target)
  res.cookies.delete('cal_oauth_csrf_cronofy')
  return res
}
