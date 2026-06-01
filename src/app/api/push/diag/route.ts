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
  } catch (e) {
    dbError = (e as Error).message
  }

  const allGood = !!pub && !!priv && !!subject && !dbError
  return NextResponse.json(
    {
      ok: allGood,
      env: checks,
      push_subscriptions_total: subscriptionCount,
      db_error: dbError,
      hint: allGood
        ? 'Config OK. If pushes still missing, check sw.js registration + Notification.permission on the device.'
        : 'Set the missing env var(s) in Vercel → Settings → Environment Variables. Generate VAPID keys via `npx web-push generate-vapid-keys`.',
    },
    { status: allGood ? 200 : 500 },
  )
}
