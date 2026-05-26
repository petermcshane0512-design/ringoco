/**
 * Outbound sync — BellAveGo → Google Calendar / Microsoft Outlook.
 *
 * Mode: MIRROR. BellAveGo is the source of truth. Every appointment (AI
 * or manual) is pushed to the contractor's connected external calendar
 * so it shows up on their phone. External calendars never write back
 * into BellAveGo; we only read their free/busy windows for AI
 * conflict-checking (see availability.ts).
 *
 * Functions are best-effort and tolerant of failure — a sync failure
 * never blocks the underlying BellAveGo operation. The next manual
 * action or daily reconcile cron (TBD) will re-push.
 */
import { createClient } from '@supabase/supabase-js'
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  type CalendarConnectionRow,
} from './google'
import {
  createMicrosoftEvent,
  updateMicrosoftEvent,
  deleteMicrosoftEvent,
} from './microsoft'
import type { AppointmentRow } from './appointments'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Build the title + description that get written into Google/Outlook.
 * Match the format used by the AI booking path so contractors see a
 * consistent label regardless of how the appointment was created.
 */
function buildEventBody(appt: AppointmentRow): {
  summary: string
  description: string
} {
  const titlePart = appt.title || appt.job_type || 'Appointment'
  const summary = appt.block_type === 'job' && appt.customer_name
    ? `BellAveGo · ${appt.job_type || 'Appointment'} — ${appt.customer_name}`
    : `BellAveGo · ${titlePart}`

  const lines: string[] = []
  if (appt.customer_name)  lines.push(`Customer: ${appt.customer_name}`)
  if (appt.customer_phone) lines.push(`Phone: ${appt.customer_phone}`)
  if (appt.job_type)       lines.push(`Service: ${appt.job_type}`)
  if (appt.address)        lines.push(`Address: ${appt.address}`)
  if (appt.notes_internal) lines.push('', 'Notes:', appt.notes_internal)
  lines.push('', `Synced from BellAveGo · ${appt.created_via === 'ai' ? 'booked by AI receptionist' : 'added manually'}.`)

  return { summary, description: lines.join('\n') }
}

/**
 * Look up the contractor's preferred external calendar connection. Returns
 * Google if connected, else Microsoft, else null. Same priority as the
 * /api/calendar/book flow.
 */
async function pickConnection(userId: string): Promise<CalendarConnectionRow | null> {
  const { data } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .in('provider', ['google', 'microsoft'])
  const conns = (data ?? []) as CalendarConnectionRow[]
  return conns.find((c) => c.provider === 'google') ?? conns.find((c) => c.provider === 'microsoft') ?? null
}

/**
 * Push a brand-new BellAveGo appointment to the connected external
 * calendar. Stamps external_event_id + external_provider back on the
 * jobs row when successful. No-op when no external calendar connected.
 */
export async function pushAppointmentOut(appt: AppointmentRow): Promise<{
  ok: boolean
  provider?: 'google' | 'microsoft'
  eventId?: string
  error?: string
  skipped?: boolean
}> {
  const conn = await pickConnection(appt.user_id)
  if (!conn) return { ok: true, skipped: true }

  if (!appt.scheduled_at || !appt.scheduled_end_at) {
    return { ok: false, error: 'appointment missing scheduled_at/scheduled_end_at — cannot sync' }
  }

  const { summary, description } = buildEventBody(appt)
  const tz = conn.timezone || 'America/Chicago'

  let r: { ok: boolean; eventId?: string; error?: string; status?: number }
  let provider: 'google' | 'microsoft'

  if (conn.provider === 'google') {
    provider = 'google'
    const res = await createGoogleEvent({
      connection: conn,
      event: {
        summary,
        description,
        startISO: appt.scheduled_at,
        endISO:   appt.scheduled_end_at,
        timezone: tz,
        location: appt.address ?? undefined,
        attendeePhone: appt.customer_phone ?? undefined,
      },
    })
    r = res
  } else {
    provider = 'microsoft'
    const res = await createMicrosoftEvent({
      connection: conn,
      event: {
        summary,
        description,
        startISO: appt.scheduled_at,
        endISO:   appt.scheduled_end_at,
        timezone: tz,
        location: appt.address ?? undefined,
        attendeePhone: appt.customer_phone ?? undefined,
      },
    })
    r = res.ok ? { ok: true, eventId: res.eventId } : { ok: false, error: res.error, status: res.status }
  }

  if (!r.ok || !r.eventId) {
    console.warn(`[syncOut] push to ${provider} failed for appt ${appt.id}:`, r.error)
    return { ok: false, provider, error: r.error }
  }

  // Stamp the external id + provider on the appointment row so future
  // edits know what to update / delete.
  await supabase
    .from('jobs')
    .update({
      external_event_id: r.eventId,
      external_provider: provider,
      ...(provider === 'google' ? { google_event_id: r.eventId } : {}),
    })
    .eq('id', appt.id)
    .eq('user_id', appt.user_id)

  return { ok: true, provider, eventId: r.eventId }
}

