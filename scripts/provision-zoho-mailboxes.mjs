#!/usr/bin/env node
/**
 * provision-zoho-mailboxes.mjs
 *
 * Creates 15 cold-email mailboxes across 5 BellAveGo burner domains
 * (3 per domain). Skips bellavego-hq.com (already has 5 mailboxes
 * warming/warmed). Idempotent — re-running skips existing mailboxes.
 *
 * Pattern per domain: peter@, pmcshane@, hello@
 *
 * Output: leads/zoho-mailboxes-credentials.txt with each new mailbox
 * + its temp password so Peter can hand them to Instantly.
 */
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const DOMAINS = [
  'bellavego-team.com',
  'bellavego-mail.com',
  'get-bellavego.com',
  'trybellavego.com',
  'bellavego-inc.com',
]
const LOCALS = ['peter', 'pmcshane', 'hello']

async function getAccessToken() {
  const url = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&grant_type=refresh_token&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}`
  const r = await fetch(url, { method: 'POST' })
  const j = await r.json()
  if (!j.access_token) throw new Error('refresh failed: ' + JSON.stringify(j))
  return j.access_token
}

async function listExistingMailboxes(at) {
  const u = await fetch(
    `https://mail.zoho.com/api/organization/${process.env.ZOHO_ORG_ID}/accounts`,
    { headers: { Authorization: `Zoho-oauthtoken ${at}` } },
  )
  const uj = await u.json()
  const out = new Set()
  for (const a of uj.data || []) {
    if (a.primaryEmailAddress) out.add(a.primaryEmailAddress.toLowerCase())
    for (const ea of a.emailAddress || []) {
      if (ea.mailId) out.add(ea.mailId.toLowerCase())
    }
  }
  return out
}

function genPassword() {
  // 16 chars, mix of letters + digits + symbol. Strong enough for Zoho's policy.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pw = ''
  const buf = crypto.randomBytes(20)
  for (let i = 0; i < 16; i++) pw += chars[buf[i] % chars.length]
  return pw + 'Ax9!'  // ensure uppercase + lowercase + digit + symbol
}

async function createMailbox(at, email, password) {
  const body = {
    primaryEmailAddress: email,
    password,
    role: 'member',
    firstName: 'Peter',
    lastName: 'McShane',
    country: 'us',
    language: 'en',
    timeZone: 'America/Chicago',
  }
  const r = await fetch(
    `https://mail.zoho.com/api/organization/${process.env.ZOHO_ORG_ID}/accounts`,
    {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  const j = await r.json()
  return { status: r.status, body: j }
}

console.log('🟢 Provisioning Zoho mailboxes...')
const at = await getAccessToken()
console.log('  ✓ access token obtained')
const existing = await listExistingMailboxes(at)
console.log(`  ✓ existing mailboxes: ${existing.size}`)

const created = []
const skipped = []
const failed = []
for (const domain of DOMAINS) {
  for (const local of LOCALS) {
    const email = `${local}@${domain}`
    if (existing.has(email.toLowerCase())) {
      skipped.push(email)
      console.log(`  ↩ skip ${email} (exists)`)
      continue
    }
    const pw = genPassword()
    const res = await createMailbox(at, email, pw)
    if (res.status === 200 || res.status === 201) {
      created.push({ email, password: pw })
      console.log(`  ✅ created ${email}`)
    } else {
      failed.push({ email, status: res.status, reason: res.body?.data?.moreInfo || JSON.stringify(res.body).slice(0, 200) })
      console.warn(`  ❌ failed ${email}: ${res.status} — ${res.body?.data?.moreInfo || 'see log'}`)
    }
  }
}

// Write credentials to a file Peter can copy into Instantly
const OUT = 'C:\\Users\\peter\\ringoco\\leads\\zoho-mailboxes-credentials.txt'
let out = ''
out += `BellAveGo cold-email mailboxes · created ${new Date().toISOString()}\n`
out += `${'═'.repeat(78)}\n\n`
out += `IMPORTANT: store these securely. After connecting to Instantly,\n`
out += `you can rotate passwords if you want.\n\n`
out += `Server settings for SMTP/IMAP (use these in Instantly):\n`
out += `  IMAP host:   imappro.zoho.com  port 993  SSL\n`
out += `  SMTP host:   smtppro.zoho.com  port 465  SSL\n\n`
out += `Or — Zoho mailadmin → Mail Settings → Mail Accounts → click mailbox\n`
out += `→ Security → "App Passwords" → create one specifically for Instantly\n`
out += `(more secure than the master password).\n\n`
out += `${'═'.repeat(78)}\n\n`
out += `NEW MAILBOXES (${created.length}):\n\n`
for (const c of created) {
  out += `  ${c.email}\n`
  out += `    password: ${c.password}\n\n`
}
if (skipped.length > 0) {
  out += `\nSKIPPED (already exist) — ${skipped.length}:\n`
  for (const e of skipped) out += `  ${e}\n`
}
if (failed.length > 0) {
  out += `\nFAILED (${failed.length}):\n`
  for (const f of failed) out += `  ${f.email}  →  ${f.status} ${f.reason}\n`
}
fs.writeFileSync(OUT, out)

// Mirror to OneDrive
const ONEDRIVE = 'C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads'
try {
  if (!fs.existsSync(ONEDRIVE)) fs.mkdirSync(ONEDRIVE, { recursive: true })
  fs.copyFileSync(OUT, path.join(ONEDRIVE, path.basename(OUT)))
} catch {}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  Created: ${created.length} · Skipped: ${skipped.length} · Failed: ${failed.length}`)
console.log(`  Credentials saved: ${OUT}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
