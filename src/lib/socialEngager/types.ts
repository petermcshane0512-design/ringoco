/**
 * Shared types for the IG/FB engagement bot.
 *
 * Architecture: a "run" picks N targets from one of several sources
 * (IG hashtag, IG competitor follower list, FB group), then performs
 * one or more actions per target (follow / like / comment / join_group).
 * Every action is logged to `social_engagements` for dedup, rate-limit
 * enforcement, and ROI auditing.
 */
export type Platform = 'instagram' | 'facebook'
export type EngageAction = 'follow' | 'like' | 'comment' | 'view' | 'join_group'

export interface EngageConfig {
  platform: Platform
  maxActionsPerDay: number  // safety ceiling per UTC-but-CT day
  minDelayMs: number        // floor between actions
  maxDelayMs: number        // ceiling between actions
  hashtags: string[]        // IG hashtag sources (without #)
  competitors: string[]     // IG handles whose followers we mine (no @)
  fbGroupUrls: string[]     // FB group URLs the bot engages in
  headed: boolean           // show browser window (first-run login / debug)
  dryRun: boolean           // do everything except the actual click
}

export interface EngageTarget {
  handle: string            // @username (stored without @) or FB profile id
  url: string               // direct profile / post URL
  source: string            // "hashtag:hvac" | "competitor:rosie_ai" | "group:abc"
}

export interface EngageResult {
  ok: boolean
  action: EngageAction
  target: EngageTarget
  status: 'success' | 'failed' | 'blocked' | 'skipped'
  error?: string
  postId?: string
}
