/**
 * Web Push notification dispatcher.
 *
 * Architecture:
 *   - Each contractor's browser subscribes ONCE via PushNotificationSetup
 *     component (calls /api/push/subscribe)
 *   - Subscription stored in profiles.push_subscription
 *   - Backend calls sendPushToUser(userId, payload) to deliver
 *   - Uses VAPID auth (no Twilio, no Firebase project needed)
 *   - Free, ~1-2 sec latency to phone
 *
 * Replaces SMS for contractor-facing alerts. Bypasses A2P 10DLC entirely.
 * SMS path is kept as fallback for users who haven't installed the PWA.
 *
 * VAPID keys are one-time generated. Public key is exposed to the browser
 * (it's safe — anyone can have it). Private key MUST stay server-side.
 */
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Configure VAPID. Throws if keys aren't set — fail loud so we notice missing env.
let vapidConfigured = false
function configureVapid(): void {
  if (vapidConfigured) return
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:bellavegollc@gmail.com'
  if (!pub || !priv) {
    throw new Error(
      'Web Push not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in Vercel env',
    )
  }
  webpush.setVapidDetails(subject, pub, priv)
  vapidConfigured = true
}

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
  urgency?: 'emergency' | 'soon' | 'whenever'
  requireInteraction?: boolean
  data?: Record<string, unknown>
}

type PushSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Send a push notification to ONE contractor by user_id.
 *
 * Fire-and-forget — never throws (push delivery is best-effort, never block
 * the main lead-capture or booking flow on push delivery).
 *
 * Returns { ok, reason? } so callers can log delivery status without try/catch.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    configureVapid()
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_subscription')
      .eq('user_id', userId)
      .maybeSingle()

    const sub = (profile as { push_subscription?: PushSubscription | null } | null)?.push_subscription
    if (!sub || !sub.endpoint) {
      return { ok: false, reason: 'no subscription' }
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
      icon: payload.icon,
      badge: payload.badge,
      urgency: payload.urgency,
      requireInteraction: payload.requireInteraction,
      data: payload.data,
    })

    await webpush.sendNotification(sub, body, {
      // High urgency tells the push server to deliver immediately even if
      // the device is on battery saver. Use for emergencies + new leads.
      urgency: payload.urgency === 'emergency' ? 'high' : 'normal',
      TTL: 60 * 60 * 24, // keep 24h if device offline
    })
    return { ok: true }
  } catch (e) {
    const err = e as { statusCode?: number; message?: string }
    // 410 Gone / 404 Not Found = subscription expired (user uninstalled PWA
    // or revoked permission). Wipe the dead row so we stop retrying.
    if (err.statusCode === 404 || err.statusCode === 410) {
      try {
        await supabase
          .from('profiles')
          .update({ push_subscription: null, push_subscribed_at: null })
          .eq('user_id', userId)
      } catch {}
      return { ok: false, reason: 'subscription expired (cleared)' }
    }
    console.error(`[push] send to ${userId} failed:`, err.statusCode, err.message)
    return { ok: false, reason: `${err.statusCode}: ${err.message}` }
  }
}

/**
 * Fire-and-forget wrapper for use inside webhook handlers. Logs failures
 * but never propagates them — push is a secondary channel, the main email
 * + SMS paths must continue regardless.
 */
export function firePushAsync(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).then((r) => {
    if (!r.ok && r.reason !== 'no subscription') {
      console.warn(`[push] ${userId}: ${r.reason}`)
    }
  })
}
