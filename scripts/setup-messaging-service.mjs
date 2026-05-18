#!/usr/bin/env node
/**
 * Idempotent Twilio Messaging Service bootstrap.
 *
 * What it does:
 *   1. Looks for an existing "BellAveGo Platform" Messaging Service
 *   2. Creates it if missing (with inbound webhook → /api/twilio/sms)
 *   3. Attaches your TWILIO_DEMO_NUMBER + TWILIO_PHONE_NUMBER to the service
 *   4. Prints the SID for you to paste into Vercel as TWILIO_MESSAGING_SERVICE_SID
 *
 * Safe to re-run — every operation checks for existing state first.
 *
 * Usage: node scripts/setup-messaging-service.mjs
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
const DEMO_NUMBER = process.env.TWILIO_DEMO_NUMBER
const MAIN_NUMBER = process.env.TWILIO_PHONE_NUMBER
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
  ? process.env.NEXT_PUBLIC_APP_URL
  : 'https://www.bellavego.com'

if (!SID || !TOK) {
  console.error('❌ TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN required.'); process.exit(1)
}

const basic = 'Basic ' + Buffer.from(`${SID}:${TOK}`).toString('base64')
const FRIENDLY_NAME = 'BellAveGo Platform'

async function twGET(url) {
  const r = await fetch(url, { headers: { Authorization: basic } })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
async function twPOST(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Twilio Messaging Service bootstrap')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// 1. Find or create the service
console.log('1. Looking for existing service named "' + FRIENDLY_NAME + '"...')
const listed = await twGET('https://messaging.twilio.com/v1/Services?PageSize=50')
const existing = (listed.body.services ?? []).find((s) => s.friendly_name === FRIENDLY_NAME)

let serviceSid
let reused = false
if (existing) {
  serviceSid = existing.sid
  reused = true
  console.log(`   ✅ Found existing service: ${serviceSid}`)
} else {
  console.log('   (not found — creating)')
  const created = await twPOST('https://messaging.twilio.com/v1/Services', {
    FriendlyName: FRIENDLY_NAME,
    InboundRequestUrl: `${APP_URL}/api/twilio/sms`,
    UseInboundWebhookOnNumber: 'false',
    StickySender: 'true',
    ScanMessageContent: 'inherit',
  })
  if (created.status !== 201) {
    console.error(`   ❌ Create failed: ${created.status}`)
    console.error(JSON.stringify(created.body, null, 2))
    process.exit(1)
  }
  serviceSid = created.body.sid
  console.log(`   ✅ Created: ${serviceSid}`)
}

// 2. Attach numbers
console.log('')
console.log('2. Attaching numbers to service...')

async function attachNumber(phoneNumber, label) {
  if (!phoneNumber) {
    console.log(`   ⏭  ${label}: env var not set, skipping`)
    return
  }
  // Find the IncomingPhoneNumber SID
  const find = await twGET(`https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`)
  const found = (find.body.incoming_phone_numbers ?? [])[0]
  if (!found) {
    console.log(`   ❌ ${label} (${phoneNumber}): not found in your Twilio account`)
    return
  }
  // Attach
  const attach = await twPOST(`https://messaging.twilio.com/v1/Services/${serviceSid}/PhoneNumbers`, {
    PhoneNumberSid: found.sid,
  })
  if (attach.status === 201) {
    console.log(`   ✅ ${label} (${phoneNumber}): attached`)
  } else if (attach.status === 409 || /already exists|conflict/i.test(JSON.stringify(attach.body))) {
    console.log(`   ✅ ${label} (${phoneNumber}): already attached`)
  } else {
    console.log(`   ⚠️  ${label} (${phoneNumber}): attach returned ${attach.status} — ${JSON.stringify(attach.body).slice(0, 150)}`)
  }
}

await attachNumber(DEMO_NUMBER, 'TWILIO_DEMO_NUMBER')
await attachNumber(MAIN_NUMBER, 'TWILIO_PHONE_NUMBER')

// 3. Final state
console.log('')
console.log('3. Verifying final state...')
const final = await twGET(`https://messaging.twilio.com/v1/Services/${serviceSid}/PhoneNumbers`)
const finalNums = final.body.phone_numbers ?? []
console.log(`   Numbers now in "${FRIENDLY_NAME}": ${finalNums.length}`)
for (const p of finalNums) {
  console.log(`     - ${p.phone_number}`)
}

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  ✅ Done.')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
console.log('Now do this:')
console.log('')
console.log('  1. Go to Vercel → ringoco → Settings → Environment Variables')
console.log('  2. Add (Production + Preview):')
console.log('')
console.log(`     TWILIO_MESSAGING_SERVICE_SID=${serviceSid}`)
console.log('')
console.log('  3. Click "Save" then redeploy (Deployments → ... → Redeploy)')
console.log('')
console.log('After redeploy: all SMS from your code will route through this')
console.log('Messaging Service. Throughput is still capped at unregistered')
console.log('rates (~30-100/day per number) until you register an A2P Brand.')
console.log('')
console.log('Next step to fully fix error 30034: Twilio Console → Trust Hub →')
console.log('Brand Registrations → register Sole Prop Brand (needs SSN, $4,')
console.log('~3-day approval). Or wait for your LLC and go straight to Standard.')
console.log('')
