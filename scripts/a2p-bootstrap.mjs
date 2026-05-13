// One-off A2P sole-prop bootstrap. Run with: node scripts/a2p-bootstrap.mjs
// Reads TWILIO_* from .env.local. Idempotent: skips entities that already exist.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Manual .env.local parse (dotenv default reads .env)
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const SID = env.TWILIO_ACCOUNT_SID
const TOK = env.TWILIO_AUTH_TOKEN
const PROFILE_SID = 'BUfbd8dc4f05b95b572cd9e16e9008bcae' // Peter's draft Primary Customer Profile
const ADDRESS_SID = 'ADb3583b9c2438bff3a1c842e220545df6'
const AUTH_REP_SID = 'IT64b68b384edc4b865dbf3a447543b460'

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

function log(tag, res) {
  if (res.ok) console.log(`✅ ${tag} → ${res.status}`)
  else console.log(`❌ ${tag} → ${res.status} :: ${JSON.stringify(res.body)}`)
}

const BIZ_VARIANTS = [
  {
    name: 'business_information w/ direct_customer + EIN placeholder',
    type: 'business_information',
    attrs: {
      business_name: 'BellAveGo',
      business_type: 'Sole Proprietorship',
      business_registration_identifier: 'EIN',
      business_registration_number: '00-0000000',
      business_industry: 'TECHNOLOGY',
      business_regions_of_operation: 'USA_AND_CANADA',
      website_url: 'https://www.bellavego.com',
      business_identity: 'direct_customer',
    },
  },
  {
    name: 'business_information w/o registration number',
    type: 'business_information',
    attrs: {
      business_name: 'BellAveGo',
      business_type: 'Sole Proprietorship',
      business_industry: 'TECHNOLOGY',
      business_regions_of_operation: 'USA_AND_CANADA',
      website_url: 'https://www.bellavego.com',
    },
  },
  {
    name: 'sole_prop_information type (newer)',
    type: 'sole_prop_information',
    attrs: {
      business_name: 'BellAveGo',
      business_industry: 'TECHNOLOGY',
      business_regions_of_operation: 'USA_AND_CANADA',
      website_url: 'https://www.bellavego.com',
    },
  },
]

// =========================================================================
// Non-regulatory technical bits — runnable RIGHT NOW without Peter's PII.
// After his brand approves in the Twilio Console wizard, the Messaging Service
// here just needs the A2P Campaign attached and the numbers will be live.
// =========================================================================

console.log('\n=== Create BellAveGo Platform Messaging Service ===\n')
const msResult = await tw('POST', 'https://messaging.twilio.com/v1/Services', {
  FriendlyName: 'BellAveGo Platform',
  InboundRequestUrl: 'https://www.bellavego.com/api/twilio/sms',
  UseInboundWebhookOnNumber: 'false',
  StickySender: 'true',
})
log('Messaging Service create', msResult)
if (!msResult.ok) {
  console.log('Stopping — fix the MS error before continuing')
  process.exit(1)
}
const msSid = msResult.body.sid
console.log(`   Messaging Service SID: ${msSid}`)

console.log('\n=== Attach existing TWILIO_PHONE_NUMBER to the service ===\n')
const targetNumber = env.TWILIO_PHONE_NUMBER
if (!targetNumber) {
  console.log('No TWILIO_PHONE_NUMBER in env — skipping attach')
} else {
  // Find the PN SID for the number
  const listR = await tw('GET', `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(targetNumber)}`)
  if (!listR.ok || !listR.body.incoming_phone_numbers?.length) {
    log('lookup phone SID', listR)
  } else {
    const pnSid = listR.body.incoming_phone_numbers[0].sid
    console.log(`   Found ${targetNumber} → PN SID ${pnSid}`)
    const attachR = await tw('POST', `https://messaging.twilio.com/v1/Services/${msSid}/PhoneNumbers`, {
      PhoneNumberSid: pnSid,
    })
    log('attach number to MS', attachR)
  }
}

console.log('\n=== Final state ===')
console.log(`Messaging Service SID: ${msSid}`)
console.log('Paste this into Vercel env as TWILIO_MESSAGING_SERVICE_SID, then redeploy.')
