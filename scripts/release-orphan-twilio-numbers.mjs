#!/usr/bin/env node
/**
 * release-orphan-twilio-numbers.mjs
 *
 * Audits every IncomingPhoneNumber on the Twilio account, cross-references
 * against profiles.twilio_number in Supabase, and releases any number that
 * isn't claimed by a live profile. Stops paying ~$1.15/month on numbers
 * stranded by deleted test accounts.
 *
 * Run:
 *   node scripts/release-orphan-twilio-numbers.mjs            (dry run)
 *   node scripts/release-orphan-twilio-numbers.mjs --apply    (release)
 *
 * Safety:
 *   - Never touches a number whose friendlyName starts with "BellAveGo Demo"
 *     (those are reserved demo lines like 651-467-7829).
 *   - Skips numbers attached to ANY active profile, not just is_active=true,
 *     so cancelled-but-not-yet-deprovisioned customers aren't deleted by us.
 *   - Cross-checks against profile twilio_number stored in any format
 *     (+1AAA, AAA, (AAA), etc.) by normalizing to E.164.
 */

import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const APPLY = process.argv.includes('--apply')

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.error('TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN must be in .env.local')
  process.exit(1)
}
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function toE164(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (raw.startsWith('+')) return raw
  return null
}

function isReservedNumber(num, friendlyName) {
  // Demo line + main office line — never auto-release.
  const reservedEnvs = [
    process.env.TWILIO_PHONE_NUMBER,
    process.env.TWILIO_DEMO_NUMBER,
    process.env.FALLBACK_OWNER_PHONE,
  ].filter(Boolean).map(toE164)
  if (reservedEnvs.includes(toE164(num))) return true
  const fn = (friendlyName || '').toLowerCase()
  if (fn.startsWith('bellavego demo')) return true
  if (fn.includes('demo')) return true
  if (fn.includes('office')) return true
  return false
}

console.log(`🔍 Audit mode: ${APPLY ? 'APPLY (will release orphans)' : 'DRY RUN'}\n`)

// 1. Pull every Twilio incoming number we own.
console.log('📞 Listing Twilio numbers...')
const allTwilio = await twilioClient.incomingPhoneNumbers.list({ limit: 1000 })
console.log(`   ${allTwilio.length} numbers on the account.\n`)

// 2. Pull every profile.twilio_number from Supabase.
console.log('🗄️  Pulling profile claims...')
const { data: profiles, error } = await supabase
  .from('profiles')
  .select('user_id, twilio_number, business_name, plan_tier, is_active')
if (error) {
  console.error(`Supabase pull failed: ${error.message}`)
  process.exit(1)
}
const claimed = new Set(
  (profiles || [])
    .map(p => toE164(p.twilio_number))
    .filter(Boolean),
)
console.log(`   ${claimed.size} numbers claimed by ${profiles.length} profiles.\n`)

// 3. Bucket Twilio numbers.
const orphans = []
const reserved = []
const live = []
for (const t of allTwilio) {
  const num = t.phoneNumber
  if (isReservedNumber(num, t.friendlyName)) {
    reserved.push(t)
    continue
  }
  if (claimed.has(num)) {
    live.push(t)
    continue
  }
  orphans.push(t)
}

console.log(`   Live (claimed by a profile):  ${live.length}`)
console.log(`   Reserved (demo / office):     ${reserved.length}`)
console.log(`   🚨 Orphans (no profile):       ${orphans.length}\n`)

if (orphans.length > 0) {
  console.log('Orphan details:')
  for (const o of orphans) {
    console.log(
      `   ${o.phoneNumber}  sid=${o.sid}  friendlyName="${o.friendlyName || ''}"  created=${o.dateCreated?.toISOString?.() ?? '?'}`,
    )
  }
  console.log()
}

if (!APPLY) {
  console.log('💡 Dry run — re-run with --apply to release the orphans.')
  console.log(`💰 Estimated savings: ~$${(orphans.length * 1.15).toFixed(2)}/mo`)
  process.exit(0)
}

// 4. Release each orphan.
let released = 0
let failed = 0
for (const o of orphans) {
  try {
    await twilioClient.incomingPhoneNumbers(o.sid).remove()
    console.log(`   ✅ Released ${o.phoneNumber} (sid=${o.sid})`)
    released++
  } catch (e) {
    console.error(`   ❌ Failed to release ${o.phoneNumber}: ${e.message}`)
    failed++
  }
}

console.log(`\n📊 Result: ${released} released, ${failed} failed.`)
console.log(`💰 Monthly savings: ~$${(released * 1.15).toFixed(2)}`)
