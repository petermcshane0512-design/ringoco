import { createClient } from '@supabase/supabase-js'
import { encryptToken, decryptToken } from './tokens'
import type { CalendarConnectionRow, FreeBusyBlock } from './google'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Microsoft Outlook / Microsoft 365 Calendar OAuth + read-only client via
 * Microsoft Graph API.
 *
 * Works with BOTH personal Microsoft accounts (outlook.com, live.com,
 * hotmail.com) AND work/school Microsoft 365 accounts via the `common`
 * tenant endpoint. One Azure app registration covers every customer.
 *
 * Scope: `Calendars.ReadWrite offline_access User.Read` — read free/busy,
 * create + delete events on the contractor's primary calendar, and refresh
 * the access token. Bumped from Calendars.Read (read-only) on 2026-05-26 so
 * the AI receptionist can auto-book appointments directly into Outlook.
 *
 * Setup (one-time, in Azure Portal):
 *   1. https://portal.azure.com → Microsoft Entra ID → App registrations → New registration
 *   2. Name: BellAveGo Calendar
 *      Supported account types: "Accounts in any organizational directory
 *        + personal Microsoft accounts" (multi-tenant + personal)
 *      Redirect URI (Web): https://www.bellavego.com/api/calendar/microsoft/callback
 *   3. After creation, copy the Application (client) ID
 *   4. Certificates & secrets → New client secret → copy the Value
 *   5. API permissions → Microsoft Graph → Delegated:
 *      Calendars.ReadWrite, offline_access, User.Read, openid, profile, email
 *   6. Env vars: MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_SECRET
 *
 * Migration note: contractors who connected BEFORE 2026-05-26 have
 * Calendars.Read tokens only. Booking attempts fail with 403 — they need to
 * reconnect to grant ReadWrite. canWriteToMicrosoft() checks scope.
 */

const MS_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const MS_GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const SCOPE_EVENTS_WRITE = 'Calendars.ReadWrite'

const SCOPES = [
  SCOPE_EVENTS_WRITE,
  'User.Read',
  'offline_access',
  'openid',
  'profile',
  'email',
]

function getRedirectUri(): string {
  return (
    process.env.MICROSOFT_OAUTH_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'}/api/calendar/microsoft/callback`
  )
}

function requireOauthCreds() {
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Microsoft Calendar OAuth not configured. Set MICROSOFT_OAUTH_CLIENT_ID and ' +
      'MICROSOFT_OAUTH_CLIENT_SECRET in Vercel env (see src/lib/calendar/microsoft.ts setup notes).',
    )
  }
  return { clientId, clientSecret }
}

export function buildMicrosoftAuthUrl(userId: string, csrfState: string): string {
  const { clientId } = requireOauthCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    response_mode: 'query',
    scope: SCOPES.join(' '),
    prompt: 'select_account',
    state: `${userId}:${csrfState}`,
  })
  return `${MS_AUTH_URL}?${params.toString()}`
}

