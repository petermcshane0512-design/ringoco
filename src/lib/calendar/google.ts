import { createClient } from '@supabase/supabase-js'
import { encryptToken, decryptToken } from './tokens'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Google Calendar OAuth + free-busy read + event write.
 *
 * Scopes: read for free/busy lookup, write for auto-booking events when
 * Emma confirms an appointment with a caller.
 *
 * Setup (one-time, done in Google Cloud Console):
 *   1. https://console.cloud.google.com/apis/credentials
 *   2. Create OAuth 2.0 Client ID — Web application
 *   3. Authorized redirect URI: https://www.bellavego.com/api/calendar/google/callback
 *      (add http://localhost:3000/api/calendar/google/callback for local dev)
 *   4. Enable Google Calendar API in the same project
 *   5. OAuth consent screen → External (or Internal if Workspace) → publish
 *   6. Add env vars: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Migration note: contractors who connected BEFORE the write-scope rollout
 * have read-only tokens. Booking attempts fail with 403 — they need to
 * reconnect to grant calendar.events. canWriteToGoogle() checks scope.
 */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_API_BASE = 'https://www.googleapis.com'

const SCOPE_EVENTS_WRITE = 'https://www.googleapis.com/auth/calendar.events'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  SCOPE_EVENTS_WRITE,
  'openid',
  'email',
  'profile',
]

function getRedirectUri(): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'}/api/calendar/google/callback`
  )
}

function requireOauthCreds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google Calendar OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and ' +
      'GOOGLE_OAUTH_CLIENT_SECRET in Vercel env (see src/lib/calendar/google.ts setup notes).',
    )
  }
  return { clientId, clientSecret }
}

/** Build the consent URL we redirect contractors to when they click "Connect Google Calendar." */
export function buildGoogleAuthUrl(userId: string, csrfState: string): string {
  const { clientId } = requireOauthCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',     // returns refresh_token
    prompt: 'consent',          // ensures refresh_token even on re-connect
    include_granted_scopes: 'true',
    state: `${userId}:${csrfState}`,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/** Exchange the code for tokens + persist them encrypted in calendar_connections. */
export async function handleGoogleOAuthCallback(args: {
  code: string
  userId: string
}): Promise<{ ok: true; email?: string; name?: string } | { ok: false; error: string }> {
  const { code, userId } = args
  const { clientId, clientSecret } = requireOauthCreds()

  // Exchange code for tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '')
    return { ok: false, error: `Token exchange failed: ${tokenRes.status} ${txt.slice(0, 200)}` }
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
    id_token?: string
  }

  // Fetch userinfo to get account email + name + timezone
  let email: string | undefined
  let name: string | undefined
  let timezone = 'America/Chicago'
  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (userRes.ok) {
      const u = (await userRes.json()) as { email?: string; name?: string }
      email = u.email
      name = u.name
    }
  } catch { /* non-fatal */ }

  // Pull the user's primary calendar timezone via calendar settings
  try {
    const settingsRes = await fetch(`${GOOGLE_API_BASE}/calendar/v3/users/me/settings/timezone`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (settingsRes.ok) {
      const s = (await settingsRes.json()) as { value?: string }
      if (s.value) timezone = s.value
    }
  } catch { /* non-fatal — fall back to default */ }

  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: upsertErr } = await supabase.from('calendar_connections').upsert(
    {
      user_id: userId,
      provider: 'google',
      provider_account_email: email,
      provider_account_name: name,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      token_expires_at: expiresAtIso,
      scope: tokens.scope,
      calendar_id: 'primary',
      timezone,
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  )

  if (upsertErr) return { ok: false, error: `DB save failed: ${upsertErr.message}` }

  await logCalendarEvent(userId, 'google', 'connected', email)
  return { ok: true, email, name }
}

