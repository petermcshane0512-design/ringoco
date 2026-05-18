#!/usr/bin/env node
/**
 * STAGE 2 of A2P 10DLC registration (runs AFTER Customer Profile is twilio-approved).
 *
 * What it does:
 *   1. Reads .a2p-state.json (created by a2p-submit-profile.mjs)
 *   2. Verifies the Customer Profile is in twilio-approved state
 *   3. Submits A2P Brand Registration (Sole Prop, $4 one-time)
 *   4. Polls every minute for Brand approval (typically <10 min for sole prop)
 *   5. Submits A2P Campaign with sample messages + use case + opt-in flow
 *   6. Attaches Campaign to the BellAveGo Platform Messaging Service
 *   7. Saves updated state. Carriers review the campaign for 1-3 weeks.
 *
 * Usage:
 *   node scripts/a2p-brand-and-campaign.mjs
 *
 * Safe to re-run — checks for existing Brand/Campaign before creating new ones.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const statePath = resolve(__dirname, '..', '.a2p-state.json')

if (!existsSync(statePath)) {
  console.error('❌ No .a2p-state.json — run scripts/a2p-submit-profile.mjs first.')
  process.exit(1)
}
const state = JSON.parse(readFileSync(statePath, 'utf8'))
const profileSid = state.customer_profile_sid
if (!profileSid) {
  console.error('❌ .a2p-state.json missing customer_profile_sid.')
  process.exit(1)
}

const SID = process.env.TWILIO_ACCOUNT_SID
const TOK = process.env.TWILIO_AUTH_TOKEN
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG75857e6be669188435e5ad61dca6a84d'
const basic = 'Basic ' + Buffer.from(`${SID}:${TOK}`).toString('base64')

async function tw(method, url, body) {
  const opts = { method, headers: { Authorization: basic } }
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    opts.body = new URLSearchParams(body).toString()
  }
  const r = await fetch(url, opts)
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, ok: r.ok, body: json ?? text }
}

function die(label, res) {
  console.error(`\n❌ ${label} → ${res.status}`)
  console.error('   ' + JSON.stringify(res.body, null, 2))
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  A2P Brand + Campaign auto-pilot')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
console.log(`  Customer Profile:  ${profileSid}`)
console.log(`  Messaging Service: ${MESSAGING_SERVICE_SID}`)
console.log('')

// ── Step 1: confirm Customer Profile is approved ──
console.log('1. Checking Customer Profile status...')
const profCheck = await tw('GET', `https://trusthub.twilio.com/v1/CustomerProfiles/${profileSid}`)
if (!profCheck.ok) die('Fetch Customer Profile', profCheck)
const profStatus = profCheck.body.status
console.log(`   Status: ${profStatus}`)
if (profStatus !== 'twilio-approved') {
  console.log('')
  console.log(`   ⏸  Profile is "${profStatus}" — not yet approved.`)
  console.log('       Sole-prop profiles typically approve in 30 min to 3 hours.')
  console.log('       Re-run this script once status flips to "twilio-approved".')
  console.log('       Check: https://console.twilio.com/us1/account/trust-hub/customer-profiles')
  process.exit(0)
}
console.log('   ✅ Profile approved')

// ── Step 2: submit Brand (or reuse existing) ──
console.log('')
console.log('2. A2P Brand Registration...')

let brandSid = state.brand_sid
let brandStatus

if (brandSid) {
  const b = await tw('GET', `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`)
  if (b.ok) {
    brandStatus = b.body.status
    console.log(`   Found existing brand ${brandSid} — status=${brandStatus}`)
  } else {
    brandSid = null
  }
}

if (!brandSid) {
  console.log('   Submitting new Sole Prop brand ($4 charge)...')
  const create = await tw('POST', 'https://messaging.twilio.com/v1/a2p/BrandRegistrations', {
    CustomerProfileBundleSid: profileSid,
    A2PProfileBundleSid: profileSid,
    BrandType: 'SOLE_PROPRIETOR',
  })
  if (!create.ok) die('Create Brand', create)
  brandSid = create.body.sid
  brandStatus = create.body.status
  console.log(`   ✅ Brand submitted: ${brandSid}  status=${brandStatus}`)
}

state.brand_sid = brandSid
writeFileSync(statePath, JSON.stringify(state, null, 2))

// ── Step 3: wait for Brand approval (poll every 60s, max 30 min) ──
const MAX_POLL_MIN = 30
let elapsed = 0
while (brandStatus !== 'APPROVED' && elapsed < MAX_POLL_MIN) {
  if (brandStatus === 'FAILED' || brandStatus === 'IN_REVIEW' === false && brandStatus !== 'PENDING') {
    if (brandStatus === 'FAILED') {
      const b = await tw('GET', `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`)
      console.error(`\n❌ Brand FAILED: ${b.body.failure_reason ?? 'unknown'}`)
      process.exit(1)
    }
  }
  console.log(`   ⏳ Brand status: ${brandStatus} — checking again in 60s (elapsed ${elapsed} min)`)
  await sleep(60_000)
  elapsed++
  const b = await tw('GET', `https://messaging.twilio.com/v1/a2p/BrandRegistrations/${brandSid}`)
  if (b.ok) brandStatus = b.body.status
}

if (brandStatus !== 'APPROVED') {
  console.log('')
  console.log(`   ⏸  Brand still in "${brandStatus}" after ${MAX_POLL_MIN} min. Re-run this script later.`)
  console.log('       Sole-prop brands sometimes take a few hours.')
  process.exit(0)
}
console.log(`   ✅ Brand APPROVED`)

// ── Step 4: submit Campaign (or reuse existing) ──
console.log('')
console.log('4. A2P Campaign...')

const campaignsCheck = await tw('GET', `https://messaging.twilio.com/v1/Services/${MESSAGING_SERVICE_SID}/Compliance/Usa2p`)
const existingCampaigns = campaignsCheck.body.compliance ?? []
if (existingCampaigns.length > 0) {
  const c = existingCampaigns[0]
  console.log(`   ✅ Campaign already exists: ${c.sid}  status=${c.campaign_status}`)
  state.campaign_sid = c.sid
  state.campaign_status = c.campaign_status
  writeFileSync(statePath, JSON.stringify(state, null, 2))
} else {
  console.log('   Submitting new MIXED campaign ($10 vetting + $1.50/mo)...')

  const campaignBody = {
    BrandRegistrationSid: brandSid,
    Description:
      'BellAveGo is an AI receptionist platform for home-service contractors. ' +
      'We send: (1) booking-alert SMS to contractors when their AI answers a call, ' +
      '(2) payment-link SMS to homeowners after a job, ' +
      '(3) appointment-confirmation SMS to homeowners when scheduled. ' +
      'All recipients have an existing business relationship with the sending contractor.',
    MessageSamples: [
      '⚡ New callback via BellAveGo\n👤 Sarah Johnson\n📞 (773) 555-0142\n💬 AC not cooling, kids home\n⚡ Urgency: emergency\n📲 Tap to call: +17735550142\nReply STOP to opt out.',
      "Hi Sarah, Mike's Plumbing here. Tap to pay your $285 invoice for today's faucet repair: https://pay.bellavego.com/abc123 Reply STOP to opt out.",
      "Hi Sarah! Confirmed: AC tune-up Tuesday May 20 at 10 AM with Mike's Plumbing. Reply STOP to opt out. — BellAveGo",
    ].join('\n\n'),
    UsAppToPersonUsecase: 'MIXED',
    HasEmbeddedLinks: 'true',
    HasEmbeddedPhone: 'true',
    OptInMessage:
      'Recipients opt in by either (a) calling the contractor\'s BellAveGo phone number — the AI greets them and captures consent, or (b) being an existing customer of the contractor with a service relationship. The contractor enters their customers\' phone numbers into the BellAveGo dashboard for SMS communication.',
    OptInKeywords: 'START',
    OptOutMessage: 'You have been unsubscribed from BellAveGo SMS. Reply START to resubscribe.',
    OptOutKeywords: 'STOP,STOPALL,UNSUBSCRIBE,CANCEL,QUIT,END',
    HelpMessage: 'BellAveGo: AI receptionist for home service businesses. For help, email bellavegollc@gmail.com or call (773) 710-9565. Reply STOP to opt out.',
    HelpKeywords: 'HELP,INFO',
    MessageFlow: 'End consumers call the contractor\'s BellAveGo phone number. The AI receptionist greets them, captures their name and reason for call, and tells them the contractor will call back. The phone number captured from caller ID is then used to send a booking-alert SMS to the contractor, a payment-link SMS, or an appointment-confirmation SMS as part of the contractor\'s normal business communication. The contractor is the data controller; BellAveGo is the platform provider.',
  }

  const create = await tw('POST', `https://messaging.twilio.com/v1/Services/${MESSAGING_SERVICE_SID}/Compliance/Usa2p`, campaignBody)
  if (!create.ok) die('Create Campaign', create)
  console.log(`   ✅ Campaign submitted: ${create.body.sid}  status=${create.body.campaign_status}`)
  state.campaign_sid = create.body.sid
  state.campaign_status = create.body.campaign_status
  writeFileSync(statePath, JSON.stringify(state, null, 2))
}

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  ✅ All API submissions complete.')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
console.log('What happens next:')
console.log('   - Carriers (AT&T, T-Mobile, Verizon) review the campaign')
console.log('   - This typically takes 1-3 WEEKS — the long pole in the process')
console.log('   - Once carriers approve, all SMS deliverability jumps to ~3,000/day')
console.log('   - Until then, you\'re in "IN_PROGRESS" — limited but better than unregistered')
console.log('')
console.log('Check status anytime:')
console.log('   node scripts/a2p-status.mjs')
console.log('')
