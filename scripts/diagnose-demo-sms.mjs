#!/usr/bin/env node
/**
 * One-shot diagnostic for "why didn't I get the demo lead SMS?"
 *
 * Checks:
 *   1. Which env vars are present (without printing values)
 *   2. Last 10 Twilio messages (status + from/to/timestamp)
 *   3. Twilio Messaging Service config (if SID is set)
 *   4. Optionally fires a TEST SMS to prove the from→to wiring works
 *
 * Usage:
 *   node scripts/diagnose-demo-sms.mjs            # diagnostic only
 *   node scripts/diagnose-demo-sms.mjs --send     # also fire the test SMS
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
const DEMO = process.env.TWILIO_DEMO_NUMBER
const PETER = process.env.FALLBACK_OWNER_PHONE
const MSVC = process.env.TWILIO_MESSAGING_SERVICE_SID
const SEND_TEST = process.argv.includes('--send')

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  BellAveGo demo-SMS diagnostic')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// Step 1 — env var presence
console.log('1. Env var presence (LOCAL .env.local — note: VERCEL may differ):')
console.log(`   TWILIO_ACCOUNT_SID            ${SID ? '✅ present' : '❌ MISSING'}`)
console.log(`   TWILIO_AUTH_TOKEN             ${TOK ? '✅ present' : '❌ MISSING'}`)
console.log(`   TWILIO_DEMO_NUMBER            ${DEMO ? `✅ ${DEMO}` : '❌ MISSING (demo detection fallback won\'t fire)'}`)
console.log(`   FALLBACK_OWNER_PHONE          ${PETER ? `✅ ${PETER}` : '❌ MISSING (Peter SMS never sent)'}`)
console.log(`   TWILIO_MESSAGING_SERVICE_SID  ${MSVC ? `✅ ${MSVC}` : '⚠️  not set (using direct number routing)'}`)
console.log('')

if (!SID || !TOK) {
  console.error('Fatal: Twilio credentials missing. Cannot proceed.')
  process.exit(1)
}

const basic = 'Basic ' + Buffer.from(`${SID}:${TOK}`).toString('base64')

async function tw(method, path) {
  const res = await fetch(`https://api.twilio.com${path}`, {
    method,
    headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function twPost(path, body) {
  const res = await fetch(`https://api.twilio.com${path}`, {
    method: 'POST',
    headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// Step 2 — last 20 messages
console.log('2. Last 20 SMS in your Twilio account:')
const msgs = await tw('GET', `/2010-04-01/Accounts/${SID}/Messages.json?PageSize=20`)
if (msgs.status !== 200) {
  console.log(`   ❌ Twilio API ${msgs.status}: ${JSON.stringify(msgs.body).slice(0, 200)}`)
} else {
  const list = msgs.body.messages ?? []
  if (list.length === 0) {
    console.log('   (no messages in your account yet)')
  } else {
    console.log('   ' + 'date'.padEnd(20) + ' ' + 'status'.padEnd(12) + ' ' + 'from'.padEnd(15) + ' → ' + 'to'.padEnd(15) + ' ' + 'preview')
    console.log('   ' + '-'.repeat(110))
    for (const m of list) {
      const date = new Date(m.date_created).toISOString().replace('T', ' ').slice(0, 19)
      const status = (m.status || '').padEnd(12)
      const from = (m.from || '').padEnd(15)
      const to = (m.to || '').padEnd(15)
      const preview = (m.body || '').replace(/\n/g, ' ').slice(0, 50)
      const errFlag = m.error_code ? ` [ERR ${m.error_code}: ${m.error_message?.slice(0, 60)}]` : ''
      console.log(`   ${date} ${status} ${from} → ${to} ${preview}${errFlag}`)
    }
  }
}
console.log('')

// Step 3 — Messaging Service config
if (MSVC) {
  console.log(`3. Messaging Service ${MSVC} config:`)
  const svc = await tw('GET', `/Messaging/v1/Services/${MSVC}.json`)
  if (svc.status !== 200) {
    console.log(`   ❌ Twilio API ${svc.status}: ${JSON.stringify(svc.body).slice(0, 200)}`)
  } else {
    console.log(`   Name:           ${svc.body.friendly_name}`)
    console.log(`   Inbound URL:    ${svc.body.inbound_request_url || '(none — uses number-level webhooks)'}`)
    console.log(`   Use Case:       ${svc.body.usecase || '(unset)'}`)
    console.log(`   US A2P bound:   ${svc.body.us_app_to_person_registered ? '✅ yes' : '❌ no (unregistered throughput only — ~30-50/day per number)'}`)
  }

  const phones = await tw('GET', `/Messaging/v1/Services/${MSVC}/PhoneNumbers.json`)
  if (phones.status === 200) {
    const list = phones.body.phone_numbers ?? []
    console.log(`   Numbers in service: ${list.length}`)
    for (const p of list) {
      console.log(`     - ${p.phone_number}`)
    }
    if (DEMO && !list.some((p) => p.phone_number === DEMO)) {
      console.log(`   ⚠️  WARNING: TWILIO_DEMO_NUMBER ${DEMO} is NOT in this Messaging Service.`)
      console.log(`              SMS from the demo number will route directly — NOT through the service.`)
    }
  }
  console.log('')
} else {
  console.log('3. No Messaging Service configured — SMS routes directly per phone number.')
  console.log('   At your scale this works but maxes out at ~30-50/day per number per carrier.')
  console.log('')
}

// Step 4 — test SMS
if (SEND_TEST) {
  if (!DEMO || !PETER) {
    console.log('4. ❌ Cannot send test — need both TWILIO_DEMO_NUMBER and FALLBACK_OWNER_PHONE set.')
  } else {
    console.log(`4. Sending test SMS: ${DEMO} → ${PETER}`)
    const res = await twPost(`/2010-04-01/Accounts/${SID}/Messages.json`, {
      From: DEMO,
      To: PETER,
      Body: '🔧 BellAveGo diagnostic test — if you see this, demo→Peter SMS routing works. Run with --send removed for diag-only.',
    })
    if (res.status === 201) {
      console.log(`   ✅ Test SMS queued (sid ${res.body.sid}, status ${res.body.status}).`)
      console.log('   Check your phone in ~30 sec. If it arrives → routing works → bug is in our code path.')
      console.log('   If it doesn\'t arrive → Twilio/carrier filtering issue → A2P + Messaging Service setup is the fix.')
    } else {
      console.log(`   ❌ Twilio rejected: ${res.status}`)
      console.log(`   ${JSON.stringify(res.body, null, 2)}`)
    }
  }
} else {
  console.log('4. (skipped — re-run with --send to fire a test SMS to your phone)')
}

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Done.')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
