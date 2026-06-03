#!/usr/bin/env node
/**
 * Flips imapAccessEnabled from false → true on all 14 new Zoho mailboxes
 * via Zoho Mail Admin API. Mode value `updateIMAPStatus` documented at
 * https://www.zoho.com/mail/help/api/put-change-imap-status-user.html
 */
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const ORG = process.env.ZOHO_ORG_ID

const TARGETS = [
  'peter@bellavego-team.com',
  'pmcshane@bellavego-team.com',
  'hello@bellavego-team.com',
  'peter@bellavego-mail.com',
  'pmcshane@bellavego-mail.com',
  'hello@bellavego-mail.com',
  'peter@get-bellavego.com',
  'pmcshane@get-bellavego.com',
  'hello@get-bellavego.com',
  'peter@trybellavego.com',
  'pmcshane@trybellavego.com',
  'hello@trybellavego.com',
  'pmcshane@bellavego-inc.com',
  'hello@bellavego-inc.com',
]

async function getAt() {
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}`
  const r = await fetch(url, { method: 'POST' })
  const j = await r.json()
  if (!j.access_token) throw new Error('refresh failed: ' + JSON.stringify(j))
  return j.access_token
}

const at = await getAt()
console.log('  ✓ token')

const r0 = await fetch(
  `https://mail.zoho.com/api/organization/${ORG}/accounts?limit=50`,
  { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
)
const j0 = await r0.json()
const byEmail = new Map()
for (const a of j0.data || []) {
  if (a.primaryEmailAddress) byEmail.set(a.primaryEmailAddress.toLowerCase(), a)
}

const ok = []
const fail = []
for (const email of TARGETS) {
  const acc = byEmail.get(email.toLowerCase())
  if (!acc) {
    fail.push({ email, reason: 'account not found' })
    console.log(`  ❌ ${email}  not in org`)
    continue
  }
  const body = {
    mode: 'updateIMAPStatus',
    zuid: acc.zuid,
    imapAccessEnabled: true,
  }
  const r = await fetch(
    `https://mail.zoho.com/api/organization/${ORG}/accounts/${acc.accountId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Zoho-oauthtoken ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const j = await r.json().catch(() => null)
  const code = j?.status?.code
  if (r.status === 200 && code === 200) {
    ok.push(email)
    console.log(`  ✅ ${email}  IMAP enabled`)
  } else {
    const reason = j?.status?.description || j?.data?.moreInfo || 'unknown'
    fail.push({ email, reason: `${r.status}/${code} ${reason}` })
    console.log(`  ❌ ${email}  ${r.status}/${code}  ${reason}`)
  }
  await new Promise(r => setTimeout(r, 400))
}

console.log('')
console.log(`  Enabled: ${ok.length}/${TARGETS.length}`)
if (fail.length) {
  console.log('  Failed:')
  for (const f of fail) console.log(`    ${f.email}  →  ${f.reason}`)
}

// Verify by re-listing
const r1 = await fetch(
  `https://mail.zoho.com/api/organization/${ORG}/accounts?limit=50`,
  { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
)
const j1 = await r1.json()
console.log('')
console.log('  Verification (post-flip):')
for (const email of TARGETS) {
  const a = j1.data.find(x => x.primaryEmailAddress?.toLowerCase() === email.toLowerCase())
  const tag = a?.imapAccessEnabled ? '✅' : '❌'
  console.log(`    ${tag} ${email}  imapAccessEnabled=${a?.imapAccessEnabled}`)
}
