#!/usr/bin/env node
/**
 * set-demo-status-callback.mjs — wires the demo number's Status Callback
 * URL via Twilio API so Peter never has to dig through the console.
 *
 * Sets ONLY the status callback URL. Voice URL untouched. This is the
 * safest possible Twilio change — won't affect any call routing.
 */

import twilio from 'twilio'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DEMO_E164 = '+16514677829'
const CALLBACK_URL = 'https://www.bellavego.com/api/twilio/demo-call-status'

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

// 1. Find the phone number SID
const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: DEMO_E164, limit: 5 })
if (numbers.length === 0) {
  console.error(`❌ No Twilio number found matching ${DEMO_E164}`)
  process.exit(1)
}
const num = numbers[0]
console.log(`📞 Found: ${num.phoneNumber}  SID: ${num.sid}`)
console.log(`   Current voice URL:      ${num.voiceUrl || '(none)'}`)
console.log(`   Current status callback: ${num.statusCallback || '(none)'}`)
console.log(`   Current status methods:  ${num.statusCallbackMethod || '(none)'}`)
console.log()

// 2. Patch the status callback URL (and method) only
const updated = await client.incomingPhoneNumbers(num.sid).update({
  statusCallback: CALLBACK_URL,
  statusCallbackMethod: 'POST',
})

console.log(`✅ Updated:`)
console.log(`   Status callback URL:    ${updated.statusCallback}`)
console.log(`   Status callback method: ${updated.statusCallbackMethod}`)
console.log()
console.log(`📲 Test now: call ${DEMO_E164} → expect SMS to ${process.env.FALLBACK_OWNER_PHONE || '(env unset)'} within 3 sec`)