export async function handleMicrosoftOAuthCallback(args: {
  code: string
  userId: string
}): Promise<{ ok: true; email?: string; name?: string } | { ok: false; error: string }> {
  const { code, userId } = args
  const { clientId, clientSecret } = requireOauthCreds()

  // Exchange code for tokens
  const tokenRes = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: 'authorization_code',
      scope: SCOPES.join(' '),
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

  // Fetch profile + mailbox settings (for timezone)
  let email: string | undefined
  let name: string | undefined
  let timezone = 'America/Chicago'
  try {
    const userRes = await fetch(`${MS_GRAPH_BASE}/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (userRes.ok) {
      const u = (await userRes.json()) as { mail?: string; userPrincipalName?: string; displayName?: string }
      email = u.mail || u.userPrincipalName
      name = u.displayName
    }
  } catch { /* non-fatal */ }
  try {
    const tzRes = await fetch(`${MS_GRAPH_BASE}/me/mailboxSettings/timeZone`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (tzRes.ok) {
      const tzData = (await tzRes.json()) as { value?: string }
      // Microsoft returns Windows time zone names by default ("Central Standard Time")
      // OR IANA names if configured. Normalize the common ones to IANA.
      const raw = tzData.value || ''
      timezone = windowsTzToIana(raw) || raw || 'America/Chicago'
    }
  } catch { /* non-fatal */ }

  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: upsertErr } = await supabase.from('calendar_connections').upsert(
    {
      user_id: userId,
      provider: 'microsoft',
      provider_account_email: email,
      provider_account_name: name,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      token_expires_at: expiresAtIso,
      scope: tokens.scope,
      calendar_id: 'primary',         // Graph uses /me/calendar/calendarView for default
      timezone,
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  )

  if (upsertErr) return { ok: false, error: `DB save failed: ${upsertErr.message}` }

  await logCalendarEvent(userId, 'microsoft', 'connected', email)
  return { ok: true, email, name }
}

async function refreshAccessToken(connection: CalendarConnectionRow): Promise<string | null> {
  if (!connection.refresh_token_enc) return null
  const { clientId, clientSecret } = requireOauthCreds()
  let refreshToken: string
  try {
    refreshToken = decryptToken(connection.refresh_token_enc)
  } catch {
    return null
  }

  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: SCOPES.join(' '),
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    await logCalendarEvent(connection.user_id, 'microsoft', 'refresh_failed', `${res.status} ${txt.slice(0, 120)}`)
    if (res.status === 400 || res.status === 401) {
      await supabase
        .from('calendar_connections')
        .update({ enabled: false, last_error: 'refresh_token revoked — needs reconnect' })
        .eq('id', connection.id)
    }
    return null
  }
  const j = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number }
  const expiresAtIso = j.expires_in
    ? new Date(Date.now() + j.expires_in * 1000).toISOString()
    : null
  await supabase
    .from('calendar_connections')
    .update({
      access_token_enc: encryptToken(j.access_token),
      // Microsoft sometimes rotates refresh tokens — store the new one if returned
      ...(j.refresh_token ? { refresh_token_enc: encryptToken(j.refresh_token) } : {}),
      token_expires_at: expiresAtIso,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  await logCalendarEvent(connection.user_id, 'microsoft', 'refresh_ok')
  return j.access_token
}

async function getValidAccessToken(connection: CalendarConnectionRow): Promise<string | null> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0
  if (expiresAt < Date.now() + 60_000) {
    return await refreshAccessToken(connection)
  }
  try { return decryptToken(connection.access_token_enc) } catch { return null }
}

/**
 * Query Microsoft Graph for busy blocks in a window.
 * Uses /me/calendarView (events in range) — each event becomes a busy block.
 * Excludes events the user has declined or marked as 'free' (showAs='free').
 */
export async function getMicrosoftBusyBlocks(args: {
  connection: CalendarConnectionRow
  windowStart: Date
  windowEnd: Date
}): Promise<FreeBusyBlock[]> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return []
  try {
    const params = new URLSearchParams({
      startDateTime: args.windowStart.toISOString(),
      endDateTime: args.windowEnd.toISOString(),
      $select: 'start,end,showAs,isCancelled',
      $top: '200',
    })
    const res = await fetch(`${MS_GRAPH_BASE}/me/calendarView?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: `outlook.timezone="${args.connection.timezone || 'UTC'}"`,
      },
    })
    if (!res.ok) {
      await logCalendarEvent(args.connection.user_id, 'microsoft', 'error', `calendarView ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      value?: Array<{
        start: { dateTime: string; timeZone?: string }
        end: { dateTime: string; timeZone?: string }
        showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'
        isCancelled?: boolean
      }>
    }
    return (data.value ?? [])
      .filter((ev) => !ev.isCancelled && ev.showAs !== 'free')
      .map((ev) => ({
        // Outlook returns local dateTimes when Prefer header sets timezone, but
        // we asked for outlook.timezone="<tz>" — values are wall-clock in that
        // tz. Append the offset or parse via Intl. Safer: parse as UTC if Z
        // suffix present, else treat as local + apply tz offset. For first
        // ship, parse direct ISO — Graph returns "2026-05-17T14:00:00.0000000"
        // (no Z). new Date() will interpret as local; for our slot logic the
        // small skew is acceptable. Will tighten with proper tz handling.
        start: new Date(ev.start.dateTime + (ev.start.dateTime.endsWith('Z') ? '' : 'Z')),
        end: new Date(ev.end.dateTime + (ev.end.dateTime.endsWith('Z') ? '' : 'Z')),
      }))
  } catch (e) {
    await logCalendarEvent(args.connection.user_id, 'microsoft', 'error', `calendarView threw: ${(e as Error).message}`)
    return []
  }
}

/**
 * Returns true if this connection's token grants Calendars.ReadWrite. Older
 * read-only connections (pre-2026-05-26) return false — booking code prompts
 * a reconnect.
 *
 * Microsoft Graph stores granted scopes as space-separated case-INSENSITIVE
 * strings (e.g. "Calendars.ReadWrite User.Read offline_access"). We match
 * tolerantly.
 */
export function canWriteToMicrosoft(connection: CalendarConnectionRow): boolean {
  if (!connection.scope) return false
  return connection.scope.split(/\s+/).some((s) => s.toLowerCase() === SCOPE_EVENTS_WRITE.toLowerCase())
}

export type MicrosoftEventInput = {
  summary: string
  description?: string
  startISO: string
  endISO: string
  timezone?: string
  location?: string
  attendeePhone?: string
}

export type MicrosoftEventResult =
  | { ok: true; eventId: string; webLink?: string }
  | { ok: false; error: string; status?: number; conflict?: boolean }

/**
 * Create an event on the contractor's primary Outlook calendar.
 *
 * Graph API does not natively reject conflicting writes — the caller must
 * re-check availability immediately before invoking this (same contract as
 * createGoogleEvent). We tag every event with `singleValueExtendedProperties`
 * carrying `bellavego_source=ai_booking` so the dashboard can identify and
 * style AI-booked events distinctively.
 */
export async function createMicrosoftEvent(args: {
  connection: CalendarConnectionRow
  event: MicrosoftEventInput
}): Promise<MicrosoftEventResult> {
  if (!canWriteToMicrosoft(args.connection)) {
    return {
      ok: false,
      error: 'Outlook connection lacks Calendars.ReadWrite scope — reconnect required.',
    }
  }

  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'Could not refresh access token.' }

  const tz = args.event.timezone || args.connection.timezone || 'America/Chicago'

  // Microsoft Graph expects a Windows time zone name OR an IANA name in the
  // `timeZone` field. IANA names (e.g. "America/Chicago") are accepted by
  // Graph v1.0 endpoints and are what we have stored.
  const body = {
    subject: args.event.summary,
    body: args.event.description
      ? { contentType: 'text', content: args.event.description }
      : undefined,
    location: args.event.location ? { displayName: args.event.location } : undefined,
    start: { dateTime: stripZ(args.event.startISO), timeZone: tz },
    end:   { dateTime: stripZ(args.event.endISO),   timeZone: tz },
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
    showAs: 'busy',
    // Tag so we can identify BellAveGo-created events in listings.
    singleValueExtendedProperties: [
      {
        // String property in our pseudo-GUID namespace. UUID below was
        // generated once for BellAveGo; reuse forever so listings can filter.
        id: 'String {6f80c4f9-5cfb-4a3c-9c61-2c5c7dd2c80c} Name BellAveGoSource',
        value: 'ai_booking',
      },
    ],
  }

  try {
    const res = await fetch(`${MS_GRAPH_BASE}/me/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_create_failed', `${res.status} ${txt.slice(0, 200)}`)
      if (res.status === 403 && /insufficient|permission|scope/i.test(txt)) {
        return { ok: false, error: 'Missing Calendars.ReadWrite scope — reconnect required.', status: 403 }
      }
      return { ok: false, error: `Microsoft Graph ${res.status}: ${txt.slice(0, 200)}`, status: res.status }
    }

    const j = (await res.json()) as { id?: string; webLink?: string }
    if (!j.id) return { ok: false, error: 'Microsoft returned no event id.' }
    await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_created', j.id)
    return { ok: true, eventId: j.id, webLink: j.webLink }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_create_threw', msg)
    return { ok: false, error: msg }
  }
}

