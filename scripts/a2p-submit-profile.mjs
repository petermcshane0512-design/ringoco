// Submit a Twilio Trust Hub Individual Customer Profile for sole-prop A2P 10DLC.
//
// USAGE (PowerShell, one line):
//   node scripts/a2p-submit-profile.mjs --id-type "Drivers License" --id-number "<your DL number>" --id-state "IL"
//
// Optional flags:
//   --first-name "Peter"        (default)
//   --last-name "McShane"       (default)
//   --dob "2005-05-12"          (default)
//   --email "pmcshane@fordham.edu" (default)
//   --phone "+17737109565"      (default)
//   --website "https://www.bellavego.com" (default)
//   --brand "BellAveGo"         (default)
//   --use-case "MIXED"          (default)
//
// What it does:
//   1. Creates an Individual Customer Profile (policy: primary-for-individual)
//   2. Creates the individual_customer_profile_information end-user (incl. your ID)
//   3. Reuses the Address already on file (9232 South Bell Ave, Chicago IL 60643)
//   4. Creates the supporting document linking the address
//   5. Assigns all entities to the profile
//   6. Runs Evaluations → confirms profile is complete
//   7. Submits the profile for review (status=pending-review)
//
// On success it prints the Customer Profile SID. Approval is usually 1–3 hours.
// Once approved, run scripts/a2p-brand-and-campaign.mjs to finish brand+campaign.
//
// AUTH NOTE (May 2026 rewrite):
// Uses the official `twilio` SDK initialized exactly with the live account
// credentials from .env.local — TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN. No
// API Key SID/Secret, no Messaging Service SID, no test creds. The previous
// version of this script hand-rolled Basic auth with an env parser that
// didn't trim trailing whitespace/CRLF from values, which corrupted the
// auth token in transit and caused 401s. Fixed by both (a) using the SDK's
// auth and (b) shipping a robust env loader that trims values and strips BOM.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import twilio from 'twilio'

// ── Robust .env.local loader ──────────────────────────────────────
// Strips UTF-8 BOM, trims values, handles quoted values, ignores
// comments/blank lines. Sets process.env so the twilio SDK picks up
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN without further plumbing.
function loadEnvLocal() {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const envPath = resolve(here, '..', '.env.local')
    let text = readFileSync(envPath, 'utf8')
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) // strip BOM
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 1) continue
      const k = line.slice(0, eq).trim()
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue
      let v = line.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!process.env[k]) process.env[k] = v
    }
  } catch (e) {
    console.error('Could not read .env.local:', e.message)
  }
}
loadEnvLocal()

// ── Parse CLI args ────────────────────────────────────────────────
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) {
    const key = a.slice(2)
    args[key] = process.argv[++i]
  }
}

const REQUIRED = ['id-type', 'id-number']
const missing = REQUIRED.filter((k) => !args[k])
if (missing.length) {
  console.error(`\n❌ Missing required arg(s): ${missing.map((k) => '--' + k).join(', ')}\n`)
  console.error('Example:')
  console.error('  node scripts/a2p-submit-profile.mjs --id-type "Drivers License" --id-number "S5550000000" --id-state "IL"\n')
  process.exit(1)
}

const ID_TYPE = args['id-type']             // e.g. "Drivers License"
const ID_NUMBER = args['id-number']         // your DL #
const ID_STATE = args['id-state'] || 'IL'   // state that issued the DL
const FIRST_NAME = args['first-name'] || 'Peter'
const LAST_NAME = args['last-name'] || 'McShane'
const DOB = args['dob'] || '2005-05-12'
const EMAIL = args['email'] || 'pmcshane@fordham.edu'
const PHONE = args['phone'] || '+17737109565'
const WEBSITE = args['website'] || 'https://www.bellavego.com'
const BRAND = args['brand'] || 'BellAveGo'
const USE_CASE = args['use-case'] || 'MIXED'

// ── Twilio client — exact initialization per spec ─────────────────
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.error('\n❌ TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env.local')
  process.exit(1)
}
if (!process.env.TWILIO_ACCOUNT_SID.startsWith('AC')) {
  console.error(`\n❌ TWILIO_ACCOUNT_SID must start with "AC" — got "${process.env.TWILIO_ACCOUNT_SID.slice(0, 4)}..."`)
  console.error('   You\'re using either a test SID, an API Key SID, or a corrupted value.')
  process.exit(1)
}
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

const INDIVIDUAL_PROFILE_POLICY = 'RNffcb02a20420c81caf596ffc44f69712'
const EXISTING_ADDRESS_SID = 'ADb3583b9c2438bff3a1c842e220545df6' // 9232 S Bell Ave, Chicago IL 60643 (already created)

// ── Helpers ───────────────────────────────────────────────────────
function die(label, err) {
  console.error(`\n❌ ${label}`)
  if (err?.status) console.error(`   HTTP ${err.status}`)
  if (err?.code) console.error(`   code ${err.code}`)
  if (err?.moreInfo) console.error(`   more info: ${err.moreInfo}`)
  console.error(`   ${err?.message || JSON.stringify(err)}`)
  console.error('\nNothing was submitted to Twilio yet, no fees charged.')
  process.exit(1)
}

function ok(label, sid) {
  console.log(`✅ ${label}${sid ? '  → ' + sid : ''}`)
}

