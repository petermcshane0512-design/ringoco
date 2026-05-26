/**
 * Main run loop for the IG/FB engagement bot.
 *
 * Flow per run:
 *   1. Check today's action count vs maxActionsPerDay (abort if over)
 *   2. Launch Playwright with saved session
 *   3. Discover targets from configured sources
 *   4. For each target: perform action, log result, sleep random delay
 *   5. Abort run on any "blocked" status (action block / captcha)
 *   6. Save updated session state + close browser
 */
import type { BrowserContext, Page } from 'playwright'
import { launchContextForPlatform, persistSessionState, hasSessionFor } from './auth'
import { getTodayActionCount, logEngagement } from './db'
import { discoverFromHashtag, discoverFromCompetitorFollowers } from './targets'
import { followIgProfile } from './instagram'
import { likePostsInGroup } from './facebook'
import type { EngageConfig, EngageResult, EngageTarget } from './types'

export type { EngageConfig } from './types'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function randomDelay(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs))
}

/**
 * First-run guard — if no saved session and not in headed mode, refuse to
 * run. Headless login won't work; user must log in by hand once.
 */
export function requiresInitialLogin(platform: 'instagram' | 'facebook', headed: boolean): string | null {
  if (!hasSessionFor(platform) && !headed) {
    return `No saved ${platform} session at .auth/${platform}.json — re-run with --headed to log in once. The bot will save the session for future headless runs.`
  }
  return null
}

/**
 * Headed first-run helper. Opens the platform's login page and waits up to
 * 5 minutes for the user to finish logging in (detected by URL change away
 * from /accounts/login or /login).
 */
export async function performInitialLogin(opts: {
  platform: 'instagram' | 'facebook'
}): Promise<void> {
  const { browser, context } = await launchContextForPlatform({ platform: opts.platform, headed: true })
  const page = await context.newPage()
  const loginUrl =
    opts.platform === 'instagram'
      ? 'https://www.instagram.com/accounts/login/'
      : 'https://www.facebook.com/login'
  console.log(`[login] opening ${loginUrl} — please log in. Bot will detect completion and save the session automatically.`)
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' })

  const start = Date.now()
  const deadline = start + 5 * 60 * 1000  // 5 min
  while (Date.now() < deadline) {
    const url = page.url()
    if (opts.platform === 'instagram' && !url.includes('/accounts/login') && url.includes('instagram.com')) {
      // Wait a beat for cookies to settle
      await page.waitForTimeout(2500)
      break
    }
    if (opts.platform === 'facebook' && !url.includes('/login') && url.includes('facebook.com')) {
      await page.waitForTimeout(2500)
      break
    }
    await page.waitForTimeout(2000)
  }

  await persistSessionState(context, opts.platform)
  await browser.close()
}

/**
 * Instagram run — discover targets from hashtags + competitors, follow.
 */
async function runInstagramRun(opts: {
  context: BrowserContext
  page: Page
  config: EngageConfig
  remainingBudget: number
}): Promise<EngageResult[]> {
  const { context, page, config } = opts
  let budget = opts.remainingBudget
  const out: EngageResult[] = []

  // Build the target pool. We pull ~1.5x the budget so dedup attrition doesn't
  // leave us short.
  const goal = Math.ceil(budget * 1.5)
  const perSource = Math.max(5, Math.ceil(goal / Math.max(1, config.hashtags.length + config.competitors.length)))
  const targets: EngageTarget[] = []
  for (const tag of config.hashtags) {
    if (targets.length >= goal) break
    const found = await discoverFromHashtag({ page, tag, wanted: perSource })
    targets.push(...found)
    console.log(`[ig:targets] hashtag=${tag} found=${found.length} (total ${targets.length})`)
  }
  for (const competitor of config.competitors) {
    if (targets.length >= goal) break
    const found = await discoverFromCompetitorFollowers({ page, competitor, wanted: perSource })
    targets.push(...found)
    console.log(`[ig:targets] competitor=${competitor} found=${found.length} (total ${targets.length})`)
  }

  // Shuffle so we don't burn through one source before touching others
  for (let i = targets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[targets[i], targets[j]] = [targets[j], targets[i]]
  }

  for (const target of targets) {
    if (budget <= 0) break
    const result = await followIgProfile({ page, target, dryRun: config.dryRun })
    await logEngagement('instagram', result, target)
    out.push(result)
    console.log(
      `[ig:${result.status}] ${target.handle} src=${target.source}` +
        (result.error ? ` err=${result.error}` : ''),
    )
    if (result.status === 'blocked') {
      console.error('[ig] action block detected — aborting run')
      break
    }
    if (result.status === 'success') budget--
    // Persist session every 10 actions in case we crash
    if (out.length % 10 === 0) await persistSessionState(context, 'instagram').catch(() => {})
    await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))
  }

  return out
}

/**
 * Facebook run — like recent posts inside HVAC contractor groups.
 */
async function runFacebookRun(opts: {
  context: BrowserContext
  page: Page
  config: EngageConfig
  remainingBudget: number
}): Promise<EngageResult[]> {
  const { context, page, config } = opts
  let budget = opts.remainingBudget
  const out: EngageResult[] = []
  const groups = [...config.fbGroupUrls]
  // Shuffle group order so we don't always hit the same group first
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
  }

  outer: for (const groupUrl of groups) {
    if (budget <= 0) break
    const perGroup = Math.min(budget, 8)  // cap per group to spread engagement
    const results = await likePostsInGroup({ page, groupUrl, maxLikes: perGroup, dryRun: config.dryRun })
    for (const r of results) {
      await logEngagement('facebook', r, r.target)
      out.push(r)
      console.log(`[fb:${r.status}] ${r.target.handle.slice(0, 60)}${r.error ? ` err=${r.error}` : ''}`)
      if (r.status === 'blocked') {
        console.error('[fb] action block detected — aborting run')
        break outer
      }
      if (r.status === 'success') budget--
    }
    await persistSessionState(context, 'facebook').catch(() => {})
    await sleep(randomDelay(config.minDelayMs, config.maxDelayMs))
  }

  return out
}

export async function runEngagement(config: EngageConfig): Promise<{
  attempted: number
  succeeded: number
  blocked: number
  failed: number
  skipped: number
}> {
  const todayCount = await getTodayActionCount(config.platform)
  const remaining = Math.max(0, config.maxActionsPerDay - todayCount)
  console.log(`[run] platform=${config.platform} todayCount=${todayCount} budget=${remaining}`)
  if (remaining === 0) {
    return { attempted: 0, succeeded: 0, blocked: 0, failed: 0, skipped: 0 }
  }

  const { browser, context } = await launchContextForPlatform({
    platform: config.platform,
    headed: config.headed,
  })
  const page = await context.newPage()

  let results: EngageResult[] = []
  try {
    if (config.platform === 'instagram') {
      results = await runInstagramRun({ context, page, config, remainingBudget: remaining })
    } else {
      results = await runFacebookRun({ context, page, config, remainingBudget: remaining })
    }
  } finally {
    await persistSessionState(context, config.platform).catch(() => {})
    await browser.close().catch(() => {})
  }

  const succeeded = results.filter((r) => r.status === 'success').length
  const blocked = results.filter((r) => r.status === 'blocked').length
  const failed = results.filter((r) => r.status === 'failed').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  return { attempted: results.length, succeeded, blocked, failed, skipped }
}
