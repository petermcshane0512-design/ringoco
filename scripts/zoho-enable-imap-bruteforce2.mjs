#!/usr/bin/env node
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const ORG = process.env.ZOHO_ORG_ID

async function getAt() {
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}`
  const r = await fetch(url, { method: 'POST' })
  const j = await r.json()
  return j.access_token
}

const at = await getAt()
const r0 = await fetch(
  `https://mail.zoho.com/api/organization/${ORG}/accounts?limit=50`,
  { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
)
const j0 = await r0.json()
const test = j0.data.find(a => a.primaryEmailAddress?.toLowerCase() === 'peter@bellavego-team.com')

const ZUID = test.zuid
const ACCOUNT_ID = test.accountId
console.log(`  test: ${test.primaryEmailAddress}  zuid=${ZUID}  accountId=${ACCOUNT_ID}`)
console.log(`  imapAccessEnabled BEFORE: ${test.imapAccessEnabled}`)
console.log('')

const MODES = [
  'updateAccount',
  'updateImapAccess',
  'updateImap',
  'updateImapPop',
  'updatePopImap',
  'enableImap',
  'updateMailAccess',
  'updateAccountDetails',
  'updateUserDetails',
  'updateUserSettings',
  'updateSettings',
  'updateImapPopAccess',
  'updatePopImapAccess',
  'updatePopImapSettings',
  'updateImapPopSettings',
  'updateMailSettings',
]

const winners = []
for (const mode of MODES) {
  const body = { mode, zuid: ZUID, imapAccessEnabled: true }
  const r = await fetch(
    `https://mail.zoho.com/api/organization/${ORG}/accounts/${ACCOUNT_ID}`,
    {
      method: 'PUT',
      headers: { Authorization: `Zoho-oauthtoken ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const j = await r.json().catch(() => null)
  const code = j?.status?.code
  const desc = j?.status?.description || ''
  const more = j?.data?.moreInfo || ''
  const tag = (r.status === 200 && code === 200) ? '✅' : '❌'
  console.log(`  ${tag} mode="${mode}"  http=${r.status} code=${code}  ${desc} ${more}`.trim())
  if (r.status === 200 && code === 200) winners.push(mode)
}

console.log('')

// Re-fetch to verify
const r1 = await fetch(
  `https://mail.zoho.com/api/organization/${ORG}/accounts?limit=50`,
  { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
)
const j1 = await r1.json()
const after = j1.data.find(a => a.primaryEmailAddress?.toLowerCase() === 'peter@bellavego-team.com')
console.log(`  imapAccessEnabled AFTER:  ${after.imapAccessEnabled}`)
console.log(`  Winners: ${winners.length ? winners.join(', ') : 'NONE'}`)
