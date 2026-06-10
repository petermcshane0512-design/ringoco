import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export type CronMode = 'vercel_cron' | 'admin_secret' | 'unauthorized'

/**
 * Record an invocation of a cron route. Called at the top of each route,
 * BEFORE the auth gate, so we can distinguish scheduled fires from manual
 * triggers from unauthorized hits.
 *
 * Returns an id; call recordCronFinish(id, ...) at the end of the route
 * with the summary stats.
 *
 * Failure-silent: never throws. If the row insert fails, the cron still
 * runs — observability shouldn't gate execution.
 */
export async function recordCronStart(route: string, mode: CronMode): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('cron_runs')
      .insert({ route, mode, started_at: new Date().toISOString() })
      .select('id')
      .single()
    if (error || !data) return null
    return (data as { id: string }).id
  } catch {
    return null
  }
}

export async function recordCronFinish(
  id: string | null,
  ok: boolean,
  detail: Record<string, unknown> | null,
  startedAtMs: number,
): Promise<void> {
  if (!id) return
  try {
    await supabase.from('cron_runs').update({
      finished_at: new Date().toISOString(),
      ok,
      detail,
      duration_ms: Date.now() - startedAtMs,
    }).eq('id', id)
  } catch {
    // swallow
  }
}

export function classifyCronAuth(req: Request, expectedAdminSecret: string | undefined): CronMode {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (isCron) return 'vercel_cron'
  const adminSecret = req.headers.get('x-admin-secret')
  if (expectedAdminSecret && adminSecret === expectedAdminSecret) return 'admin_secret'
  return 'unauthorized'
}
