import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'
import { listGoogleEvents, type CalendarConnectionRow, type GoogleCalendarEvent } from '@/lib/calendar/google'
import { listMicrosoftEvents, type MicrosoftCalendarEvent } from '@/lib/calendar/microsoft'
import { listAppointments } from '@/lib/calendar/appointments'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * GET /api/calendar/events?days=14
 *
 * Returns the signed-in contractor's upcoming appointments. ALWAYS includes
 * the native BellAveGo calendar (jobs table — AI bookings + manual entries +
 * block time). ADDITIONALLY merges Google / Microsoft events for any
 * external calendars the contractor has connected as sync sources.
 *
 * The dashboard agenda + month/week/day calendar grid both read this. Native
 * events show as 'native' provider and are styled distinctly; AI-booked
 * native events have isBellaveGo=true so they render in the brand orange.
 *
 * Tenant-scoped via effectiveAuth (admin impersonation aware).
 */
export type UnifiedCalendarEvent = (
  | (GoogleCalendarEvent & { provider: 'google' })
  | (MicrosoftCalendarEvent & { provider: 'microsoft' })
  | {
      provider: 'native'
      id: string
      summary: string
      description?: string
      location?: string
      start: string
      end: string
      allDay: boolean
      status?: 'confirmed' | 'tentative' | 'cancelled'
      isBellaveGo: boolean
      blockType?: 'job' | 'block' | 'lunch' | 'vacation' | 'personal'
      customerName?: string | null
      customerPhone?: string | null
      jobType?: string | null
      colorTag?: string | null
    }
)

export async function GET(req: Request) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const days = Math.min(120, Math.max(1, parseInt(url.searchParams.get('days') || '60', 10)))

  const windowStart = new Date()
  // Show the past 7 days too so the dashboard agenda can include
  // "today's morning" jobs even if user opens the page after noon.
  windowStart.setDate(windowStart.getDate() - 7)
  const windowEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  // 1. Native appointments — always present
  const nativeRows = await listAppointments({ userId, windowStart, windowEnd })
  const nativeEvents: UnifiedCalendarEvent[] = nativeRows.map((r) => ({
    provider: 'native' as const,
    id: r.id,
    summary: r.title || r.job_type || 'Appointment',
    description: r.notes_internal ?? undefined,
    location: r.address ?? undefined,
    start: r.scheduled_at!,
    end:   r.scheduled_end_at ?? r.scheduled_at!,
    allDay: false,
    status: r.status === 'cancelled' ? 'cancelled' : 'confirmed',
    isBellaveGo: r.created_via === 'ai',
    blockType: r.block_type,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    jobType: r.job_type,
    colorTag: r.color_tag,
  }))

  // 2. External calendars — merge if connected (optional sync sources).
  // These appear so contractors who block time externally (vacation in
  // personal Google, meetings in Outlook) still see those slots blocked.
  const { data: conns } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .in('provider', ['google', 'microsoft'])
  const connections = (conns ?? []) as CalendarConnectionRow[]

  const externalArrays = await Promise.all(
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

  // 3. Merge + dedupe.
  // An external event that's actually a copy of a native booking (we
  // pushed it out via sync) will show twice — once as native, once as
  // external. We dedupe by stripping external events whose id matches
  // any native row's external_event_id.
  const syncedOutIds = new Set(
    nativeRows
      .map((r) => r.external_event_id)
      .filter((id): id is string => !!id),
  )
  const externalEvents = externalArrays.flat().filter((ev) => !syncedOutIds.has(ev.id))

  const events = [...nativeEvents, ...externalEvents].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  )

  return NextResponse.json({
    connected: true,                         // native is always available
    nativeCount: nativeEvents.length,
    externalCount: externalEvents.length,
    externalProviders: connections.map((c) => c.provider),
    events,
    windowDays: days,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  })
}
