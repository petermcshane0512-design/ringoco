/**
 * IG/FB engagement bot — CLI entry point.
 *
 * Runs locally on Peter's laptop. Reuses the user's home IP (residential,
 * looks real to Meta) and the saved session cookies stored in `.auth/`.
 * NOT runnable on Vercel — Playwright + browser don't fit in serverless
 * function limits.
 *
 * USAGE
 * -----
 *   # First-time setup (per platform): log in by hand, save session
 *   npx tsx scripts/social-engage.ts --login --platform=instagram
 *   npx tsx scripts/social-engage.ts --login --platform=facebook
 *
 *   # Normal daily run (headless, uses saved session)
 *   npx tsx scripts/social-engage.ts --platform=instagram --max=100
 *   npx tsx scripts/social-engage.ts --platform=facebook --max=50
 *
 *   # Dry-run (does everything except the actual click — for debugging)
 *   npx tsx scripts/social-engage.ts --platform=instagram --max=10 --dry-run --headed
 *
 *   # Both platforms back-to-back
 *   npx tsx scripts/social-engage.ts --platform=both
 *
 * SCHEDULING
 * ----------
 * Wire this into Windows Task Scheduler once per day around 9-10am CT so
 * the activity looks like a contractor checking IG with their morning coffee.
 * Don't schedule it back-to-back-to-back — that pattern reads as a bot.
 *
 * ENV
 * ---
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for engagement logging)
 *
 * CONFIG (in this file below) — edit the HASHTAGS / COMPETITORS / FB_GROUPS
 * constants to retarget the ICP.
 */
import { runEngagement, performInitialLogin, requiresInitialLogin } from '../src/lib/socialEngager'
import type { EngageConfig, Platform } from '../src/lib/socialEngager/types'

// ============================================================================
// EDIT THESE TO RETARGET YOUR ICP
// ============================================================================

const HASHTAGS = [
  'hvac',
  'hvaclife',
  'hvactechnician',
  'plumber',
  'plumberlife',
  'electrician',
  'contractorlife',
  'smallbusinessowner',
  'homeservices',
  'hvacbusiness',
]

// IG accounts whose followers are likely HVAC/plumbing/contractor owners
const COMPETITORS = [
  'rosie.ai',          // direct competitor — their follower base = our ICP
  'goodcall_ai',
  'servicetitan',
  'housecallpro',
  'jobber',
]

// FB groups full of HVAC contractors. URLs must be the group's main page.
const FB_GROUPS = [
  'https://www.facebook.com/groups/HVACTalk',
  'https://www.facebook.com/groups/plumbingcontractors',
  'https://www.facebook.com/groups/electricaltrade',
  // Add specific local/regional groups for higher conversion
]

// ============================================================================
// SAFETY CAPS — DO NOT RAISE WITHOUT THINKING
// ============================================================================
// IG action block trips around 200 follows/day for new accounts, 350-500 for
// aged accounts. We default well under that. Bump only after 2+ weeks of
// clean runs.
const DEFAULT_DAILY_CAP: Record<Platform, number> = {
  instagram: 120,
  facebook: 60,
}

// Random delay between actions. Lower bound matters more than upper —
// anything under 20s reads as automated.
const DELAY_MS = { min: 30 * 1000, max: 110 * 1000 }

// ============================================================================
// CLI parsing — bare-bones, no flag library to keep deps light
// ============================================================================

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`
  for (const a of process.argv.slice(2)) {
    if (a === `--${name}`) return 'true'
    if (a.startsWith(prefix)) return a.slice(prefix.length)
  }
  return fallback
}

function buildConfig(platform: Platform, max: number, headed: boolean, dryRun: boolean): EngageConfig {
  return {
    platform,
    maxActionsPerDay: max,
    minDelayMs: DELAY_MS.min,
    maxDelayMs: DELAY_MS.max,
    hashtags: HASHTAGS,
    competitors: COMPETITORS,
    fbGroupUrls: FB_GROUPS,
    headed,
    dryRun,
  }
}

async function main() {
  const platformArg = (arg('platform') ?? 'instagram').toLowerCase()
  const maxStr = arg('max')
  const headed = arg('headed') === 'true'
  const dryRun = arg('dry-run') === 'true'
  const loginMode = arg('login') === 'true'

  const platforms: Platform[] =
    platformArg === 'both' ? ['instagram', 'facebook'] : ([platformArg as Platform])

  if (!platforms.every((p) => p === 'instagram' || p === 'facebook')) {
    console.error(`Invalid --platform=${platformArg}. Use: instagram | facebook | both`)
    process.exit(1)
  }

  if (loginMode) {
    for (const p of platforms) {
      console.log(`[main] performing initial login for ${p}`)
      await performInitialLogin({ platform: p })
    }
    return
  }

  for (const p of platforms) {
    const initialBlocker = requiresInitialLogin(p, headed)
    if (initialBlocker) {
      console.error(`[main] ${initialBlocker}`)
      continue
    }
    const max = maxStr ? parseInt(maxStr, 10) : DEFAULT_DAILY_CAP[p]
    const config = buildConfig(p, max, headed, dryRun)
    console.log(`[main] starting ${p} run — cap=${max} dryRun=${dryRun} headed=${headed}`)
    const stats = await runEngagement(config)
    console.log(`[main] ${p} done`, stats)
  }
}

main().catch((e) => {
  console.error('[main] fatal:', e)
  process.exit(1)
})
