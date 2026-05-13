// Probe whether Starter Customer Profile policies are API-creatable
// (Primary policies are restricted; Starter may not be — they're meant for self-serve A2P).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = {}
for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
}
const basic = 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')

async function tw(method, url, body) {
  const opts = { method, headers: { Authorization: basic } }
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    opts.body = new URLSearchParams(body).toString()
  }
  const r = await fetch(url, opts)
  const text = await r.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  return { status: r.status, ok: r.ok, body: json ?? text }
}

const POLICIES = [
  { sid: 'RN13dc4be8861a10924a79c35eaa4d812c', name: 'Starter CP for direct customers' },
  { sid: 'RN806dd6cd175f314e1f96a9727ee271f4', name: 'Starter CP of type Business' },
  { sid: 'RN63da8244384cf0401c39f5f91e674db5', name: 'Starter A2P Messaging: Direct Customers' },
  { sid: 'RNdfbf3fae0e1107f8aded0e7cead80bf5', name: 'Secondary CP of type Business' },
]

console.log('\n=== Probe policies — list required fields ===\n')
for (const p of POLICIES) {
  const r = await tw('GET', `https://trusthub.twilio.com/v1/Policies/${p.sid}`)
  if (!r.ok) { console.log(`❌ ${p.name}: ${r.status}`); continue }
  console.log(`📋 ${p.name}  (${p.sid})`)
  const reqs = r.body.requirements
  for (const eu of reqs.end_user ?? []) {
    console.log(`   end_user → ${eu.requirement_name} (${eu.type})`)
    console.log(`      fields: ${(eu.fields ?? []).join(', ')}`)
  }
  for (const docGroup of reqs.supporting_document ?? []) {
    for (const d of (docGroup ?? [])) {
      console.log(`   doc → ${d.requirement_name}`)
    }
  }
  for (const tp of reqs.supporting_trust_products ?? []) {
    console.log(`   supporting_trust_product → ${tp.requirement_name} (type ${tp.type})`)
  }
  for (const sp of reqs.supporting_customer_profiles ?? []) {
    console.log(`   supporting_customer_profile → ${sp.requirement_name} (type ${sp.type})`)
  }
  console.log('')
}

console.log('\n=== Try creating a Starter Customer Profile via API ===\n')
const create = await tw('POST', 'https://trusthub.twilio.com/v1/CustomerProfiles', {
  FriendlyName: 'BellAveGo Starter Profile (probe)',
  Email: 'pmcshane@fordham.edu',
  PolicySid: 'RN13dc4be8861a10924a79c35eaa4d812c',
})
if (create.ok) {
  console.log('✅ API can create Starter CP for direct customers')
  console.log('   SID:', create.body.sid)
  console.log('   → Path forward: use this policy in the submit script')
} else {
  console.log('❌ Starter CP direct create failed:', create.status, JSON.stringify(create.body))
  // Try the other Starter policy
  const create2 = await tw('POST', 'https://trusthub.twilio.com/v1/CustomerProfiles', {
    FriendlyName: 'BellAveGo Starter Business (probe)',
    Email: 'pmcshane@fordham.edu',
    PolicySid: 'RN806dd6cd175f314e1f96a9727ee271f4',
  })
  if (create2.ok) {
    console.log('✅ Starter Business CP works  →  SID:', create2.body.sid)
  } else {
    console.log('❌ Starter Business CP failed:', create2.status, JSON.stringify(create2.body))
  }
}
