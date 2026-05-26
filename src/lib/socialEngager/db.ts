/**
 * Supabase logging + dedup + daily rate-limit guard for engagement bot.
 *
 * Single source of truth: the `social_engagements` table.
 */
import { createClient } from '@supabase/supabase-js'
import type { EngageAction, EngageResult, EngageTarget, Platform } from './types'

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
)

/**
 * Count today's successful actions for a platform. Used to enforce the
 * daily safety cap. "Today" = since 00:00 America/Chicago.
 */
export async function getTodayActionCount(platform: Platform): Promise<number> {
  const startOfDayCT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  startOfDayCT.setHours(0, 0, 0, 0)
  const { count, error } = await supa
    .from('social_engagements')
    .select('id', { count: 'exact', head: true })
    .eq('platform', platform)
    .eq('status', 'success')
    .gte('created_at', startOfDayCT.toISOString())
  if (error) {
    console.error('getTodayActionCount failed:', error.message)
    return 0
  }
  return count ?? 0
}

/**
 * Has this target already been engaged on this platform with this action?
 * Used to avoid following the same person twice (most common ban signal).
 */
export async function alreadyEngaged(
  platform: Platform,
  handle: string,
  action: EngageAction,
): Promise<boolean> {
  const { data, error } = await supa
    .from('social_engagements')
    .select('id')
    .eq('platform', platform)
    .eq('target_handle', handle.toLowerCase())
    .eq('action', action)
    .in('status', ['success', 'failed'])
    .limit(1)
  if (error) {
    console.error('alreadyEngaged check failed:', error.message)
    return false  // fail open — better to attempt than block on transient errors
  }
  return (data?.length ?? 0) > 0
}

export async function logEngagement(
  platform: Platform,
  result: EngageResult,
  target: EngageTarget,
): Promise<void> {
  const { error } = await supa.from('social_engagements').insert({
    platform,
    target_handle: target.handle.toLowerCase(),
    target_url: target.url,
    action: result.action,
    post_id: result.postId ?? null,
    source: target.source,
    status: result.status,
    error_msg: result.error ?? null,
  })
  if (error) console.error('logEngagement insert failed:', error.message)
}
