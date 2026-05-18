#!/usr/bin/env node
/**
 * Vercel state diagnostic.
 *
 * Reports:
 *   1. All projects in your Vercel account
 *   2. Which project owns bellavego.com (and www.bellavego.com)
 *   3. Env var names (not values) set on that project
 *   4. Latest deployment status
 *
 * Compares env vars against a checklist of what BellAveGo expects, flags
 * anything missing in red so we know what to add.
 *
 * Usage: node scripts/vercel-diagnose.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(here, '..', '.env.local')
    let text = readFileSync(envPath, 'utf8')
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 1) continue
      const k = line.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue
      let v = line.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  } catch {}
}
loadEnvLocal()

const TOKEN = process.env.VERCEL_TOKEN
if (!TOKEN) {
  console.error('❌ VERCEL_TOKEN not in .env.local')
  process.exit(1)
}

async function v(url) {
  const r = await fetch(`https://api.vercel.com${url}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// Required env vars for BellAveGo production. Anything missing → website breaks.
const REQUIRED_VARS = [
  // Core infra
  'NEXT_PUBLIC_APP_URL',
  // Auth
  'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_CLERK_SIGN_IN_URL', 'NEXT_PUBLIC_CLERK_SIGN_UP_URL',
  // DB
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  // Stripe
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_PRICE_OFFICEMGR_MONTHLY', 'STRIPE_PRICE_OFFICEMGR_ANNUAL',
  // Twilio
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  'TWILIO_DEMO_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID',
  'FALLBACK_OWNER_PHONE',
  // Vapi
  'VAPI_API_KEY', 'VAPI_ASSISTANT_ID', 'VAPI_WEBHOOK_SECRET',
  // Anthropic
  'ANTHROPIC_API_KEY',
  // Calendar
  'CRONOFY_CLIENT_ID', 'CRONOFY_CLIENT_SECRET',
  'CALENDAR_TOKEN_ENCRYPTION_KEY',
  // Google
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_PLACES_API_KEY',
  // Cron
  'CRON_SECRET',
]

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Vercel state diagnostic')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// 1. List all projects
console.log('1. Projects in your Vercel account:')
const projects = await v('/v10/projects')
if (projects.status !== 200) {
  console.error(`   ❌ API ${projects.status}: ${JSON.stringify(projects.body).slice(0, 200)}`)
  process.exit(1)
}
const projList = projects.body.projects ?? []
for (const p of projList) {
  console.log(`   - ${p.name}  (id=${p.id})  framework=${p.framework}`)
}
console.log('')

// 2. Find which project owns bellavego.com
console.log('2. Which project owns bellavego.com?')
let liveProject = null
for (const p of projList) {
  const domains = await v(`/v9/projects/${p.id}/domains`)
  const domList = domains.body.domains ?? []
  const match = domList.find((d) => d.name === 'bellavego.com' || d.name === 'www.bellavego.com')
  if (match) {
    liveProject = p
    console.log(`   ✅ LIVE project: "${p.name}"  (id=${p.id})`)
    console.log(`      Domains on this project:`)
    for (const d of domList) console.log(`        - ${d.name}${d.verified ? '' : ' (NOT verified)'}`)
    break
  }
}
if (!liveProject) {
  console.error('   ❌ No project owns bellavego.com — domain may be on a different account')
  process.exit(1)
}
console.log('')

// 3. Env vars on the live project (names only, never values)
console.log(`3. Env vars currently set on "${liveProject.name}" (Production):`)
const envs = await v(`/v9/projects/${liveProject.id}/env`)
const envList = envs.body.envs ?? []
const prodEnvNames = new Set(
  envList
    .filter((e) => e.target?.includes('production'))
    .map((e) => e.key),
)
console.log(`   (${prodEnvNames.size} vars total)`)
console.log('')

// Required-var check
console.log('4. Required-var checklist vs Vercel Production:')
const missing = []
for (const key of REQUIRED_VARS) {
  if (prodEnvNames.has(key)) {
    console.log(`   ✅ ${key}`)
  } else {
    console.log(`   ❌ ${key}  ← MISSING`)
    missing.push(key)
  }
}
console.log('')
if (missing.length === 0) {
  console.log('   🎉 All required vars present on Production.')
} else {
  console.log(`   ⚠️  ${missing.length} missing — site features may silently fail.`)
}
console.log('')

// 5. Latest deployment
console.log('5. Latest deployment:')
const deps = await v(`/v6/deployments?projectId=${liveProject.id}&limit=3&target=production`)
const depList = deps.body.deployments ?? []
for (const d of depList) {
  const when = new Date(d.created).toISOString().replace('T', ' ').slice(0, 19)
  const stateIcon = d.state === 'READY' ? '✅' : d.state === 'ERROR' ? '❌' : '⏳'
  console.log(`   ${stateIcon} ${when}  state=${d.state}  url=${d.url}`)
  if (d.meta?.githubCommitMessage) {
    console.log(`      commit: "${d.meta.githubCommitMessage.split('\n')[0].slice(0, 80)}"`)
  }
}
console.log('')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
