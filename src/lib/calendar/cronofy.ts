import { createClient } from '@supabase/supabase-js'
import { encryptToken, decryptToken } from './tokens'
import type { CalendarConnectionRow, FreeBusyBlock } from './google'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Cronofy — unified calendar API.
 *
 * One OAuth flow covers Google Calendar, Microsoft Outlook, Office 365,
 * Exchange, Apple iCloud, Apple macOS Calendar, and any CalDAV calendar.
 * Cronofy handles the per-provider verification (we don't have to deal
 * with Google's OAuth verification gate).
 *
 * Architecture:
 *   1. We redirect user to Cronofy's authorize URL
 *   2. Cronofy shows "Choose your calendar provider" UI
 *   3. User picks Google/Outlook/etc, completes OAuth at that provider
 *   4. Cronofy redirects back to us with a code
 *   5. We exchange code for Cronofy access_token + refresh_token
 *   6. From now on we ONLY talk to Cronofy — they handle the underlying provider
 *
 * Free/busy:
 *   POST https://api.cronofy.com/v1/free_busy
 *   Returns busy periods across ALL user's connected calendars in one call
 *
 * Auto-create event (Phase 2):
 *   POST https://api.cronofy.com/v1/calendars/{calendar_id}/events
 *   Cronofy creates the event in the underlying provider's calendar
 *
 * Setup (one-time, at https://app.cronofy.com):
 *   1. Sign up + verify email
 *   2. Dashboard → Applications → + New Application
 *   3. Redirect URIs: https://www.bellavego.com/api/calendar/cronofy/callback
 *   4. Copy Client ID + Client Secret
 *   5. Env vars: CRONOFY_CLIENT_ID, CRONOFY_CLIENT_SECRET
 */

// Cronofy data residency — defaults to US. EU customers should set
// CRONOFY_API_HOST=https://api-de.cronofy.com (and AU = https://api-au.cronofy.com).
// We normalize: accept with or without the https:// prefix, strip any trailing slash.
function normalizeHost(raw: string | undefined, fallback: string): string {
  const h = (raw || fallback).trim().replace(/\/+$/, '')
  if (h.startsWith('http://') || h.startsWith('https://')) return h
  return `https://${h}`
}

const CRONOFY_API_HOST = normalizeHost(process.env.CRONOFY_API_HOST, 'https://api.cronofy.com')
// app.cronofy.com hosts OAuth for US. Derive the matching app host from the API
// host so EU/AU customers go through the right OAuth endpoint too.
const CRONOFY_APP_HOST = CRONOFY_API_HOST
  .replace('https://api-de.cronofy.com', 'https://app-de.cronofy.com')
  .replace('https://api-au.cronofy.com', 'https://app-au.cronofy.com')
  .replace('https://api.cronofy.com', 'https://app.cronofy.com')

const CRONOFY_AUTH_URL = `${CRONOFY_APP_HOST}/oauth/authorize`
const CRONOFY_TOKEN_URL = `${CRONOFY_API_HOST}/oauth/token`
const CRONOFY_API_BASE = `${CRONOFY_API_HOST}/v1`

// Scopes we request. read_free_busy is essential. create_event + delete_event
// unlock Phase 2 auto-booking. account_read pulls profile so we know the
// underlying provider account (email) for the connections list.
const SCOPES = [
  'read_free_busy',
  'read_events',
  'create_event',
  'delete_event',
  'account_read',
].join(' ')

function getRedirectUri(): string {
  return (
    process.env.CRONOFY_OAUTH_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'}/api/calendar/cronofy/callback`
  )
}

function requireOauthCreds() {
  const clientId = process.env.CRONOFY_CLIENT_ID
  const clientSecret = process.env.CRONOFY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Cronofy OAuth not configured. Set CRONOFY_CLIENT_ID and ' +
      'CRONOFY_CLIENT_SECRET in Vercel env (see src/lib/calendar/cronofy.ts setup notes).',
    )
  }
  return { clientId, clientSecret }
}

/** Build the consent URL we redirect contractors to when they click "Connect Calendar." */
export function buildCronofyAuthUrl(userId: string, csrfState: string): string {
  const { clientId } = requireOauthCreds()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state: `${userId}:${csrfState}`,
  })
  return `${CRONOFY_AUTH_URL}?${params.toString()}`
}

