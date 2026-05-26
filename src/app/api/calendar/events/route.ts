import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'
import { listGoogleEvents, type CalendarConnectionRow, type GoogleCalendarEvent } from '@/lib/calendar/google'
import { listMicrosoftEvents, type MicrosoftCalendarEvent } from '@/lib/calendar/microsoft'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/calendar/events?days=14
 *
 * Returns the signed-in contractor's upcoming calendar events from every
 * enabled provider connection (Google + Microsoft). Each event is normalized
 * into the same shape so the dashboard agenda view doesn't care which provider
 * sourced it.
 *
 * Tenant-scoped via effectiveAuth (admin impersonation aware).
 */
export type UnifiedCalendarEvent = (GoogleCalendarEvent | MicrosoftCalendarEvent) & {
  provider: 'google' | 'microsoft'
}

export async function GET(req: Request) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = Math.min(60, Math.max(1, parseInt(url.searchParams.get('days') || '14', 10)))

  const { data: conns } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)

  const connections = (conns ?? []) as CalendarConnectionRow[]
  if (connections.length === 0) {
    return NextResponse.json({ connected: false, events: [], windowDays: days })
  }

  const windowStart = new Date()
  const windowEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const eventsArrays = await Promise.all(
    connections.map(async (c): Promise<UnifiedCalendarEvent[]> => {
      if (c.provider === 'google') {
        const events = await listGoogleEvents({ connection: c, windowStart, windowEnd })
        return events.map((e) => ({ ...e, provider: 'google' as const }))
      }
      if (c.provider === 'microsoft') {
        const events = await listMicrosoftEvents({ connection: c, windowStart, windowEnd })
        return events.map((e) => ({ ...e, provider: 'microsoft' as const }))
      }
      return []
    }),
  )
  const events = eventsArrays.flat().sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  )

  return NextResponse.json({
    connected: true,
    events,
    windowDays: days,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  })
}