/** Refresh an expired access token using the stored refresh_token. */
async function refreshAccessToken(connection: CalendarConnectionRow): Promise<string | null> {
  if (!connection.refresh_token_enc) return null
  const { clientId, clientSecret } = requireOauthCreds()
  let refreshToken: string
  try {
    refreshToken = decryptToken(connection.refresh_token_enc)
  } catch {
    return null
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    await logCalendarEvent(connection.user_id, 'google', 'refresh_failed', `${res.status} ${txt.slice(0, 120)}`)
    // If refresh_token itself was revoked (400 invalid_grant), disable the
    // connection so we don't keep retrying.
    if (res.status === 400 || res.status === 401) {
      await supabase
        .from('calendar_connections')
        .update({ enabled: false, last_error: 'refresh_token revoked — needs reconnect' })
        .eq('id', connection.id)
    }
    return null
  }
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  const expiresAtIso = j.expires_in
    ? new Date(Date.now() + j.expires_in * 1000).toISOString()
    : null
  await supabase
    .from('calendar_connections')
    .update({
      access_token_enc: encryptToken(j.access_token),
      token_expires_at: expiresAtIso,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  await logCalendarEvent(connection.user_id, 'google', 'refresh_ok')
  return j.access_token
}

/** Return a valid access token, refreshing if expired. */
async function getValidAccessToken(connection: CalendarConnectionRow): Promise<string | null> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0
  // Refresh if less than 60s of life left.
  if (expiresAt < Date.now() + 60_000) {
    return await refreshAccessToken(connection)
  }
  try {
    return decryptToken(connection.access_token_enc)
  } catch {
    return null
  }
}

export type FreeBusyBlock = { start: Date; end: Date }

/**
 * Query Google Calendar free/busy for a window.
 * Returns the BUSY blocks — the slot finder uses these to compute free time.
 */
export async function getGoogleBusyBlocks(args: {
  connection: CalendarConnectionRow
  windowStart: Date
  windowEnd: Date
}): Promise<FreeBusyBlock[]> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return []
  try {
    const res = await fetch(`${GOOGLE_API_BASE}/calendar/v3/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: args.windowStart.toISOString(),
        timeMax: args.windowEnd.toISOString(),
        timeZone: args.connection.timezone || 'America/Chicago',
        items: [{ id: args.connection.calendar_id || 'primary' }],
      }),
    })
    if (!res.ok) {
      await logCalendarEvent(args.connection.user_id, 'google', 'error', `freeBusy ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>
    }
    const calId = args.connection.calendar_id || 'primary'
    const busy = data.calendars?.[calId]?.busy ?? []
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
  } catch (e) {
    await logCalendarEvent(args.connection.user_id, 'google', 'error', `freeBusy threw: ${(e as Error).message}`)
    return []
  }
}

/**
 * Returns true if this connection's token includes calendar.events scope.
 * Pre-write-scope connections will return false — caller must reconnect.
 */
export function canWriteToGoogle(connection: CalendarConnectionRow): boolean {
  if (!connection.scope) return false
  return connection.scope.split(/\s+/).includes(SCOPE_EVENTS_WRITE)
}

export type GoogleEventInput = {
  summary: string                  // event title
  description?: string
  startISO: string                 // ISO timestamp
  endISO: string
  timezone?: string                // IANA — defaults to connection timezone
  location?: string
  attendeePhone?: string           // surfaced in description (Google needs email for real attendee)
}

export type GoogleEventResult =
  | { ok: true; eventId: string; htmlLink?: string }
  | { ok: false; error: string; status?: number; conflict?: boolean }

/**
 * Create an event on the contractor's primary calendar.
 *
 * Race protection is the CALLER's responsibility — re-check availability
 * inside the booking endpoint immediately before invoking this. Google's API
 * doesn't have native conflict-rejection on insert; concurrent writes are
 * legitimately accepted as parallel events, so we rely on the freeBusy
 * re-check + the conditional flow upstream.
 *
 * Maps a 403 from missing scope to a clear error message so the booking
 * route can prompt reconnection.
 */
