import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'
import { listCronofyEvents, type CalendarEvent } from '@/lib/calendar/cronofy'
import type { CalendarConnectionRow } from '@/lib/calendar/google'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/calendar/events?days=14
 *
 * Returns the signed-in contractor's upcoming calendar events from every
 * enabled provider connection (currently Cronofy = all in one).
 *
 * Tenant-scoped via effectiveAuth (admin impersonation aware).
 */
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

  // For now we only support Cronofy here. Direct OAuth providers (kept around
  // for fallback) don't have an events fetcher wired into this endpoint yet.
  const windowStart = new Date()
  const windowEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const eventsArrays = await Promise.all(
    connections.map(async (c) => {
      if (c.provider === 'cronofy') {
        return await listCronofyEvents({ connection: c, windowStart, windowEnd })
      }
      return [] as CalendarEvent[]
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
