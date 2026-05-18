#!/usr/bin/env node
/**
 * A2P 10DLC status check.
 *
 * Reports current state of Customer Profile, A2P Brand, and Campaign registrations
 * in your Twilio account so we know exactly which steps remain.
 *
 * Usage: node scripts/a2p-status.mjs
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

const SID = process.env.TWILIO_ACCOUNT_SID
const TOK = process.env.TWILIO_AUTH_TOKEN
const basic = 'Basic ' + Buffer.from(`${SID}:${TOK}`).toString('base64')

async function tw(url) {
  const r = await fetch(url, { headers: { Authorization: basic } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  A2P 10DLC status')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// 1. Customer Profiles
console.log('1. Customer Profiles (Trust Hub):')
const profiles = await tw('https://trusthub.twilio.com/v1/CustomerProfiles')
const profList = (profiles.body.results ?? []).filter(p => p.policy_sid === 'RNdfbf3fae0e1107f8aded0e7cead80bf5')
if (profList.length === 0) {
  console.log('   ❌ NONE found. Start at: Trust Hub → Customer Profiles → New')
} else {
  for (const p of profList) {
    const stat = p.status === 'twilio-approved' ? '✅' : p.status === 'pending-review' ? '⏳' : '⚠️ '
    console.log(`   ${stat} ${p.friendly_name || '(no name)'}  status=${p.status}  sid=${p.sid}`)
  }
}
console.log('')

// 2. A2P Brands
console.log('2. A2P Brand Registrations:')
const brands = await tw('https://messaging.twilio.com/v1/a2p/BrandRegistrations')
const brandList = brands.body.data ?? []
if (brandList.length === 0) {
  console.log('   ❌ NONE registered. Need a Customer Profile approved first, then register.')
} else {
  for (const b of brandList) {
    const stat = b.status === 'APPROVED' ? '✅' : b.status === 'PENDING' || b.status === 'IN_REVIEW' ? '⏳' : '⚠️ '
    console.log(`   ${stat} type=${b.brand_type}  status=${b.status}  sid=${b.sid}`)
    if (b.failure_reason) console.log(`       failure: ${b.failure_reason}`)
    if (b.brand_score !== null && b.brand_score !== undefined) console.log(`       brand score: ${b.brand_score}`)
  }
}
console.log('')

// 3. A2P Campaigns (US App-To-Person Usage in any Messaging Service)
console.log('3. A2P Campaigns (US App-to-Person):')
const services = await tw('https://messaging.twilio.com/v1/Services?PageSize=20')
const svcList = services.body.services ?? []
let foundCampaign = false
for (const svc of svcList) {
  const usage = await tw(`https://messaging.twilio.com/v1/Services/${svc.sid}/Compliance/Usa2p`)
  const camps = usage.body.compliance ?? []
  if (camps.length > 0) {
    foundCampaign = true
    for (const c of camps) {
      const stat = c.campaign_status === 'VERIFIED' ? '✅' : c.campaign_status === 'IN_PROGRESS' ? '⏳' : '⚠️ '
      console.log(`   ${stat} service="${svc.friendly_name}"  campaign_status=${c.campaign_status}  use_case=${c.us_app_to_person_usecase}`)
    }
  }
}
if (!foundCampaign) {
  console.log('   ❌ NONE registered. Need an approved Brand first, then submit campaign.')
}
console.log('')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
