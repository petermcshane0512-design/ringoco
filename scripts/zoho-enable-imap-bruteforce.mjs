#!/usr/bin/env node
/**
 * zoho-enable-imap-bruteforce.mjs
 *
 * Zoho's PUT /api/organization/{orgId}/accounts/{accountId} requires
 * a `mode` field. The value is undocumented for IMAP enable. We try
 * every plausible string against ONE test mailbox until we find the
 * one that returns success. Once we know the mode, second pass flips
 * IMAP on for all 14 mailboxes.
 */
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const ORG = process.env.ZOHO_ORG_ID

async function getAccessToken() {
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}`
  const r = await fetch(url, { method: 'POST' })
  const j = await r.json()
  if (!j.access_token) throw new Error('refresh failed: ' + JSON.stringify(j))
  return j.access_token
}

async function listAccounts(at) {
  const r = await fetch(
    `https://mail.zoho.com/api/organization/${ORG}/accounts?limit=50`,
    { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
  )
  const j = await r.json()
  return j.data || []
}

const MODES = [
  'updateImapAccess',
  'updateImap',
  'updateImapPop',
  'updatePopImap',
  'updateImapPopAccess',
  'updatePopImapAccess',
  'enableImap',
  'enableImapAccess',
  'imap',
  'imapAccess',
  'updateMailAccess',
  'updateAccount',
  'updateAccountDetails',
  'updateAccountInfo',
  'updateUserDetails',
  'updateUserSettings',
  'updateMailSettings',
  'updateMailPolicy',
  'updateSettings',
  'updatePolicy',
  'updatePopImapSettings',
  'updateImapPopSettings',
  'updateIMAP',
  'IMAP',
  'updateIMAPAccess',
  'updateMailboxAccess',
  'updateUserAccess',
]

const at = await getAccessToken()
console.log('  ✓ token')

const accounts = await listAccounts(at)
console.log(`  ✓ ${accounts.length} accounts loaded`)

// Pick the test mailbox — peter@bellavego-team.com
const test = accounts.find(a =>
  a.primaryEmailAddress?.toLowerCase() === 'peter@bellavego-team.com',
)
if (!test) {
  console.error('Could not find peter@bellavego-team.com')
  process.exit(1)
}
console.log(`  ✓ test mailbox: ${test.primaryEmailAddress}  accountId=${test.accountId}`)
console.log(`  ✓ current imapAccessEnabled: ${test.imapAccessEnabled}`)
console.log('')

const winners = []
for (const mode of MODES) {
  const body = { mode, imapAccessEnabled: true, popAccessEnabled: true }
  const r = await fetch(
    `https://mail.zoho.com/api/organization/${ORG}/accounts/${test.accountId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${at}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  )
  const j = await r.json().catch(() => null)
  const status = r.status
  const code = j?.status?.code
  const moreInfo = j?.data?.moreInfo || j?.status?.description || ''
  const tag = (status === 200 && code === 200) ? '✅' : '❌'
  console.log(`  ${tag} mode="${mode}"  http=${status} code=${code}  ${moreInfo.slice(0, 80)}`)
  if (status === 200 && code === 200) {
    winners.push(mode)
  }
}

console.log('')
console.log(`Winners: ${winners.length ? winners.join(', ') : 'NONE'}`)
