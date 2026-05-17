import { createClient } from '@supabase/supabase-js'
import { encryptToken, decryptToken } from './tokens'
import type { CalendarConnectionRow, FreeBusyBlock } from './google'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Calendly OAuth + read-only client.
 *
 * Calendly is itself a booking system, so "busy" means "already has a
 * scheduled Calendly event in the window." We pull all of the user's
 * scheduled_events and treat each one as a busy block. This means the AI
 * will avoid offering BellAveGo callbacks during slots the contractor
 * already has Calendly meetings on.
 *
 * Scope: `default` — read user profile + scheduled events. Calendly's
 * OAuth scope is implicit (no scope parameter needed). Requires Calendly
 * Standard tier or higher (free tier doesn't support OAuth integrations).
 *
 * Setup (one-time, in Calendly developer portal):
 *   1. https://developer.calendly.com/ → My Apps → Create App
 *   2. App type: OAuth → Web app
 *   3. Redirect URI: https://www.bellavego.com/api/calendar/calendly/callback
 *   4. Save and copy Client ID + Client Secret
 *   5. Env vars: CALENDLY_OAUTH_CLIENT_ID, CALENDLY_OAUTH_CLIENT_SECRET
 */

const CALENDLY_AUTH_URL = 'https://auth.calendly.com/oauth/authorize'
const CALENDLY_TOKEN_URL = 'https://auth.calendly.com/oauth/token'
const CALENDLY_API_BASE = 'https://api.calendly.com'

function getRedirectUri(): string {
  return (
    process.env.CALENDLY_OAUTH_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
      ? process.env.NEXT_PUBLIC_APP_URL
      : 'https://www.bellavego.com'}/api/calendar/calendly/callback`
  )
}

function requireOauthCreds() {
  const clientId = process.env.CALENDLY_OAUTH_CLIENT_ID
  const clientSecret = process.env.CALENDLY_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      'Calendly OAuth not configured. Set CALENDLY_OAUTH_CLIENT_ID and ' +
      'CALENDLY_OAUTH_CLIENT_SECRET in Vercel env (see src/lib/calendar/calendly.ts setup notes).',
    )
  }
  return { clientId, clientSecret }
}

export function buildCalendlyAuthUrl(userId: string, csrfState: string): string {
  const { clientId } = requireOauthCreds()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    state: `${userId}:${csrfState}`,
  })
  return `${CALENDLY_AUTH_URL}?${params.toString()}`
}

export async function handleCalendlyOAuthCallback(args: {
  code: string
  userId: string
}): Promise<{ ok: true; email?: string; name?: string } | { ok: false; error: string }> {
  const { code, userId } = args
  const { clientId, clientSecret } = requireOauthCreds()

  // Exchange code for tokens
  const tokenRes = await fetch(CALENDLY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
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
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
    scope?: string
    owner?: string             // URI like https://api.calendly.com/users/{uuid}
    organization?: string
  }

  // Fetch profile — we need the user URI to query scheduled_events later
  let email: string | undefined
  let name: string | undefined
  let userUri = tokens.owner || ''
  let timezone = 'America/Chicago'
  try {
    const meRes = await fetch(`${CALENDLY_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (meRes.ok) {
      const j = (await meRes.json()) as {
        resource?: { email?: string; name?: string; uri?: string; timezone?: string }
      }
      email = j.resource?.email
      name = j.resource?.name
      if (j.resource?.uri) userUri = j.resource.uri
      if (j.resource?.timezone) timezone = j.resource.timezone
    }
  } catch { /* non-fatal */ }

  const expiresAtIso = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  const { error: upsertErr } = await supabase.from('calendar_connections').upsert(
    {
      user_id: userId,
      provider: 'calendly',
      provider_account_email: email,
      provider_account_name: name,
      access_token_enc: encryptToken(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      token_expires_at: expiresAtIso,
      scope: tokens.scope,
      // Stash the user URI in calendar_id since Calendly addresses calendars
      // by user URI rather than a "calendar id"
      calendar_id: userUri,
      timezone,
      enabled: true,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' },
  )

  if (upsertErr) return { ok: false, error: `DB save failed: ${upsertErr.message}` }

  await logCalendarEvent(userId, 'calendly', 'connected', email)
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

  const res = await fetch(CALENDLY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    await logCalendarEvent(connection.user_id, 'calendly', 'refresh_failed', `${res.status} ${txt.slice(0, 120)}`)
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
      ...(j.refresh_token ? { refresh_token_enc: encryptToken(j.refresh_token) } : {}),
      token_expires_at: expiresAtIso,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id)
  await logCalendarEvent(connection.user_id, 'calendly', 'refresh_ok')
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
 * Query Calendly for scheduled events in a window — these are the contractor's
 * already-booked Calendly appointments. We treat each one as a busy block so
 * the AI doesn't offer a BellAveGo callback time that conflicts with a Calendly
 * meeting.
 *
 * Endpoint: GET /scheduled_events?user=<user_uri>&min_start_time=...&max_start_time=...
 */
export async function getCalendlyBusyBlocks(args: {
  connection: CalendarConnectionRow
  windowStart: Date
  windowEnd: Date
}): Promise<FreeBusyBlock[]> {
  const accessToken = await getValidAccessToken(args.connection)
  if (!accessToken || !args.connection.calendar_id) return []

  try {
    const params = new URLSearchParams({
      user: args.connection.calendar_id,             // we stashed user URI here
      min_start_time: args.windowStart.toISOString(),
      max_start_time: args.windowEnd.toISOString(),
      status: 'active',
      count: '100',
    })
    const res = await fetch(`${CALENDLY_API_BASE}/scheduled_events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      await logCalendarEvent(args.connection.user_id, 'calendly', 'error', `scheduled_events ${res.status}`)
      return []
    }
    const data = (await res.json()) as {
      collection?: Array<{
        start_time: string
        end_time: string
        status?: 'active' | 'canceled'
      }>
    }
    return (data.collection ?? [])
      .filter((ev) => ev.status !== 'canceled')
      .map((ev) => ({
        start: new Date(ev.start_time),
        end: new Date(ev.end_time),
      }))
  } catch (e) {
    await logCalendarEvent(args.connection.user_id, 'calendly', 'error', `scheduled_events threw: ${(e as Error).message}`)
    return []
  }
}

export async function disconnectCalendly(userId: string): Promise<{ ok: boolean }> {
  // Best-effort revoke at Calendly
  try {
    const { data: conn } = await supabase
      .from('calendar_connections')
      .select('access_token_enc')
      .eq('user_id', userId)
      .eq('provider', 'calendly')
      .maybeSingle()
    const { clientId, clientSecret } = requireOauthCreds()
    if (conn) {
      const token = decryptToken((conn as { access_token_enc: string }).access_token_enc)
      await fetch('https://auth.calendly.com/oauth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: new URLSearchParams({ token }),
      }).catch(() => {})
    }
  } catch { /* non-fatal */ }

  await supabase
    .from('calendar_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'calendly')

  await logCalendarEvent(userId, 'calendly', 'disconnected')
  return { ok: true }
}

async function logCalendarEvent(userId: string, provider: string, event: string, detail?: string) {
  try {
    await supabase.from('calendar_events_log').insert({ user_id: userId, provider, event, detail })
  } catch { /* non-fatal */ }
}