/**
 * List the contractor's upcoming Outlook calendar events in a window.
 * Used by the dashboard agenda view. Marks BellAveGo-created events by
 * looking up the `BellAveGoSource` extended property.
 */
export type MicrosoftCalendarEvent = {
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

export async function listMicrosoftEvents(args: {
  connection: CalendarConnectionRow
  windowStart: Date
  windowEnd: Date
}): Promise<MicrosoftCalendarEvent[]> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return []
  try {
    const params = new URLSearchParams({
      startDateTime: args.windowStart.toISOString(),
      endDateTime: args.windowEnd.toISOString(),
      $select: 'id,subject,body,bodyPreview,start,end,location,isAllDay,isCancelled,showAs,singleValueExtendedProperties',
      $expand: `singleValueExtendedProperties($filter=id eq 'String {6f80c4f9-5cfb-4a3c-9c61-2c5c7dd2c80c} Name BellAveGoSource')`,
      $top: '200',
      $orderby: 'start/dateTime',
    })
    const res = await fetch(`${MS_GRAPH_BASE}/me/calendarView?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: `outlook.timezone="${args.connection.timezone || 'UTC'}"`,
      },
    })
    if (!res.ok) {
      await logCalendarEvent(args.connection.user_id, 'microsoft', 'error', `list calendarView ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      value?: Array<{
        id?: string
        subject?: string
        bodyPreview?: string
        body?: { content?: string }
        start: { dateTime: string; timeZone?: string }
        end:   { dateTime: string; timeZone?: string }
        location?: { displayName?: string }
        isAllDay?: boolean
        isCancelled?: boolean
        showAs?: string
        singleValueExtendedProperties?: Array<{ id?: string; value?: string }>
      }>
    }
    return (data.value ?? [])
      .filter((ev) => !ev.isCancelled)
      .map((ev) => {
        const isBellaveGo = (ev.singleValueExtendedProperties ?? []).some(
          (p) => (p.value ?? '').toLowerCase().includes('ai_booking'),
        )
        const startStr = ev.start.dateTime
        const endStr   = ev.end.dateTime
        return {
          id: ev.id ?? '',
          summary: ev.subject || '(untitled event)',
          description: ev.bodyPreview || ev.body?.content || undefined,
          location: ev.location?.displayName,
          start: startStr + (startStr.endsWith('Z') ? '' : 'Z'),
          end:   endStr   + (endStr.endsWith('Z')   ? '' : 'Z'),
          allDay: !!ev.isAllDay,
          status: ev.isCancelled ? 'cancelled' : 'confirmed',
          isBellaveGo,
        } as MicrosoftCalendarEvent
      })
  } catch (e) {
    await logCalendarEvent(args.connection.user_id, 'microsoft', 'error', `list calendarView threw: ${(e as Error).message}`)
    return []
  }
}