// ── Execute ───────────────────────────────────────────────────────
console.log(`\n=== Submitting Twilio Individual Customer Profile for ${BRAND} ===`)
console.log(`    Name: ${FIRST_NAME} ${LAST_NAME}  ·  DOB: ${DOB}`)
console.log(`    ID: ${ID_TYPE} (${ID_STATE})  ·  Number: ${ID_NUMBER.slice(0, 2)}*** (masked in output)`)
console.log(`    Phone: ${PHONE}  ·  Email: ${EMAIL}`)
console.log(`    Account: ${process.env.TWILIO_ACCOUNT_SID.slice(0, 8)}…  (auth via twilio SDK)\n`)

// 1. Create empty Customer Profile
let profile
try {
  profile = await client.trusthub.v1.customerProfiles.create({
    friendlyName: `${BRAND} Sole Prop Customer Profile`,
    email: EMAIL,
    policySid: INDIVIDUAL_PROFILE_POLICY,
  })
} catch (e) {
  die('Create Customer Profile', e)
}
const profileSid = profile.sid
ok('Customer Profile created', profileSid)

// 2. Create individual_customer_profile_information end user
let endUser
try {
  endUser = await client.trusthub.v1.endUsers.create({
    friendlyName: `${FIRST_NAME} ${LAST_NAME} (Individual Info)`,
    type: 'individual_customer_profile_information',
    attributes: {
      website_url: WEBSITE,
      first_name: FIRST_NAME,
      last_name: LAST_NAME,
      email: EMAIL,
      phone_number: PHONE,
      birth_date: DOB,
      identification_type: ID_TYPE,
      identification_number: ID_NUMBER,
      identification_state: ID_STATE,
      company_name: BRAND,
      use_case: USE_CASE,
      notification_mobile_number: PHONE,
    },
  })
} catch (e) {
  die('Create Individual Info end-user', e)
}
const endUserSid = endUser.sid
ok('Individual Info end-user created', endUserSid)

// 3. Create supporting document linking the existing address
let doc
try {
  doc = await client.trusthub.v1.supportingDocuments.create({
    friendlyName: `${BRAND} Business Address Document`,
    type: 'customer_profile_address',
    attributes: { address_sids: EXISTING_ADDRESS_SID },
  })
} catch (e) {
  die('Create Address SupportingDocument', e)
}
const docSid = doc.sid
ok('Address SupportingDocument created', docSid)

// 4. Assign end-user + document to the customer profile
try {
  await client.trusthub.v1
    .customerProfiles(profileSid)
    .customerProfilesEntityAssignments
    .create({ objectSid: endUserSid })
} catch (e) {
  die('Assign end-user to profile', e)
}
ok('End-user attached to profile')

try {
  await client.trusthub.v1
    .customerProfiles(profileSid)
    .customerProfilesEntityAssignments
    .create({ objectSid: docSid })
} catch (e) {
  die('Assign document to profile', e)
}
ok('Address document attached to profile')

// 5. Evaluate the profile — Twilio tells us if anything is missing before we submit
let evalResult
try {
  evalResult = await client.trusthub.v1
    .customerProfiles(profileSid)
    .customerProfilesEvaluations
    .create({ policySid: INDIVIDUAL_PROFILE_POLICY })
} catch (e) {
  die('Evaluate profile', e)
}

const evalStatus = evalResult.status
ok(`Evaluation complete: ${evalStatus}`)

if (evalStatus !== 'compliant') {
  console.error('\n⚠️  Profile is NOT compliant — fix these before submitting:')
  for (const r of evalResult.results ?? []) {
    if (r.passed) continue
    console.error(`   - ${r.requirement_friendly_name || r.requirement_name}`)
    for (const f of r.fields ?? []) {
      if (!f.passed) console.error(`       missing field: ${f.friendly_name}`)
    }
  }
  console.error('\nAdjust the inputs and re-run. Nothing submitted to carriers yet.\n')
  process.exit(2)
}

// 6. Submit the profile for review
let submitted
try {
  submitted = await client.trusthub.v1.customerProfiles(profileSid).update({
    status: 'pending-review',
  })
} catch (e) {
  die('Submit profile for review', e)
}
ok(`Profile submitted for review (status: ${submitted.status})`)

// 7. Save state for the next script
const __dirname = dirname(fileURLToPath(import.meta.url))
const statePath = resolve(__dirname, '..', '.a2p-state.json')
writeFileSync(statePath, JSON.stringify({
  customer_profile_sid: profileSid,
  end_user_sid: endUserSid,
  address_doc_sid: docSid,
  address_sid: EXISTING_ADDRESS_SID,
  brand_name: BRAND,
  submitted_at: new Date().toISOString(),
}, null, 2))

console.log('\n────────────────────────────────────────────────')
console.log(`🎉 Customer Profile submitted!`)
console.log(`   SID: ${profileSid}`)
console.log(`   Status: ${submitted.status}`)
console.log(`   Saved state: .a2p-state.json (gitignored — contains no secrets)`)
console.log('')
console.log('Next:')
console.log('   1. Twilio reviews. Sole prop typically auto-approves in 30 min – 3 hours.')
console.log('   2. Check status: https://console.twilio.com/us1/account/trust-hub/customer-profiles')
console.log('   3. When status is "twilio-approved", message Claude: "A2P profile approved"')
console.log('      Claude will then finish brand registration + campaign automatically.')
console.log('────────────────────────────────────────────────\n')