/** Exchange the auth code for Cronofy tokens + persist them encrypted. */
export async function handleCronofyOAuthCallback(args: {
  code: string
  userId: string
}): Promise<{ ok: true; email?: string; name?: string; provider?: string } | { ok: false; error: string }> {
  const { code, userId } = args
  const { clientId, clientSecret } = requireOauthCreds()

  // 1. Exchange code for tokens
  const tokenRes = await fetch(CRONOFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  })
  if (!tokenRes.ok) {
    const txt = await tokenRes.text().catch(() => '')
    return { ok: false, error: `Token exchange failed: ${tokenRes.status} ${txt.slice(0, 200)}` }
  }
  const tokens = (await tokenRes.json()) as {
    token_type?: string
    access_token: string
    refresh_token?: string
    expires_in?: number      // seconds
    scope?: string
    account_id?: string      // Cronofy account identifier
    sub?: string             // alternate id
    linking_profile?: { provider_name?: string; profile_id?: string; profile_name?: string }
  }

  // 2. Fetch userinfo so we can store provider + email on the connection row
  let email: string | undefined
  let name: string | undefined
  let provider: string | undefined
  let timezone = 'America/Chicago'
  try {
    const meRes = await fetch(`${CRONOFY_API_BASE}/userinfo`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (meRes.ok) {
      const u = (await meRes.json()) as {
        sub?: string
        email?: string
        name?: string
        'cronofy.type'?: string
        'cronofy.data'?: {
          profiles?: Array<{
            provider_name?: string
            profile_id?: string
            profile_name?: string
          }>
          authorization?: { scope?: string; status?: string }
        }
      }
      email = u.email
      name = u.name
      // Use the first profile's provider name (e.g. "google", "office365", "apple")
      provider = u['cronofy.data']?.profiles?.[0]?.provider_name
    }
  } catch { /* non-fatal */ }
  // Also fall back to linking_profile from token response if userinfo didn't help
  if (!provider) provider = tokens.linking_profile?.provider_name

  // 3. Pick a sensible default calendar to write into for Phase 2 auto-booking.
  //    Cronofy returns a list of writable calendars; we use the user's primary.
  let primaryCalendarId: string | null = null
  try {
    const calRes = await fetch(`${CRONOFY_API_BASE}/calendars`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (calRes.ok) {
      const data = (await calRes.json()) as {
        calendars?: Array<{
          calendar_id: string
          calendar_primary?: boolean
          calendar_deleted?: boolean
          calendar_readonly?: boolean
          profile_id?: string
        }>
      }
      const writable = (data.calendars ?? []).filter((c) => !c.calendar_deleted && !c.calendar_readonly)
      const primary = writable.find((c) => c.calendar_primary) || writable[0]
      primaryCalendarId = primary?.calendar_id ?? null
    }
  } catch { /* non-fatal — Phase 2 auto-booking will degrade gracefully */ }

  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: upsertErr } = await supabase.from('calendar_connections').upsert(
    {
      user_id: userId,
      provider: 'cronofy',  // single provider string for the cross-provider client
      provider_account_email: email,
      provider_account_name: name ? `${name}${provider ? ` (${provider})` : ''}` : provider,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      token_expires_at: expiresAtIso,
      scope: tokens.scope,
      calendar_id: primaryCalendarId,
      timezone,
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  )

  if (upsertErr) return { ok: false, error: `DB save failed: ${upsertErr.message}` }

  await logCalendarEvent(userId, 'cronofy', 'connected', `${provider ?? 'unknown'} · ${email ?? ''}`)
  return { ok: true, email, name, provider }
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

  const res = await fetch(CRONOFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    await logCalendarEvent(connection.user_id, 'cronofy', 'refresh_failed', `${res.status} ${txt.slice(0, 120)}`)
    if (res.status === 400 || res.status === 401) {
      await supabase
        .from('calendar_connections')
        .update({ enabled: false, last_error: 'refresh_token revoked — needs reconnect' })
        .eq('id', connection.id)
    }
    return null
  }
  const j = (await res.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }
  const expiresAtIso = j.expires_in
    ? new Date(Date.now() + j.expires_in * 1000).toISOString()
    : null
  await supabase
    .from('calendar_connections')
    .update({
      access_token_enc: encryptToken(j.access_token),
      ...(j.refresh_token ? { refresh_token_enc: encryptToken(j.refresh_token) } : {}),
      token_expires_at: expiresAtIso,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  await logCalendarEvent(connection.user_id, 'cronofy', 'refresh_ok')
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
 * Query Cronofy for busy blocks across ALL of the user's connected calendars
 * (whatever they linked via Cronofy — Google, Outlook, Apple, etc.).
 * One API call covers everything.
 */
export async function getCronofyBusyBlocks(args: {
  connection: CalendarConnectionRow
  windowStart: Date
  windowEnd: Date
}): Promise<FreeBusyBlock[]> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return []
  try {
    const params = new URLSearchParams({
      from: args.windowStart.toISOString(),
      to: args.windowEnd.toISOString(),
      tzid: args.connection.timezone || 'America/Chicago',
      include_managed: 'true',
    })
    const res = await fetch(`${CRONOFY_API_BASE}/free_busy?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      await logCalendarEvent(args.connection.user_id, 'cronofy', 'error', `free_busy ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      free_busy?: Array<{
        start: string
        end: string
        free_busy_status?: 'free' | 'busy' | 'tentative'
      }>
    }
    return (data.free_busy ?? [])
      .filter((b) => b.free_busy_status !== 'free')
      .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
  } catch (e) {
    await logCalendarEvent(args.connection.user_id, 'cronofy', 'error', `free_busy threw: ${(e as Error).message}`)
    return []
  }
}

/**
 * Auto-create an event in the user's calendar (Phase 2 auto-booking).
 * Cronofy creates the event in the underlying provider's calendar (Google,
 * Outlook, Apple, etc.) — we just give it the event details.
 *
 * eventId: caller-supplied unique ID (we use BellAveGo job ID). Lets Cronofy
 * dedupe — if we accidentally call twice for the same job, the second is
 * a no-op update instead of a duplicate event.
 */
export async function createCronofyEvent(args: {
  connection: CalendarConnectionRow
  eventId: string
  summary: string
  description?: string
  startIso: string
  endIso: string
  location?: string
  homeownerEmail?: string
}): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken) return { ok: false, error: 'no valid access token' }
  if (!args.connection.calendar_id) return { ok: false, error: 'no primary calendar id stored — reconnect' }

  try {
    const body: Record<string, unknown> = {
      event_id: args.eventId,
      summary: args.summary,
      start: args.startIso,
      end: args.endIso,
      tzid: args.connection.timezone || 'America/Chicago',
    }
    if (args.description) body.description = args.description
    if (args.location) body.location = { description: args.location }
    if (args.homeownerEmail) {
      body.attendees = { invite: [{ email: args.homeownerEmail }] }
    }

    const res = await fetch(
      `${CRONOFY_API_BASE}/calendars/${encodeURIComponent(args.connection.calendar_id)}/events`,
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
      await logCalendarEvent(args.connection.user_id, 'cronofy', 'error', `create_event ${res.status} ${txt.slice(0, 120)}`)
      return { ok: false, error: `Cronofy ${res.status}: ${txt.slice(0, 120)}` }
    }
    await logCalendarEvent(args.connection.user_id, 'cronofy', 'event_created', args.eventId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function disconnectCronofy(userId: string): Promise<{ ok: boolean }> {
  // Best-effort revoke at Cronofy
  try {
    const { data: conn } = await supabase
      .from('calendar_connections')
      .select('access_token_enc')
      .eq('user_id', userId)
      .eq('provider', 'cronofy')
      .maybeSingle()
    if (conn) {
      const { clientId, clientSecret } = requireOauthCreds()
      const token = decryptToken((conn as { access_token_enc: string }).access_token_enc)
      await fetch(`${CRONOFY_TOKEN_URL}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          token,
        }),
      }).catch(() => {})
    }
  } catch { /* non-fatal */ }

  await supabase
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'cronofy')

  await logCalendarEvent(userId, 'cronofy', 'disconnected')
  return { ok: true }
}

async function logCalendarEvent(userId: string, provider: string, event: string, detail?: string) {
  try {
    await supabase.from('calendar_events_log').insert({ user_id: userId, provider, event, detail })
  } catch { /* non-fatal */ }
}
