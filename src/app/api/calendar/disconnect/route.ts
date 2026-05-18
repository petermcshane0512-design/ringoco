import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { disconnectGoogleCalendar } from '@/lib/calendar/google'
import { disconnectMicrosoftCalendar } from '@/lib/calendar/microsoft'
import { disconnectCalendly } from '@/lib/calendar/calendly'
import { disconnectCronofy } from '@/lib/calendar/cronofy'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { provider?: string }
  const provider = (body.provider || 'cronofy').toLowerCase()

  if (provider === 'cronofy')   return NextResponse.json(await disconnectCronofy(userId))
  if (provider === 'google')    return NextResponse.json(await disconnectGoogleCalendar(userId))
  if (provider === 'microsoft') return NextResponse.json(await disconnectMicrosoftCalendar(userId))
  if (provider === 'calendly')  return NextResponse.json(await disconnectCalendly(userId))

  return NextResponse.json({ error: `Provider "${provider}" not supported yet` }, { status: 400 })
}
