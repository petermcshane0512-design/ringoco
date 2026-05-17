import { createClient } from '@supabase/supabase-js'
import { getGoogleBusyBlocks, type CalendarConnectionRow, type FreeBusyBlock } from './google'
import { getMicrosoftBusyBlocks } from './microsoft'
import { getCalendlyBusyBlocks } from './calendly'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type FreeSlot = {
  start: string             // ISO timestamp
  end: string
  label: string             // human-friendly e.g. "Tuesday Jan 14 · 2:00–4:00 PM"
  dayLabel: string          // "Tue Jan 14"
  timeLabel: string         // "2:00 PM"
}

export type AvailabilitySummary = {
  connected: boolean
  providers: string[]                       // ['google'] etc.
  slots: FreeSlot[]
  windowStart: string
  windowEnd: string
  timezone: string
  durationMin: number
}

/**
 * Find free appointment slots across ALL of a contractor's connected calendars.
 *
 * Logic:
 *   1. Pull every enabled calendar_connection for the user
 *   2. Query free/busy from each provider (Google live; others stubbed for now)
 *   3. Merge BUSY blocks across providers (union)
 *   4. Walk through `daysAhead` days of business hours (per business_hours JSON)
 *   5. Subtract busy blocks + buffer time
 *   6. Emit fixed-length slots (default 90min) starting at top of each hour
 *
 * Returns up to `maxSlots` (default 6) so the AI doesn't read a wall of options.
 */
export async function findAvailableSlots(args: {
  userId: string
  daysAhead?: number
  durationMin?: number
  maxSlots?: number
  earliestHoursOut?: number   // skip "in 30min" — at least N hours of lead time
}): Promise<AvailabilitySummary> {
  const daysAhead = args.daysAhead ?? 14
  const maxSlots = args.maxSlots ?? 6
  const earliestHoursOut = args.earliestHoursOut ?? 4

  const { data: connections } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', args.userId)
    .eq('enabled', true)

  const conns = (connections ?? []) as CalendarConnectionRow[]

  if (conns.length === 0) {
    const now = new Date()
    const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
    return {
      connected: false, providers: [], slots: [],
      windowStart: now.toISOString(), windowEnd: end.toISOString(),
      timezone: 'America/Chicago', durationMin: args.durationMin ?? 90,
    }
  }

  // Per-connection defaults (use the first connection's preferences if multiple)
  const primary = conns[0]
  const timezone = primary.timezone || 'America/Chicago'
  const durationMin = args.durationMin ?? primary.default_job_duration_min ?? 90
  const bufferMin = primary.buffer_min ?? 30
  const businessHours = primary.business_hours || {
    mon: [8, 18], tue: [8, 18], wed: [8, 18], thu: [8, 18], fri: [8, 18], sat: [9, 14], sun: null,
  }

  // Window: now + lead time → daysAhead from now
  const windowStart = new Date(Date.now() + earliestHoursOut * 60 * 60 * 1000)
  const windowEnd = new Date(windowStart.getTime() + daysAhead * 24 * 60 * 60 * 1000)

  // Collect busy blocks from every connected provider in parallel
  const providerBusy = await Promise.all(
    conns.map(async (c) => {
      if (c.provider === 'google')    return await getGoogleBusyBlocks({ connection: c, windowStart, windowEnd })
      if (c.provider === 'microsoft') return await getMicrosoftBusyBlocks({ connection: c, windowStart, windowEnd })
      if (c.provider === 'calendly')  return await getCalendlyBusyBlocks({ connection: c, windowStart, windowEnd })
      // Other providers will land here when implemented.
      return [] as FreeBusyBlock[]
    }),
  )
  const busy = providerBusy.flat().sort((a, b) => a.start.getTime() - b.start.getTime())

  // Walk through each day, find free slots within business hours
  const slots: FreeSlot[] = []
  const slotMs = (durationMin + bufferMin) * 60 * 1000
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  for (let d = 0; d < daysAhead && slots.length < maxSlots; d++) {
    const day = new Date(windowStart)
    day.setDate(day.getDate() + d)
    day.setHours(0, 0, 0, 0)
    const dayKey = dayKeys[day.getDay()]
    const hoursTuple = businessHours[dayKey] as [number, number] | null | undefined
    if (!hoursTuple) continue // closed day (e.g. Sunday)
    const [startHr, endHr] = hoursTuple

    // Try slots at each top-of-hour from startHr to endHr - duration
    for (let hr = startHr; hr <= endHr - Math.ceil(durationMin / 60) && slots.length < maxSlots; hr++) {
      const slotStart = new Date(day)
      slotStart.setHours(hr, 0, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + durationMin * 60 * 1000)

      if (slotStart < windowStart) continue
      if (slotEnd > windowEnd) break

      // Conflict check: any busy block overlap (with buffer)
      const bufferedStart = new Date(slotStart.getTime() - bufferMin * 60 * 1000)
      const bufferedEnd = new Date(slotEnd.getTime() + bufferMin * 60 * 1000)
      const conflict = busy.some(
        (b) => b.start < bufferedEnd && b.end > bufferedStart,
      )
      if (conflict) continue

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        label: formatSlotLabel(slotStart, slotEnd, timezone),
        dayLabel: formatDayLabel(slotStart, timezone),
        timeLabel: formatTimeLabel(slotStart, timezone),
      })

      // Don't double up on the same day — give the AI variety across days
      if (slots.length > 0 && slots.length % 2 === 0) break
    }
  }

  return {
    connected: true,
    providers: conns.map((c) => c.provider),
    slots,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    timezone,
    durationMin,
  }
}

function formatDayLabel(d: Date, tz: string): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
  })
}

function formatTimeLabel(d: Date, tz: string): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: tz,
  })
}

function formatSlotLabel(start: Date, end: Date, tz: string): string {
  const day = formatDayLabel(start, tz)
  const startT = formatTimeLabel(start, tz).replace(':00', '')
  const endT = formatTimeLabel(end, tz).replace(':00', '')
  return `${day} · ${startT}–${endT}`
}

/** Lightweight check: does this contractor have ANY enabled calendar connection? */
export async function hasCalendarConnected(userId: string): Promise<boolean> {
  const { count } = await supabase
    .from('calendar_connections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('enabled', true)
  return (count ?? 0) > 0
}
