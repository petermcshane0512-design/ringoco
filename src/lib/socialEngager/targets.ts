/**
 * Target discovery — pulls handles to engage from IG hashtag pages and
 * competitor follower lists. Scrolls to load more, dedupes against the
 * Supabase log, and stops once we have `wanted` fresh targets.
 *
 * NOTE: IG aggressively rate-limits unauthenticated hashtag scraping, so
 * these run inside an authenticated browser context (login required).
 */
import type { Page } from 'playwright'
import type { EngageTarget } from './types'
import { alreadyEngaged } from './db'

function jitter(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min))
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Scrape recent posters from one IG hashtag page. Returns up to `wanted`
 * unique handles that haven't been followed yet.
 */
export async function discoverFromHashtag(opts: {
  page: Page
  tag: string
  wanted: number
}): Promise<EngageTarget[]> {
  const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(opts.tag)}/`
  await opts.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await sleep(jitter(1500, 3000))

  const seen = new Set<string>()
  const out: EngageTarget[] = []
  let lastHeight = 0

  for (let i = 0; i < 12 && out.length < opts.wanted; i++) {
    // Collect /USERNAME/ patterns from any anchor href on the page
    const handles = await opts.page.$$eval('a[href^="/"]', (anchors) =>
      anchors
        .map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '')
        .map((h) => h.replace(/^\//, '').replace(/\/$/, ''))
        .filter((h) => /^[A-Za-z0-9._]{2,30}$/.test(h)),
    )
    for (const h of handles) {
      if (out.length >= opts.wanted) break
      const lower = h.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      // Filter known non-profile paths
      if (['explore', 'reels', 'accounts', 'p', 'about', 'press', 'directory'].includes(lower)) continue
      if (await alreadyEngaged('instagram', lower, 'follow')) continue
      out.push({
        handle: lower,
        url: `https://www.instagram.com/${lower}/`,
        source: `hashtag:${opts.tag}`,
      })
    }
    // Scroll to load more
    const newHeight = await opts.page.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 1.5)
      return document.body.scrollHeight
    })
    if (newHeight === lastHeight) break
    lastHeight = newHeight
    await sleep(jitter(1200, 2600))
  }

  return out
}

/**
 * Scrape recent followers of an IG competitor account.
 *
 * IG locks the followers modal behind login + sometimes shows it as an
 * infinite-scroll list. We open the modal, scroll inside it, and collect
 * unique handles.
 */
export async function discoverFromCompetitorFollowers(opts: {
  page: Page
  competitor: string
  wanted: number
}): Promise<EngageTarget[]> {
  const url = `https://www.instagram.com/${opts.competitor}/`
  await opts.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await sleep(jitter(1500, 3000))

  // Click the "followers" link (it's a button/<a> with text matching /followers/)
  const followersLink = opts.page.locator('a[href$="/followers/"], a[href*="/followers"]').first()
  if (!(await followersLink.count())) return []
  await followersLink.click().catch(() => {})
  await sleep(jitter(1500, 3000))

  // The modal renders as a dialog with the list inside. Find scrollable container.
  const dialog = opts.page.locator('div[role="dialog"]').first()
  if (!(await dialog.count())) return []

  const seen = new Set<string>()
  const out: EngageTarget[] = []
  for (let i = 0; i < 20 && out.length < opts.wanted; i++) {
    const handles = await dialog.locator('a[href^="/"]').evaluateAll((els) =>
      els
        .map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? '')
        .map((h) => h.replace(/^\//, '').replace(/\/$/, ''))
        .filter((h) => /^[A-Za-z0-9._]{2,30}$/.test(h)),
    )
    for (const h of handles) {
      if (out.length >= opts.wanted) break
      const lower = h.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      if (lower === opts.competitor.toLowerCase()) continue
      if (await alreadyEngaged('instagram', lower, 'follow')) continue
      out.push({
        handle: lower,
        url: `https://www.instagram.com/${lower}/`,
        source: `competitor:${opts.competitor}`,
      })
    }
    // Scroll the dialog itself, not the page
    await dialog.evaluate((el) => {
      const scrollable = el.querySelector('div[style*="overflow"]') ?? el
      scrollable.scrollBy(0, 600)
    })
    await sleep(jitter(1000, 2000))
  }

  return out
}