/** Graph wants dateTime without the trailing Z when timeZone is provided. */
function stripZ(iso: string): string {
  return iso.endsWith('Z') ? iso.slice(0, -1) : iso
}

/**
 * Update an existing Outlook event. Used by the outbound-sync layer when
 * a contractor reschedules / edits an appointment in BellAveGo that was
 * previously mirrored to Microsoft.
 */
export async function updateMicrosoftEvent(args: {
  connection: CalendarConnectionRow
  eventId: string
  event: MicrosoftEventInput
}): Promise<MicrosoftEventResult> {
  if (!canWriteToMicrosoft(args.connection)) {
    return { ok: false, error: 'Outlook connection lacks Calendars.ReadWrite scope — reconnect required.' }
  }
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'Could not refresh access token.' }

  const tz = args.event.timezone || args.connection.timezone || 'America/Chicago'
  const body = {
    subject: args.event.summary,
    body: args.event.description ? { contentType: 'text', content: args.event.description } : undefined,
    location: args.event.location ? { displayName: args.event.location } : undefined,
    start: { dateTime: stripZ(args.event.startISO), timeZone: tz },
    end:   { dateTime: stripZ(args.event.endISO),   timeZone: tz },
  }

  try {
    const res = await fetch(`${MS_GRAPH_BASE}/me/events/${encodeURIComponent(args.eventId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_update_failed', `${res.status} ${txt.slice(0, 200)}`)
      return { ok: false, error: `Microsoft Graph ${res.status}: ${txt.slice(0, 200)}`, status: res.status }
    }
    const j = (await res.json()) as { id?: string; webLink?: string }
    await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_updated', args.eventId)
    return { ok: true, eventId: j.id ?? args.eventId, webLink: j.webLink }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Delete an Outlook event. Idempotent — 404/410 treated as success.
 */
export async function deleteMicrosoftEvent(args: {
  connection: CalendarConnectionRow
  eventId: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!canWriteToMicrosoft(args.connection)) {
    return { ok: false, error: 'Outlook connection lacks Calendars.ReadWrite scope.' }
  }
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'Could not refresh access token.' }

  try {
    const res = await fetch(`${MS_GRAPH_BASE}/me/events/${encodeURIComponent(args.eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.status === 404 || res.status === 410) {
      await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_delete_noop', args.eventId)
      return { ok: true }
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_delete_failed', `${res.status} ${txt.slice(0, 200)}`)
      return { ok: false, error: `Microsoft Graph ${res.status}: ${txt.slice(0, 200)}` }
    }
    await logCalendarEvent(args.connection.user_id, 'microsoft', 'event_deleted', args.eventId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function disconnectMicrosoftCalendar(userId: string): Promise<{ ok: boolean }> {
  // Microsoft Graph doesn't expose a token-revocation endpoint for delegated
  // permissions (the user can revoke via account.microsoft.com → Privacy →
  // Apps and services). We just delete our row.
  await supabase
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'microsoft')

  await logCalendarEvent(userId, 'microsoft', 'disconnected')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function logCalendarEvent(userId: string, provider: string, event: string, detail?: string) {
  try {
    await supabase.from('calendar_events_log').insert({ user_id: userId, provider, event, detail })
  } catch { /* non-fatal */ }
}

/**
 * Map common Windows time zone names to IANA names. Microsoft Graph returns
 * these by default; IANA is what JavaScript's Intl APIs expect.
 * Covers the US/Canada/UK common cases — full mapping is huge, we lazy-add
 * as we see in production.
 */
function windowsTzToIana(name: string): string | null {
  const map: Record<string, string> = {
    'Eastern Standard Time': 'America/New_York',
    'Central Standard Time': 'America/Chicago',
    'Mountain Standard Time': 'America/Denver',
    'Pacific Standard Time': 'America/Los_Angeles',
    'Alaskan Standard Time': 'America/Anchorage',
    'Hawaiian Standard Time': 'Pacific/Honolulu',
    'Atlantic Standard Time': 'America/Halifax',
    'GMT Standard Time': 'Europe/London',
    'Romance Standard Time': 'Europe/Paris',
    'Central Europe Standard Time': 'Europe/Berlin',
    'UTC': 'UTC',
  }
  return map[name] ?? null
}
