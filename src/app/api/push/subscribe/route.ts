import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Save (or refresh) the browser's Web Push subscription for the logged-in
 * contractor. Client posts the subscription object returned by
 * pushManager.subscribe(). We store the latest one — re-installing the PWA
 * overwrites the previous subscription.
 *
 * Auth: Clerk session. Subscriptions are scoped to user_id from session;
 * client can't forge a subscription for another tenant.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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

  const { error } = await supabase
    .from('profiles')
    .update({
      push_subscription: sub,
      push_subscribed_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    console.error('push/subscribe: update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Allow the client to clear its subscription (e.g. user disables notifications
 * in the dashboard). Same auth scope.
 */
export async function DELETE() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ push_subscription: null, push_subscribed_at: null })
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
