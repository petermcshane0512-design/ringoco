import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { disconnectGoogleCalendar } from '@/lib/calendar/google'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { provider?: string }
  const provider = (body.provider || 'google').toLowerCase()

  if (provider === 'google') {
    const r = await disconnectGoogleCalendar(userId)
    return NextResponse.json(r)
  }

  return NextResponse.json({ error: `Provider "${provider}" not supported yet` }, { status: 400 })
}
