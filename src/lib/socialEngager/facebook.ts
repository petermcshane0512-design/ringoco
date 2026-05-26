/**
 * Facebook action layer — FB doesn't expose "follow another personal
 * profile" at scale anymore, so the play here is:
 *   1. Join HVAC/plumber/electrician contractor GROUPS (one-time)
 *   2. Like recent posts inside those groups (per-day engagement)
 *
 * This builds brand presence inside the watering holes where our ICP
 * already congregates, without triggering the bot detectors that mass-
 * follow patterns hit instantly.
 */
import type { Page } from 'playwright'
import type { EngageResult, EngageTarget } from './types'

async function detectBlock(page: Page): Promise<string | null> {
  const blockers = [
    'text=You can\'t use this feature right now',
    'text=temporarily blocked',
    'text=we\'ve disabled this feature',
    'text=Security Check',
    'text=Please solve the challenge',
  ]
  for (const sel of blockers) {
    if (await page.locator(sel).count()) return sel.replace('text=', '')
  }
  if (page.url().includes('/login')) return 'login_required'
  if (page.url().includes('/checkpoint')) return 'checkpoint_challenge'
  return null
}

/**
 * Visit a Facebook group and like the first N visible posts. Targets one
 * group per call — caller cycles through `fbGroupUrls`.
 *
 * Returns one EngageResult per post attempted.
 */
export async function likePostsInGroup(opts: {
  page: Page
  groupUrl: string
  maxLikes: number
  dryRun: boolean
}): Promise<EngageResult[]> {
  const { page, groupUrl, maxLikes } = opts
  const out: EngageResult[] = []

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (e) {
    out.push({
      ok: false,
      action: 'like',
      target: { handle: groupUrl, url: groupUrl, source: 'group' },
      status: 'failed',
      error: `nav failed: ${(e as Error).message}`,
    })
    return out
  }

  await page.waitForTimeout(2000 + Math.random() * 2000)

  const earlyBlock = await detectBlock(page)
  if (earlyBlock) {
    out.push({
      ok: false,
      action: 'like',
      target: { handle: groupUrl, url: groupUrl, source: 'group' },
      status: 'blocked',
      error: earlyBlock,
    })
    return out
  }

  // FB Like buttons inside a feed render as div[role=button] with aria-label
  // starting with "Like". After clicking, the aria-label flips to "Remove Like".
  // We grab all unclicked Like buttons in document order.
  for (let i = 0; i < maxLikes; i++) {
    const likeBtn = page
      .locator('div[role="button"][aria-label^="Like"]')
      .first()

    if (!(await likeBtn.count())) {
      // Scroll to load more posts
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2))
      await page.waitForTimeout(1500 + Math.random() * 1500)
      const stillNone = !(await likeBtn.count())
      if (stillNone) break
    }

    // Use the button's nearby permalink as the target identifier
    const postPermalink = await likeBtn
      .evaluate((el) => {
        const article = el.closest('div[role="article"]')
        const link = article?.querySelector('a[href*="/groups/"][href*="/posts/"], a[href*="/permalink/"]')
        return (link as HTMLAnchorElement | null)?.href ?? ''
      })
      .catch(() => '')

    const target: EngageTarget = {
      handle: postPermalink || `${groupUrl}#post-${i}`,
      url: postPermalink || groupUrl,
      source: `group:${groupUrl}`,
    }

    if (opts.dryRun) {
      out.push({ ok: true, action: 'like', target, status: 'success', error: 'dry-run' })
    } else {
      try {
        await likeBtn.scrollIntoViewIfNeeded()
        await likeBtn.click({ delay: 80 + Math.random() * 200 })
        await page.waitForTimeout(900 + Math.random() * 1500)
        const postBlock = await detectBlock(page)
        if (postBlock) {
          out.push({ ok: false, action: 'like', target, status: 'blocked', error: postBlock })
          return out
        }
        out.push({ ok: true, action: 'like', target, status: 'success' })
      } catch (e) {
        out.push({
          ok: false,
          action: 'like',
          target,
          status: 'failed',
          error: (e as Error).message,
        })
      }
    }

    // Pause between likes
    await page.waitForTimeout(8000 + Math.random() * 22000)
  }

  return out
}
