/**
 * Web Push notification dispatcher — MULTI-DEVICE edition.
 *
 * Each contractor can subscribe N devices (laptop + phone + tablet).
 * Every lead/booking alert fans out to ALL of their registered devices,
 * so whichever screen they're looking at lights up.
 *
 * Storage:
 *   - push_subscriptions table: one row per device (endpoint UNIQUE)
 *   - profiles.push_subscription: legacy single-row fallback (kept for
 *     backward compat with contractors who subscribed before mig 020)
 *
 * Failure handling:
 *   - 410 Gone / 404 Not Found = subscription dead → row auto-deleted
 *   - 429 Too Many Requests = push server throttling → log + skip
 *   - Everything else = log, continue with remaining devices
 *
 * VAPID keys live in env. Public key is exposed to browser (safe by design).
 */
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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

type StoredSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}

type SubscriptionRow = {
  id: string
  endpoint: string
  subscription: StoredSubscription
  device_label?: string | null
}

/**
 * Pull every active subscription for this user (multi-device table first,
 * legacy single-row column as fallback for contractors who haven't
 * re-subscribed since migration 020).
 */
async function loadAllSubscriptions(userId: string): Promise<SubscriptionRow[]> {
  // New table — preferred.
  const { data: rows } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription, device_label')
    .eq('user_id', userId)

  if (rows && rows.length > 0) {
    return rows as SubscriptionRow[]
  }

  // Legacy fallback — single subscription on profiles row.
  // Cleared automatically once the contractor re-subscribes (the new flow
  // writes to push_subscriptions and zeroes the legacy field).
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_subscription')
    .eq('user_id', userId)
    .maybeSingle()
  const sub = (profile as { push_subscription?: StoredSubscription | null } | null)?.push_subscription
  if (sub?.endpoint) {
    return [{ id: 'legacy', endpoint: sub.endpoint, subscription: sub }]
  }
  return []
}

/**
 * Send a push notification to EVERY device this contractor has registered.
 *
 * Fire-and-forget — never throws. Logs delivery per device. Removes dead
 * subscriptions (410/404) automatically so the table doesn't bloat with
 * uninstalled-PWA endpoints.
 *
 * Returns { ok, sent, failed, reason? } so callers can log delivery status.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ ok: boolean; sent: number; failed: number; reason?: string }> {
  try {
    configureVapid()
  } catch (e) {
    return { ok: false, sent: 0, failed: 0, reason: (e as Error).message }
  }

  const subs = await loadAllSubscriptions(userId)
  if (subs.length === 0) {
    return { ok: false, sent: 0, failed: 0, reason: 'no subscriptions' }
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

  let sent = 0
  let failed = 0
  const deadEndpoints: string[] = []
  const liveEndpoints: string[] = []

  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, body, {
          urgency: payload.urgency === 'emergency' ? 'high' : 'normal',
          TTL: 60 * 60 * 24,
        })
        sent++
        liveEndpoints.push(row.endpoint)
      } catch (e) {
        failed++
        const err = e as { statusCode?: number; message?: string }
        // 404/410 = subscription expired (PWA uninstalled, browser data
        // cleared, or push service revoked). Remove the dead row so we
        // stop retrying it on every alert.
        if (err.statusCode === 404 || err.statusCode === 410) {
          deadEndpoints.push(row.endpoint)
        } else {
          console.error(`[push] ${userId} device ${row.endpoint.slice(-12)}: ${err.statusCode} ${err.message}`)
        }
      }
    }),
  )

  // Cleanup dead subscriptions (multi-row + legacy column).
  if (deadEndpoints.length > 0) {
    try {
      await supabase.from('push_subscriptions').delete().in('endpoint', deadEndpoints)
      // If the legacy single-row matched a dead endpoint, clear it too.
      for (const ep of deadEndpoints) {
        if (subs.find((s) => s.id === 'legacy' && s.endpoint === ep)) {
          await supabase
            .from('profiles')
            .update({ push_subscription: null, push_subscribed_at: null })
            .eq('user_id', userId)
        }
      }
    } catch (e) {
      console.warn('[push] cleanup of dead endpoints failed:', e)
    }
  }

  // Touch last_seen_at on successful sends so dashboards can show "your
  // iPhone hasn't received a push in 7 days — re-enable?" later.
  if (liveEndpoints.length > 0) {
    try {
      await supabase
        .from('push_subscriptions')
        .update({ last_seen_at: new Date().toISOString() })
        .in('endpoint', liveEndpoints)
    } catch {
      // Non-fatal — last_seen is observability, not behavior.
    }
  }

  return { ok: sent > 0, sent, failed }
}

/**
 * Fire-and-forget wrapper for webhook handlers. Push is a secondary
 * channel — never block the main email/SMS path on push delivery.
 */
export function firePushAsync(userId: string, payload: PushPayload): void {
  sendPushToUser(userId, payload).then((r) => {
    if (r.sent > 0) {
      console.log(`[push] ${userId}: delivered to ${r.sent}/${r.sent + r.failed} devices`)
    } else if (r.reason !== 'no subscriptions') {
      console.warn(`[push] ${userId}: 0 delivered (${r.reason || 'unknown'})`)
    }
  })
}

/**
 * Count of devices a contractor has registered. Used by the dashboard
 * + onboarding flow to nudge them ("you have 0 devices set up — phone
 * alerts are off") and by the day-1 nudge email cron.
 */
export async function getDeviceCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (count && count > 0) return count

  // Legacy fallback — 1 device if profiles.push_subscription is set.
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_subscription')
    .eq('user_id', userId)
    .maybeSingle()
  return (profile as { push_subscription?: unknown } | null)?.push_subscription ? 1 : 0
}
