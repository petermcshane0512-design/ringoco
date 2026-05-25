import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Save (or refresh) a Web Push subscription for the logged-in contractor.
 *
 * MULTI-DEVICE: each device the contractor enables push on writes its own
 * row to push_subscriptions, keyed by endpoint (the browser-generated
 * unique URL). Same device re-subscribing = idempotent upsert. Different
 * device = new row. Every alert fans out to every row for that user.
 *
 * Auth: Clerk session — subscriptions are scoped to user_id from session,
 * client can't forge a subscription for another tenant.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Derive a friendly device label from the request's User-Agent so the
 * dashboard can show "iPhone Safari · Desktop Chrome" instead of a
 * meaningless endpoint URL. Heuristic — not perfect, just useful.
 */
function deriveDeviceLabel(ua: string): string {
  if (!ua) return 'Unknown device'
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))
  const isIphone = /iPhone/.test(ua)
  const isAndroid = /Android/.test(ua)
  const isMac = /Macintosh/.test(ua) && !isIpad
  const isWin = /Windows/.test(ua)
  const isLinux = /Linux/.test(ua) && !isAndroid

  let browser = 'Browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari'

  let device = 'Browser'
  if (isIphone) device = 'iPhone'
  else if (isIpad) device = 'iPad'
  else if (isAndroid) device = 'Android'
  else if (isMac) device = 'Mac'
  else if (isWin) device = 'Windows'
  else if (isLinux) device = 'Linux'

  return `${device} · ${browser}`
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  let body: { subscription?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const sub = body.subscription as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | undefined
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json(
      { error: 'invalid subscription shape — missing endpoint or keys' },
      { status: 400 },
    )
  }

  const deviceLabel = deriveDeviceLabel(req.headers.get('user-agent') || '')

  // Upsert by endpoint — same device re-subscribing replaces its row;
  // different device gets its own row.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        subscription: sub,
        device_label: deviceLabel,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    console.error('push/subscribe: upsert failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Mirror to legacy profiles.push_subscription so any code still reading
  // the old column (e.g. dashboard "are alerts on?" badge if not yet
  // migrated) shows the right state. Safe to keep until that field is
  // fully retired.
  try {
    await supabase
      .from('profiles')
      .update({
        push_subscription: sub,
        push_subscribed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
  } catch {
    // Non-fatal — column may not exist after retirement
  }

  return NextResponse.json({ ok: true, device_label: deviceLabel })
}

/**
 * DELETE — clear THIS DEVICE'S subscription only.
 *
 * Body: { endpoint?: string } — if endpoint provided, only that device's
 * row is removed. If omitted, ALL of this user's devices are cleared
 * (used by "Turn off alerts everywhere" — rare).
 */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  let body: { endpoint?: string } = {}
  try {
    body = await req.json()
  } catch {
    // Empty body = clear all — that's the documented behavior
  }

  if (body.endpoint) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', body.endpoint)
  } else {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    await supabase
      .from('profiles')
      .update({ push_subscription: null, push_subscribed_at: null })
      .eq('user_id', userId)
  }

  return NextResponse.json({ ok: true })
}

/**
 * GET — return how many devices this user has subscribed.
 * Used by the dashboard widget to show "📱 2 devices · 1 missing"
 * and by onboarding to nudge them.
 */
export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  const { data, count } = await supabase
    .from('push_subscriptions')
    .select('device_label, last_seen_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false })

  return NextResponse.json({
    count: count ?? 0,
    devices: data ?? [],
  })
}