export async function createGoogleEvent(args: {
  connection: CalendarConnectionRow
  event: GoogleEventInput
}): Promise<GoogleEventResult> {
  if (!canWriteToGoogle(args.connection)) {
    return {
      ok: false,
      error: 'Google Calendar connection lacks write scope — reconnect required.',
    }
  }

  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'Could not refresh access token.' }

  const calendarId = args.connection.calendar_id || 'primary'
  const tz = args.event.timezone || args.connection.timezone || 'America/Chicago'

  const body = {
    summary: args.event.summary,
    description: args.event.description,
    location: args.event.location,
    start: { dateTime: args.event.startISO, timeZone: tz },
    end: { dateTime: args.event.endISO, timeZone: tz },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 1440 }, // 24h
      ],
    },
    // Source tag so contractors can identify BellAveGo-created events
    extendedProperties: {
      shared: { bellavego_source: 'ai_booking' },
    },
  }

  try {
    const res = await fetch(
      `${GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      await logCalendarEvent(args.connection.user_id, 'google', 'event_create_failed', `${res.status} ${txt.slice(0, 200)}`)
      if (res.status === 403 && /insufficient.*scope|insufficientPermissions/i.test(txt)) {
        return { ok: false, error: 'Missing calendar.events scope — reconnect required.', status: 403 }
      }
      return { ok: false, error: `Google API ${res.status}: ${txt.slice(0, 200)}`, status: res.status }
    }

    const j = (await res.json()) as { id?: string; htmlLink?: string }
    if (!j.id) return { ok: false, error: 'Google returned no event id.' }
    await logCalendarEvent(args.connection.user_id, 'google', 'event_created', j.id)
    return { ok: true, eventId: j.id, htmlLink: j.htmlLink }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logCalendarEvent(args.connection.user_id, 'google', 'event_create_threw', msg)
    return { ok: false, error: msg }
  }
}

/**
 * List the contractor's upcoming Google Calendar events in a window. Used
 * by the dashboard agenda view. BellAveGo-created events are identified by
 * the `extendedProperties.shared.bellavego_source` tag set in createGoogleEvent.
 */
export type GoogleCalendarEvent = {
  id: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay: boolean
  status?: 'confirmed' | 'tentative' | 'cancelled'
  isBellaveGo: boolean
}

export async function listGoogleEvents(args: {
  connection: CalendarConnectionRow
  windowStart: Date
  windowEnd: Date
}): Promise<GoogleCalendarEvent[]> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return []
  try {
    const calendarId = args.connection.calendar_id || 'primary'
    const params = new URLSearchParams({
      timeMin: args.windowStart.toISOString(),
      timeMax: args.windowEnd.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    })
    const res = await fetch(
      `${GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      await logCalendarEvent(args.connection.user_id, 'google', 'error', `list events ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      items?: Array<{
        id?: string
        summary?: string
        description?: string
        location?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        status?: 'confirmed' | 'tentative' | 'cancelled'
        extendedProperties?: { shared?: Record<string, string> }
      }>
    }
    return (data.items ?? [])
      .filter((ev) => ev.status !== 'cancelled')
      .map((ev) => {
        const startStr = ev.start?.dateTime || ev.start?.date || ''
        const endStr   = ev.end?.dateTime   || ev.end?.date   || ''
        const allDay = !!ev.start?.date && !ev.start?.dateTime
        return {
          id: ev.id ?? '',
          summary: ev.summary || '(untitled event)',
          description: ev.description,
          location: ev.location,
          start: allDay ? `${startStr}T00:00:00Z` : startStr,
          end:   allDay ? `${endStr}T23:59:59Z`   : endStr,
          allDay,
          status: ev.status,
          isBellaveGo: ev.extendedProperties?.shared?.bellavego_source === 'ai_booking',
        } as GoogleCalendarEvent
      })
  } catch (e) {
    await logCalendarEvent(args.connection.user_id, 'google', 'error', `list events threw: ${(e as Error).message}`)
    return []
  }
}

/**
 * Update an existing Google Calendar event. Used by the BellAveGo
 * outbound-sync layer when a contractor reschedules / edits an
 * appointment that was previously mirrored to Google.
 *
 * Returns ok=false with status=404 if the event was deleted in Google
 * directly (in which case the caller may want to clear external_event_id
 * and create a fresh one — or accept the desync).
 */
export async function updateGoogleEvent(args: {
  connection: CalendarConnectionRow
  eventId: string
  event: GoogleEventInput
}): Promise<GoogleEventResult> {
  if (!canWriteToGoogle(args.connection)) {
    return { ok: false, error: 'Google connection lacks write scope — reconnect required.' }
  }
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'Could not refresh access token.' }

  const calendarId = args.connection.calendar_id || 'primary'
  const tz = args.event.timezone || args.connection.timezone || 'America/Chicago'

  const body = {
    summary: args.event.summary,
    description: args.event.description,
    location: args.event.location,
    start: { dateTime: args.event.startISO, timeZone: tz },
    end:   { dateTime: args.event.endISO,   timeZone: tz },
    extendedProperties: {
      shared: { bellavego_source: 'ai_booking' },
    },
  }

  try {
    const res = await fetch(
      `${GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      await logCalendarEvent(args.connection.user_id, 'google', 'event_update_failed', `${res.status} ${txt.slice(0, 200)}`)
      return { ok: false, error: `Google API ${res.status}: ${txt.slice(0, 200)}`, status: res.status }
    }
    const j = (await res.json()) as { id?: string; htmlLink?: string }
    await logCalendarEvent(args.connection.user_id, 'google', 'event_updated', args.eventId)
    return { ok: true, eventId: j.id ?? args.eventId, htmlLink: j.htmlLink }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Delete an event from Google Calendar. Used when a BellAveGo appointment
 * is cancelled. Idempotent — 404 is treated as success (already gone).
 */
export async function deleteGoogleEvent(args: {
  connection: CalendarConnectionRow
  eventId: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!canWriteToGoogle(args.connection)) {
    return { ok: false, error: 'Google connection lacks write scope.' }
  }
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'Could not refresh access token.' }

  const calendarId = args.connection.calendar_id || 'primary'
  try {
    const res = await fetch(
      `${GOOGLE_API_BASE}/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    )
    if (res.status === 404 || res.status === 410) {
      // Event already deleted in Google — treat as success
      await logCalendarEvent(args.connection.user_id, 'google', 'event_delete_noop', args.eventId)
      return { ok: true }
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      await logCalendarEvent(args.connection.user_id, 'google', 'event_delete_failed', `${res.status} ${txt.slice(0, 200)}`)
      return { ok: false, error: `Google API ${res.status}: ${txt.slice(0, 200)}` }
    }
    await logCalendarEvent(args.connection.user_id, 'google', 'event_deleted', args.eventId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function disconnectGoogleCalendar(userId: string): Promise<{ ok: boolean }> {
  // Best-effort revoke at Google (so the connection vanishes from their account too)
  try {
    const { data: conn } = await supabase
      .from('calendar_connections')
      .select('access_token_enc')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle()
    if (conn) {
      const token = decryptToken((conn as { access_token_enc: string }).access_token_enc)
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      }).catch(() => {})
    }
  } catch { /* non-fatal */ }

  await supabase
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google')

  await logCalendarEvent(userId, 'google', 'disconnected')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────
// Shared types + audit log helper
// ─────────────────────────────────────────────────────────────────

export type CalendarConnectionRow = {
  id: string
  user_id: string
  provider: string
  provider_account_email: string | null
  provider_account_name: string | null
  access_token_enc: string
  refresh_token_enc: string | null
  token_expires_at: string | null
  scope: string | null
  calendar_id: string | null
  timezone: string
  business_hours: Record<string, [number, number] | null>
  default_job_duration_min: number
  buffer_min: number
  enabled: boolean
  last_synced_at: string | null
  last_error: string | null
}

async function logCalendarEvent(userId: string, provider: string, event: string, detail?: string) {
  try {
    await supabase.from('calendar_events_log').insert({ user_id: userId, provider, event, detail })
  } catch { /* non-fatal */ }
}
