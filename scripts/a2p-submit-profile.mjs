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

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

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

// ── Load Twilio creds ─────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const SID = env.TWILIO_ACCOUNT_SID
const TOK = env.TWILIO_AUTH_TOKEN
const basic = 'Basic ' + Buffer.from(`${SID}:${TOK}`).toString('base64')

const INDIVIDUAL_PROFILE_POLICY = 'RNffcb02a20420c81caf596ffc44f69712'
const EXISTING_ADDRESS_SID = 'ADb3583b9c2438bff3a1c842e220545df6' // 9232 S Bell Ave, Chicago IL 60643 (already created)

// ── HTTP helper ───────────────────────────────────────────────────
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
  console.error('   ' + JSON.stringify(res.body))
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
console.log(`    Phone: ${PHONE}  ·  Email: ${EMAIL}\n`)

// 1. Create empty Customer Profile
const cpResp = await tw('POST', 'https://trusthub.twilio.com/v1/CustomerProfiles', {
  FriendlyName: `${BRAND} Sole Prop Customer Profile`,
  Email: EMAIL,
  PolicySid: INDIVIDUAL_PROFILE_POLICY,
})
if (!cpResp.ok) die('Create Customer Profile', cpResp)
const profileSid = cpResp.body.sid
ok('Customer Profile created', profileSid)

// 2. Create individual_customer_profile_information end user
const indAttrs = {
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
}
const euResp = await tw('POST', 'https://trusthub.twilio.com/v1/EndUsers', {
  FriendlyName: `${FIRST_NAME} ${LAST_NAME} (Individual Info)`,
  Type: 'individual_customer_profile_information',
  Attributes: JSON.stringify(indAttrs),
})
if (!euResp.ok) die('Create Individual Info end-user', euResp)
const endUserSid = euResp.body.sid
ok('Individual Info end-user created', endUserSid)

// 3. Create supporting document linking the existing address
const docResp = await tw('POST', 'https://trusthub.twilio.com/v1/SupportingDocuments', {
  FriendlyName: `${BRAND} Business Address Document`,
  Type: 'customer_profile_address',
  Attributes: JSON.stringify({ address_sids: EXISTING_ADDRESS_SID }),
})
if (!docResp.ok) die('Create Address SupportingDocument', docResp)
const docSid = docResp.body.sid
ok('Address SupportingDocument created', docSid)

// 4. Assign end-user + document to the customer profile
const assign1 = await tw(
  'POST',
  `https://trusthub.twilio.com/v1/CustomerProfiles/${profileSid}/EntityAssignments`,
  { ObjectSid: endUserSid },
)
if (!assign1.ok) die('Assign end-user to profile', assign1)
ok('End-user attached to profile')

const assign2 = await tw(
  'POST',
  `https://trusthub.twilio.com/v1/CustomerProfiles/${profileSid}/EntityAssignments`,
  { ObjectSid: docSid },
)
if (!assign2.ok) die('Assign document to profile', assign2)
ok('Address document attached to profile')

// 5. Evaluate the profile — Twilio tells us if anything is missing before we submit
const evalResp = await tw('POST', `https://trusthub.twilio.com/v1/CustomerProfiles/${profileSid}/Evaluations`, {
  PolicySid: INDIVIDUAL_PROFILE_POLICY,
})
if (!evalResp.ok) die('Evaluate profile', evalResp)

const evalStatus = evalResp.body.status
const evalResults = evalResp.body.results
ok(`Evaluation complete: ${evalStatus}`)

if (evalStatus !== 'compliant') {
  console.error('\n⚠️  Profile is NOT compliant — fix these before submitting:')
  for (const r of evalResults ?? []) {
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
const submitResp = await tw('POST', `https://trusthub.twilio.com/v1/CustomerProfiles/${profileSid}`, {
  Status: 'pending-review',
})
if (!submitResp.ok) die('Submit profile for review', submitResp)
ok(`Profile submitted for review (status: ${submitResp.body.status})`)

// 7. Save state for the next script
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
console.log(`   Status: ${submitResp.body.status}`)
console.log(`   Saved state: .a2p-state.json (gitignored — contains no secrets)`)
console.log('')
console.log('Next:')
console.log('   1. Twilio reviews. Sole prop typically auto-approves in 30 min – 3 hours.')
console.log('   2. Check status: https://console.twilio.com/us1/account/trust-hub/customer-profiles')
console.log('   3. When status is "twilio-approved", message Claude: "A2P profile approved"')
console.log('      Claude will then finish brand registration + campaign automatically.')
console.log('────────────────────────────────────────────────\n')
