import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Push notification health diagnostic. Public read-only — reveals presence
 * of VAPID env vars + subscription counts WITHOUT exposing any secret values.
 *
 * Why this exists: configureVapid() in src/lib/push.ts throws when
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is unset, but the
 * exception is caught silently inside firePushAsync's fire-and-forget
 * wrapper. Push delivery fails invisibly. This endpoint surfaces the
 * config state so the bug can be diagnosed from a browser.
 *
 * Hit it: GET https://www.bellavego.com/api/push/diag
 */
export async function GET() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  const checks: Record<string, unknown> = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: {
      present: !!pub,
      length: pub?.length ?? 0,
      // VAPID public keys are uncompressed P-256 base64url-encoded → 87 chars,
      // start with 'B'. Cheap sanity check that it's not a paste error.
      shape_ok: !!pub && pub.length === 87 && pub.startsWith('B'),
    },
    VAPID_PRIVATE_KEY: {
      present: !!priv,
      length: priv?.length ?? 0,
      shape_ok: !!priv && priv.length === 43,
    },
    VAPID_SUBJECT: {
      present: !!subject,
      starts_with_mailto: subject?.startsWith('mailto:') ?? false,
    },
  }

  let subscriptionCount: number | null = null
  let dbError: string | null = null
  let demoOwnerUserId: string | null = null
  let demoOwnerSource: 'env' | 'profile_lookup' | 'not_found' = 'not_found'
  let demoOwnerSubs: number | null = null
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { count, error } = await sb
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
    if (error) dbError = error.message
    else subscriptionCount = count ?? 0

    // Resolve the demo owner (Peter) the same way the demo push fan-out does
    // — env first, then profile lookup by FALLBACK_OWNER_PHONE. Without this
    // signal, "push works for diag but not for demo calls" is invisible.
    const fromEnv = process.env.FALLBACK_OWNER_USER_ID
    if (fromEnv) {
      demoOwnerUserId = fromEnv
      demoOwnerSource = 'env'
    } else {
      const ownerPhone = process.env.FALLBACK_OWNER_PHONE
      if (ownerPhone) {
        const { data } = await sb
          .from('profiles')
          .select('user_id')
          .eq('owner_phone', ownerPhone)
          .maybeSingle()
        const id = (data as { user_id?: string } | null)?.user_id ?? null
        if (id) {
          demoOwnerUserId = id
          demoOwnerSource = 'profile_lookup'
        }
      }
    }
    if (demoOwnerUserId) {
      const { count: subCount } = await sb
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', demoOwnerUserId)
      demoOwnerSubs = subCount ?? 0
    }
  } catch (e) {
    dbError = (e as Error).message
  }

  const demoReady = !!demoOwnerUserId && (demoOwnerSubs ?? 0) > 0
  const allGood = !!pub && !!priv && !!subject && !dbError && demoReady
  return NextResponse.json(
    {
      ok: allGood,
      env: checks,
      push_subscriptions_total: subscriptionCount,
      demo_owner: {
        user_id: demoOwnerUserId,
        resolved_from: demoOwnerSource,
        device_count: demoOwnerSubs,
        ready: demoReady,
      },
      db_error: dbError,
      hint: !pub || !priv || !subject
        ? 'Set the missing env var(s) in Vercel → Settings → Environment Variables. Generate VAPID keys via `npx web-push generate-vapid-keys`.'
        : !demoOwnerUserId
        ? 'Demo owner unresolved. Set FALLBACK_OWNER_USER_ID env in Vercel to your Clerk user_id (visible in Clerk dashboard → Users), OR ensure a profile row has owner_phone matching FALLBACK_OWNER_PHONE.'
        : (demoOwnerSubs ?? 0) === 0
        ? 'Demo owner found but they have 0 push subscriptions. Open /dashboard on the device that should get push, accept the notification prompt, then re-check.'
        : 'All checks passing. Demo + tenant calls will both push to all registered devices.',
    },
    { status: allGood ? 200 : 500 },
  )
}
