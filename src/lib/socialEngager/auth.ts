/**
 * Per-platform session state. Playwright's `storageState` saves cookies +
 * localStorage to a JSON file. First run is headed (you log in by hand),
 * subsequent runs reuse the state headless.
 *
 * State files live in ./.auth/ (gitignored). NEVER commit these — they are
 * full session bearer tokens for your Meta accounts.
 */
import fs from 'fs'
import path from 'path'
import { chromium, type BrowserContext, type Browser } from 'playwright'
import type { Platform } from './types'

const AUTH_DIR = path.join(process.cwd(), '.auth')

function statePath(platform: Platform): string {
  return path.join(AUTH_DIR, `${platform}.json`)
}

function hasSavedState(platform: Platform): boolean {
  return fs.existsSync(statePath(platform))
}

/**
 * Launch a Chromium browser with a realistic UA + locale + viewport. We pass
 * the saved storageState only when it exists; on first run we open headed
 * and let the user log in manually, then save state on close.
 */
export async function launchContextForPlatform(opts: {
  platform: Platform
  headed: boolean
}): Promise<{ browser: Browser; context: BrowserContext }> {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: !opts.headed,
    args: ['--disable-blink-features=AutomationControlled'],  // less obvious bot fingerprint
  })

  const stateFile = statePath(opts.platform)
  const context = await browser.newContext({
    storageState: hasSavedState(opts.platform) ? stateFile : undefined,
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  })

  return { browser, context }
}

/**
 * Save the current Playwright storage state to disk so the next run can
 * skip the manual login.
 */
export async function persistSessionState(
  context: BrowserContext,
  platform: Platform,
): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })
  await context.storageState({ path: statePath(platform) })
  console.log(`[auth] saved ${platform} session to ${statePath(platform)}`)
}

export function hasSessionFor(platform: Platform): boolean {
  return hasSavedState(platform)
}
