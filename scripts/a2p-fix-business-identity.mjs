// Flip business_identity from ISV/Reseller to Direct Customer on the
// auto-generated Primary Customer Profile that ships with every Twilio account.
//
// The Console wizard reads the existing business_information entity and locks
// the Business Identity dropdown when it's already set. This script either:
//   1. Updates the existing customer_profile_business_information entity, or
//   2. Deletes the old one and creates a new one with business_identity=direct_customer

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

const PROFILE_SID = 'BUfbd8dc4f05b95b572cd9e16e9008bcae' // Peter's auto-generated Primary Business CP

console.log('\n=== STEP 1: Inspect what entities are attached to the profile ===\n')
const assignments = await tw('GET', `https://trusthub.twilio.com/v1/CustomerProfiles/${PROFILE_SID}/EntityAssignments?PageSize=50`)
if (!assignments.ok) { console.log('list err', assignments); process.exit(1) }
console.log(`Found ${assignments.body.results?.length ?? 0} entity assignment(s)\n`)

const businessInfoEntities = []
for (const ea of assignments.body.results ?? []) {
  console.log(`  ObjectSid: ${ea.object_sid}`)
  // Look up what type this entity is
  if (ea.object_sid?.startsWith('IT')) {
    const eu = await tw('GET', `https://trusthub.twilio.com/v1/EndUsers/${ea.object_sid}`)
    if (eu.ok) {
      console.log(`     EndUser type: ${eu.body.type}  ·  friendly: ${eu.body.friendly_name}`)
      console.log(`     Current attributes: ${JSON.stringify(eu.body.attributes)}`)
      if (eu.body.type === 'customer_profile_business_information') {
        businessInfoEntities.push({ sid: ea.object_sid, current: eu.body.attributes, assignmentSid: ea.sid })
      }
    }
  } else if (ea.object_sid?.startsWith('RD')) {
    const doc = await tw('GET', `https://trusthub.twilio.com/v1/SupportingDocuments/${ea.object_sid}`)
    if (doc.ok) console.log(`     Document type: ${doc.body.type}  ·  friendly: ${doc.body.friendly_name}`)
  }
}

console.log('\n=== STEP 2: Flip business_identity to direct_customer ===\n')

const DESIRED_ATTRS = {
  business_name: 'BellAveGo',
  business_type: 'Sole Proprietorship',
  business_registration_identifier: 'EIN',
  business_registration_number: '00-0000000', // sole prop placeholder
  business_industry: 'TECHNOLOGY',
  business_regions_of_operation: 'USA_AND_CANADA',
  business_identity: 'direct_customer',  // ← THE KEY FIELD
  website_url: 'https://www.bellavego.com',
  social_media_profile_urls: '',
}

if (businessInfoEntities.length > 0) {
  // Try to update the existing entity in place
  const target = businessInfoEntities[0]
  console.log(`Attempting update on existing entity ${target.sid}...`)
  const merged = { ...target.current, ...DESIRED_ATTRS }
  const upd = await tw('POST', `https://trusthub.twilio.com/v1/EndUsers/${target.sid}`, {
    Attributes: JSON.stringify(merged),
  })
  if (upd.ok) {
    console.log('✅ Updated existing entity. New business_identity:', upd.body.attributes?.business_identity)
    console.log('   Refresh the Twilio Console — the Direct Customer option should now be selected.')
  } else {
    console.log('❌ Update failed:', upd.status, JSON.stringify(upd.body))
    console.log('   Will try delete + recreate path...')

    // Detach the old assignment first
    const detach = await tw('DELETE', `https://trusthub.twilio.com/v1/CustomerProfiles/${PROFILE_SID}/EntityAssignments/${target.assignmentSid}`)
    console.log('   Detach old:', detach.status)
    // Delete the old end user
    const del = await tw('DELETE', `https://trusthub.twilio.com/v1/EndUsers/${target.sid}`)
    console.log('   Delete old:', del.status)
    // Create a fresh one
    const fresh = await tw('POST', 'https://trusthub.twilio.com/v1/EndUsers', {
      FriendlyName: 'BellAveGo Business Info (Direct Customer)',
      Type: 'customer_profile_business_information',
      Attributes: JSON.stringify(DESIRED_ATTRS),
    })
    if (!fresh.ok) { console.log('❌ Fresh create failed:', fresh.status, JSON.stringify(fresh.body)); process.exit(1) }
    console.log('✅ Created fresh entity:', fresh.body.sid)
    const attach = await tw('POST', `https://trusthub.twilio.com/v1/CustomerProfiles/${PROFILE_SID}/EntityAssignments`, {
      ObjectSid: fresh.body.sid,
    })
    if (!attach.ok) { console.log('❌ Attach failed:', attach.status, JSON.stringify(attach.body)); process.exit(1) }
    console.log('✅ Attached. business_identity is now: direct_customer')
  }
} else {
  console.log('No existing business_information entity. Creating fresh...')
  const fresh = await tw('POST', 'https://trusthub.twilio.com/v1/EndUsers', {
    FriendlyName: 'BellAveGo Business Info (Direct Customer)',
    Type: 'customer_profile_business_information',
    Attributes: JSON.stringify(DESIRED_ATTRS),
  })
  if (!fresh.ok) { console.log('❌ Fresh create failed:', fresh.status, JSON.stringify(fresh.body)); process.exit(1) }
  console.log('✅ Created:', fresh.body.sid)
  const attach = await tw('POST', `https://trusthub.twilio.com/v1/CustomerProfiles/${PROFILE_SID}/EntityAssignments`, {
    ObjectSid: fresh.body.sid,
  })
  if (!attach.ok) { console.log('❌ Attach failed:', attach.status, JSON.stringify(attach.body)); process.exit(1) }
  console.log('✅ Attached business_identity=direct_customer to profile.')
}

console.log('\n=== Done. Refresh the Twilio A2P wizard. ===')
