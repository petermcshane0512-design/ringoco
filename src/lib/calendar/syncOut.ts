/**
 * Outbound sync — BellAveGo → Google Calendar + Microsoft Outlook (FANOUT).
 *
 * Mode: MULTI-PROVIDER MIRROR. BellAveGo is the source of truth. Every
 * appointment (AI or manual) is pushed to EVERY connected external
 * calendar — both Google AND Outlook if a contractor connected both —
 * so the job shows up wherever they look on their phone.
 *
 * Per-provider event ids stored in `jobs.google_event_id` +
 * `jobs.microsoft_event_id` (migration 025). External calendars never
 * write back into BellAveGo; we only read their free/busy windows for
 * AI conflict-checking (see availability.ts).
 *
 * All sync ops are best-effort and tolerant of failure — a sync failure
 * never blocks the underlying BellAveGo operation. Errors land in server
 * logs and can be reconciled by the daily cron (TBD).
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

/** Returns ALL enabled Google + Microsoft connections for this tenant. */
async function getAllConnections(userId: string): Promise<{
  google: CalendarConnectionRow | null
  microsoft: CalendarConnectionRow | null
}> {
  const { data } = await supabase
    .from('calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .in('provider', ['google', 'microsoft'])
  const conns = (data ?? []) as CalendarConnectionRow[]
  return {
    google:    conns.find((c) => c.provider === 'google')    ?? null,
    microsoft: conns.find((c) => c.provider === 'microsoft') ?? null,
  }
}

export type SyncResult = {
  google?:    { ok: boolean; eventId?: string; error?: string; skipped?: boolean }
  microsoft?: { ok: boolean; eventId?: string; error?: string; skipped?: boolean }
}

/**
 * FANOUT push — create the appointment in every connected external
 * calendar. Stamps `google_event_id` and/or `microsoft_event_id` back on
 * the jobs row. Sets the legacy `external_event_id` + `external_provider`
 * to the first successful one (back-compat).
 */
export async function pushAppointmentOut(appt: AppointmentRow): Promise<SyncResult> {
  const out: SyncResult = {}
  if (!appt.scheduled_at || !appt.scheduled_end_at) {
    return { google: { ok: false, error: 'missing scheduled_at/end_at' } }
  }

  const conns = await getAllConnections(appt.user_id)
  const { summary, description } = buildEventBody(appt)

  // Parallelize the two provider pushes — total sync latency now equals
  // max(google, microsoft) instead of sum. At scale (200 customers × ~2
  // bookings/day) this halves the wall time the API spends on sync and
  // keeps us well under the 10s Vercel function timeout.
  const [googleRes, microsoftRes] = await Promise.all([
    conns.google
      ? createGoogleEvent({
          connection: conns.google,
          event: {
            summary,
            description,
            startISO: appt.scheduled_at,
            endISO:   appt.scheduled_end_at,
            timezone: conns.google.timezone || 'America/Chicago',
            location: appt.address ?? undefined,
            attendeePhone: appt.customer_phone ?? undefined,
          },
        }).then((r) => ({ kind: 'google' as const, r }))
      : Promise.resolve({ kind: 'google' as const, r: { ok: true, skipped: true } as { ok: true; eventId?: string; error?: string; skipped?: boolean } }),
    conns.microsoft
      ? createMicrosoftEvent({
          connection: conns.microsoft,
          event: {
            summary,
            description,
            startISO: appt.scheduled_at,
            endISO:   appt.scheduled_end_at,
            timezone: conns.microsoft.timezone || 'America/Chicago',
            location: appt.address ?? undefined,
            attendeePhone: appt.customer_phone ?? undefined,
          },
        }).then((r) => ({
          kind: 'microsoft' as const,
          r: r.ok ? { ok: true, eventId: r.eventId } : { ok: false, error: r.error },
        }))
      : Promise.resolve({ kind: 'microsoft' as const, r: { ok: true, skipped: true } as { ok: true; eventId?: string; error?: string; skipped?: boolean } }),
  ])

  // Normalize results
  const gr = googleRes.r as { ok: boolean; eventId?: string; error?: string; skipped?: boolean }
  out.google = gr.skipped
    ? { ok: true, skipped: true }
    : (gr.ok ? { ok: true, eventId: gr.eventId } : { ok: false, error: gr.error })
  if ('skipped' in gr === false && !gr.ok) console.warn(`[syncOut] google push failed for appt ${appt.id}:`, gr.error)

  const mr = microsoftRes.r as { ok: boolean; eventId?: string; error?: string; skipped?: boolean }
  out.microsoft = mr.skipped
    ? { ok: true, skipped: true }
    : (mr.ok ? { ok: true, eventId: mr.eventId } : { ok: false, error: mr.error })
  if ('skipped' in mr === false && !mr.ok) console.warn(`[syncOut] microsoft push failed for appt ${appt.id}:`, mr.error)

  // ─── Persist ids ───────────────────────────────────────────
  const update: Record<string, unknown> = {}
  if (out.google?.ok && out.google.eventId)    update.google_event_id    = out.google.eventId
  if (out.microsoft?.ok && out.microsoft.eventId) update.microsoft_event_id = out.microsoft.eventId

  // Legacy single-provider columns — point at whichever fired first
  // (Google wins if both succeeded). Older code that reads
  // external_event_id/external_provider still works correctly for the
  // primary mirror.
  if (out.google?.ok && out.google.eventId) {
    update.external_event_id = out.google.eventId
    update.external_provider = 'google'
  } else if (out.microsoft?.ok && out.microsoft.eventId) {
    update.external_event_id = out.microsoft.eventId
    update.external_provider = 'microsoft'
  }

  if (Object.keys(update).length > 0) {
    await supabase
      .from('jobs')
      .update(update)
      .eq('id', appt.id)
      .eq('user_id', appt.user_id)
  }

  return out
}

/**
 * FANOUT update — for each connected provider:
 *   - if the appointment already has an event id stored → PATCH
 *   - if not → CREATE (and stamp the id)
 *
 * Handles provider added AFTER the appointment was created (e.g. contractor
 * connected Outlook today, has a job from yesterday).
 */
export async function updateExternalForAppointment(appt: AppointmentRow): Promise<SyncResult> {
  if (!appt.scheduled_at || !appt.scheduled_end_at) {
    return { google: { ok: false, error: 'missing scheduled_at/end_at' } }
  }
  const conns = await getAllConnections(appt.user_id)
  const { summary, description } = buildEventBody(appt)
  const out: SyncResult = {}
  const update: Record<string, unknown> = {}

  // ─── Google ─────────────────────────────────────────────────
  if (conns.google) {
    const tz = conns.google.timezone || 'America/Chicago'
    if (appt.google_event_id) {
      const r = await updateGoogleEvent({
        connection: conns.google,
        eventId: appt.google_event_id,
        event: { summary, description, startISO: appt.scheduled_at, endISO: appt.scheduled_end_at, timezone: tz, location: appt.address ?? undefined, attendeePhone: appt.customer_phone ?? undefined },
      })
      if (!r.ok && r.status === 404) {
        // Event was deleted in Google directly — re-create
        const fresh = await createGoogleEvent({
          connection: conns.google,
          event: { summary, description, startISO: appt.scheduled_at, endISO: appt.scheduled_end_at, timezone: tz, location: appt.address ?? undefined, attendeePhone: appt.customer_phone ?? undefined },
        })
        out.google = fresh.ok ? { ok: true, eventId: fresh.eventId } : { ok: false, error: fresh.error }
        if (fresh.ok) update.google_event_id = fresh.eventId
      } else {
        out.google = r.ok ? { ok: true, eventId: r.eventId } : { ok: false, error: r.error }
      }
    } else {
      // Never synced to Google before → create
      const r = await createGoogleEvent({
        connection: conns.google,
        event: { summary, description, startISO: appt.scheduled_at, endISO: appt.scheduled_end_at, timezone: tz, location: appt.address ?? undefined, attendeePhone: appt.customer_phone ?? undefined },
      })
      out.google = r.ok ? { ok: true, eventId: r.eventId } : { ok: false, error: r.error }
      if (r.ok) update.google_event_id = r.eventId
    }
  } else {
    out.google = { ok: true, skipped: true }
  }

  // ─── Microsoft ─────────────────────────────────────────────
  if (conns.microsoft) {
    const tz = conns.microsoft.timezone || 'America/Chicago'
    if (appt.microsoft_event_id) {
      const r = await updateMicrosoftEvent({
        connection: conns.microsoft,
        eventId: appt.microsoft_event_id,
        event: { summary, description, startISO: appt.scheduled_at, endISO: appt.scheduled_end_at, timezone: tz, location: appt.address ?? undefined, attendeePhone: appt.customer_phone ?? undefined },
      })
      if (!r.ok && r.status === 404) {
        const fresh = await createMicrosoftEvent({
          connection: conns.microsoft,
          event: { summary, description, startISO: appt.scheduled_at, endISO: appt.scheduled_end_at, timezone: tz, location: appt.address ?? undefined, attendeePhone: appt.customer_phone ?? undefined },
        })
        out.microsoft = fresh.ok ? { ok: true, eventId: fresh.eventId } : { ok: false, error: fresh.error }
        if (fresh.ok) update.microsoft_event_id = fresh.eventId
      } else {
        out.microsoft = r.ok ? { ok: true, eventId: r.eventId } : { ok: false, error: r.error }
      }
    } else {
      const r = await createMicrosoftEvent({
        connection: conns.microsoft,
        event: { summary, description, startISO: appt.scheduled_at, endISO: appt.scheduled_end_at, timezone: tz, location: appt.address ?? undefined, attendeePhone: appt.customer_phone ?? undefined },
      })
      out.microsoft = r.ok ? { ok: true, eventId: r.eventId } : { ok: false, error: r.error }
      if (r.ok) update.microsoft_event_id = r.eventId
    }
  } else {
    out.microsoft = { ok: true, skipped: true }
  }

  if (Object.keys(update).length > 0) {
    await supabase.from('jobs').update(update).eq('id', appt.id).eq('user_id', appt.user_id)
  }

  return out
}

/**
 * FANOUT delete — remove the appointment from every external calendar
 * it was mirrored to. Idempotent — 404 from either provider is fine.
 */
export async function deleteExternalForAppointment(appt: AppointmentRow): Promise<SyncResult> {
  const conns = await getAllConnections(appt.user_id)
  const out: SyncResult = {}
  const update: Record<string, unknown> = {}

  if (conns.google && appt.google_event_id) {
    const r = await deleteGoogleEvent({ connection: conns.google, eventId: appt.google_event_id })
    out.google = r
    if (r.ok) update.google_event_id = null
  } else {
    out.google = { ok: true, skipped: true }
  }

  if (conns.microsoft && appt.microsoft_event_id) {
    const r = await deleteMicrosoftEvent({ connection: conns.microsoft, eventId: appt.microsoft_event_id })
    out.microsoft = r
    if (r.ok) update.microsoft_event_id = null
  } else {
    out.microsoft = { ok: true, skipped: true }
  }

  // Also clear the legacy columns if both per-provider columns now null
  update.external_event_id = null
  update.external_provider = null

  await supabase.from('jobs').update(update).eq('id', appt.id).eq('user_id', appt.user_id)
  return out
}
