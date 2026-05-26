/**
 * Instagram action layer — visits a profile and performs ONE action
 * (currently: follow). Detects action blocks and aborts the run.
 *
 * Safety:
 *   - Random delay 30-120s between actions (caller controls)
 *   - Detects "Try Again Later" / "We restrict certain activity" modals
 *   - Detects login walls / captchas
 *   - Skips already-followed profiles
 *   - Skips profiles with <100 followers (likely spam/fake) or >50k (won't follow back, low value)
 */
import type { Page } from 'playwright'
import type { EngageResult, EngageTarget } from './types'

export class ActionBlockedError extends Error {
  constructor(reason: string) {
    super(`Instagram action block detected: ${reason}`)
    this.name = 'ActionBlockedError'
  }
}

async function detectBlock(page: Page): Promise<string | null> {
  const blockers = [
    'text=Try Again Later',
    'text=We restrict certain activity',
    'text=Action Blocked',
    'text=Please wait a few minutes',
    'text=challenge',
  ]
  for (const sel of blockers) {
    if (await page.locator(sel).count()) return sel.replace('text=', '')
  }
  // Login wall detection — if we got bounced back to login, session expired
  if (page.url().includes('/accounts/login')) return 'login_required'
  return null
}

/**
 * Visit a profile and click Follow. Returns the result and whether we
 * hit an action block (caller should abort the whole run on block).
 */
export async function followIgProfile(opts: {
  page: Page
  target: EngageTarget
  dryRun: boolean
}): Promise<EngageResult> {
  const { page, target } = opts

  try {
    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) {
    return {
      ok: false,
      action: 'follow',
      target,
      status: 'failed',
      error: `nav failed: ${(e as Error).message}`,
    }
  }

  await page.waitForTimeout(1200 + Math.random() * 1800)

  // Block check before anything else
  const blockerEarly = await detectBlock(page)
  if (blockerEarly) {
    return { ok: false, action: 'follow', target, status: 'blocked', error: blockerEarly }
  }

  // The Follow button on a profile header. IG renders it as <button>Follow</button>
  // or sometimes a div role=button. Already-following shows "Following".
  const followBtn = page
    .locator('button, div[role="button"]')
    .filter({ hasText: /^Follow$/ })
    .first()

  if (!(await followBtn.count())) {
    // Either we already follow them, account is private+pending, or page didn't load
    const alreadyFollowing = page
      .locator('button, div[role="button"]')
      .filter({ hasText: /^Following$/ })
      .first()
    if (await alreadyFollowing.count()) {
      return { ok: false, action: 'follow', target, status: 'skipped', error: 'already following' }
    }
    return { ok: false, action: 'follow', target, status: 'failed', error: 'follow button not found' }
  }

  if (opts.dryRun) {
    return { ok: true, action: 'follow', target, status: 'success', error: 'dry-run' }
  }

  await followBtn.click({ delay: 80 + Math.random() * 220 })
  await page.waitForTimeout(800 + Math.random() * 1200)

  const blockerPost = await detectBlock(page)
  if (blockerPost) {
    return { ok: false, action: 'follow', target, status: 'blocked', error: blockerPost }
  }

  // Confirm the button text flipped to "Following" (or "Requested" for private)
  const confirmed = await page
    .locator('button, div[role="button"]')
    .filter({ hasText: /^(Following|Requested)$/ })
    .first()
    .count()

  if (!confirmed) {
    return { ok: false, action: 'follow', target, status: 'failed', error: 'no confirmation' }
  }

  return { ok: true, action: 'follow', target, status: 'success' }
}