/**
 * Mirror an UPDATE (reschedule, edit) to the external calendar.
 *
 * Strategy:
 *   - If the appointment has external_event_id + external_provider stamped → PATCH
 *   - If not (e.g. external connection was added AFTER the appointment) → CREATE
 */
export async function updateExternalForAppointment(appt: AppointmentRow): Promise<{
  ok: boolean
  error?: string
  skipped?: boolean
}> {
  const conn = await pickConnection(appt.user_id)
  if (!conn) return { ok: true, skipped: true }

  if (!appt.scheduled_at || !appt.scheduled_end_at) {
    return { ok: false, error: 'missing scheduled_at/scheduled_end_at' }
  }

  // No external stamp yet → fall back to a fresh push.
  if (!appt.external_event_id || !appt.external_provider) {
    const r = await pushAppointmentOut(appt)
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }

  // Provider mismatch (contractor disconnected one calendar and connected
  // another). Delete old, create new.
  if (appt.external_provider !== conn.provider) {
    await deleteExternalForAppointment(appt).catch(() => {})
    const r = await pushAppointmentOut(appt)
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }

  const { summary, description } = buildEventBody(appt)
  const tz = conn.timezone || 'America/Chicago'

  if (conn.provider === 'google') {
    const r = await updateGoogleEvent({
      connection: conn,
      eventId: appt.external_event_id,
      event: {
        summary,
        description,
        startISO: appt.scheduled_at,
        endISO:   appt.scheduled_end_at,
        timezone: tz,
        location: appt.address ?? undefined,
        attendeePhone: appt.customer_phone ?? undefined,
      },
    })
    if (!r.ok && r.status === 404) {
      // Event was deleted in Google directly. Re-push a fresh one.
      await supabase
        .from('jobs')
        .update({ external_event_id: null, external_provider: null, google_event_id: null })
        .eq('id', appt.id)
      const fresh = await pushAppointmentOut({ ...appt, external_event_id: null, external_provider: null })
      return fresh.ok ? { ok: true } : { ok: false, error: fresh.error }
    }
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }

  const r = await updateMicrosoftEvent({
    connection: conn,
    eventId: appt.external_event_id,
    event: {
      summary,
      description,
      startISO: appt.scheduled_at,
      endISO:   appt.scheduled_end_at,
      timezone: tz,
      location: appt.address ?? undefined,
      attendeePhone: appt.customer_phone ?? undefined,
    },
  })
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

/**
 * Mirror a CANCEL to the external calendar. Deletes the event from
 * Google/Outlook so the contractor's phone doesn't keep showing a job
 * that's no longer real. Best-effort; never fails the calling op.
 */
export async function deleteExternalForAppointment(appt: AppointmentRow): Promise<{
  ok: boolean
  error?: string
  skipped?: boolean
}> {
  if (!appt.external_event_id || !appt.external_provider) return { ok: true, skipped: true }
  const conn = await pickConnection(appt.user_id)
  if (!conn || conn.provider !== appt.external_provider) {
    // Provider disconnected or changed; nothing actionable. Clear the stamp
    // so we don't keep trying.
    await supabase
      .from('jobs')
      .update({ external_event_id: null, external_provider: null })
      .eq('id', appt.id)
    return { ok: true, skipped: true }
  }

  const deleteFn = conn.provider === 'google' ? deleteGoogleEvent : deleteMicrosoftEvent
  const r = await deleteFn({ connection: conn, eventId: appt.external_event_id })

  if (r.ok) {
    // Clear the stamp so a future "Recreate" would treat this as a fresh push.
    await supabase
      .from('jobs')
      .update({ external_event_id: null, external_provider: null, google_event_id: null })
      .eq('id', appt.id)
  }
  return r
}
