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
  /**
   * Optional AI-booking window (local hours 0-23). When set, generated
   * slots whose START hour (in the connection's local timezone) falls
   * outside this window are filtered out — e.g. minHourLocal=17 means
   * the AI only offers slots at or after 5pm local. Null = unrestricted.
   * These are layered on TOP of the contractor's business_hours, not
   * a replacement.
   */
  minHourLocal?: number | null
  maxHourLocal?: number | null
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

  // Pull profile-level appointment settings — set during onboarding via
  // /dashboard/calendar Appointment Settings card. These take PRIORITY over
  // per-connection settings so the contractor has one source of truth and
  // settings exist even before a calendar is connected. Fallback chain:
  //   profile.default_job_duration_min → connection.default_job_duration_min → 90
  //   profile.travel_buffer_min        → connection.buffer_min               → 30
  const { data: profileSettings } = await supabase
    .from('profiles')
    .select('default_job_duration_min, travel_buffer_min')
    .eq('user_id', args.userId)
    .maybeSingle()
  const profileDur = (profileSettings as { default_job_duration_min?: number | null } | null)?.default_job_duration_min
  const profileBuf = (profileSettings as { travel_buffer_min?: number | null } | null)?.travel_buffer_min

  const durationMin = args.durationMin ?? profileDur ?? primary.default_job_duration_min ?? 90
  const bufferMin = profileBuf ?? primary.buffer_min ?? 30
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
      // Cronofy was deprecated 2026-05-26 in favor of direct Google + Microsoft
      // OAuth. Any remaining 'cronofy' rows in calendar_connections are stale
      // and should be deleted manually; we skip them here so they don't appear
      // in availability lookups.
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

      // AI booking window filter (separate from business hours — this is
      // the contractor's "I only let the AI book inside these hours" rule).
      // Read the slot's local-hour in the connection timezone so DST is
      // handled correctly.
      if (args.minHourLocal != null || args.maxHourLocal != null) {
        const localHourStr = slotStart.toLocaleString('en-US', {
          timeZone: timezone, hour: 'numeric', hour12: false,
        })
        const localHour = parseInt(localHourStr, 10)
        if (Number.isFinite(localHour)) {
          if (args.minHourLocal != null && localHour < args.minHourLocal) continue
          if (args.maxHourLocal != null && localHour >= args.maxHourLocal) continue
        }
      }

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
