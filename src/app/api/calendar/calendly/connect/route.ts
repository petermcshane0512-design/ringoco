import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import crypto from 'crypto'
import { buildCalendlyAuthUrl } from '@/lib/calendar/calendly'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const csrf = crypto.randomBytes(16).toString('hex')
  let url: string
  try {
    url = buildCalendlyAuthUrl(userId, csrf)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const res = NextResponse.redirect(url)
  res.cookies.set('cal_oauth_csrf_calendly', csrf, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
