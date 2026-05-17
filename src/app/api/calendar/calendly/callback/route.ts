import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { handleCalendlyOAuthCallback } from '@/lib/calendar/calendly'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL('/sign-in', req.url))

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') || ''
  const error = url.searchParams.get('error')

  const target = new URL('/dashboard/calendar', req.url)

  if (error) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'calendly')
    target.searchParams.set('reason', error)
    return NextResponse.redirect(target)
  }
  if (!code) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'calendly')
    target.searchParams.set('reason', 'no_code')
    return NextResponse.redirect(target)
  }

  const [stateUserId, stateCsrf] = state.split(':')
  const cookieCsrf = req.cookies.get('cal_oauth_csrf_calendly')?.value
  if (!stateUserId || !stateCsrf || stateUserId !== userId || stateCsrf !== cookieCsrf) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'calendly')
    target.searchParams.set('reason', 'csrf_mismatch')
    return NextResponse.redirect(target)
  }

  const result = await handleCalendlyOAuthCallback({ code, userId })
  if (!result.ok) {
    target.searchParams.set('calendar', 'error')
    target.searchParams.set('provider', 'calendly')
    target.searchParams.set('reason', result.error.slice(0, 80))
    return NextResponse.redirect(target)
  }

  target.searchParams.set('calendar', 'connected')
  target.searchParams.set('provider', 'calendly')
  if (result.email) target.searchParams.set('account', result.email)

  const res = NextResponse.redirect(target)
  res.cookies.delete('cal_oauth_csrf_calendly')
  return res
}
