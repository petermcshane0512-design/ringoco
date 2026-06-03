#!/usr/bin/env node
/**
 * connect-instantly-mailboxes.mjs
 *
 * Reads the 14 mailboxes + passwords from zoho-mailboxes-credentials.txt
 * and connects each to Instantly via POST /api/v2/accounts. Flips warmup
 * ON for each automatically.
 *
 * Skips any mailbox already in Instantly (idempotent).
 */
import dotenv from 'dotenv'
import fs from 'node:fs'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const KEY = process.env.INSTANTLY_API_KEY
const CRED_FILE = 'C:\\Users\\peter\\ringoco\\leads\\zoho-mailboxes-credentials.txt'

// Parse the credentials file
const txt = fs.readFileSync(CRED_FILE, 'utf8')
const mailboxes = []
const re = /^\s*([\w.+-]+@[\w.-]+)\s*\n\s*password:\s*(\S+)/gm
let m
while ((m = re.exec(txt)) !== null) {
  mailboxes.push({ email: m[1], password: m[2] })
}
console.log(`Loaded ${mailboxes.length} mailboxes from credentials file`)

// Pull existing Instantly accounts (paginated)
async function listExistingAccounts() {
  const out = new Set()
  let starting_after = null
  while (true) {
    const url = `https://api.instantly.ai/api/v2/accounts?limit=100${starting_after ? `&starting_after=${starting_after}` : ''}`
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } })
    const j = await r.json()
    for (const a of j.items || []) out.add(a.email.toLowerCase())
    if (!j.next_starting_after) break
    starting_after = j.next_starting_after
  }
  return out
}

const existing = await listExistingAccounts()
console.log(`Existing Instantly accounts: ${existing.size}`)

const ZOHO_SMTP = { host: 'smtppro.zoho.com', port: 465, secure: true }
const ZOHO_IMAP = { host: 'imappro.zoho.com', port: 993, secure: true }

async function addOne(email, password) {
  const body = {
    email,
    first_name: 'Peter',
    last_name: 'McShane',
    provider_code: 1, // 1 = custom SMTP/IMAP per Instantly v2 docs
    smtp_username: email,
    smtp_password: password,
    smtp_host: ZOHO_SMTP.host,
    smtp_port: ZOHO_SMTP.port,
    smtp_security: 'SSL_TLS',
    imap_username: email,
    imap_password: password,
    imap_host: ZOHO_IMAP.host,
    imap_port: ZOHO_IMAP.port,
    imap_security: 'SSL_TLS',
    warmup: {
      limit: 30,
      advanced: {
        warm_ctd: true,
        open_rate: 50,
        read_emulation: true,
        spam_save_rate: 100,
        weekday_only: false,
      },
      increment: 'disabled',
      reply_rate_percentage: 38,
    },
    daily_limit: 30,
    tracking_domain_name: '',
    tracking_domain_status: '',
    enable_slow_ramp: true,
    inbox_placement_test_limit: false,
  }
  const r = await fetch('https://api.instantly.ai/api/v2/accounts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => null)
  return { status: r.status, body: j }
}

const added = []
const skipped = []
const failed = []

for (const m of mailboxes) {
  if (existing.has(m.email.toLowerCase())) {
    skipped.push(m.email)
    console.log(`  ↩ skip ${m.email} (already in Instantly)`)
    continue
  }
  const res = await addOne(m.email, m.password)
  if (res.status === 200 || res.status === 201) {
    added.push(m.email)
    console.log(`  ✅ added ${m.email}`)
  } else {
    failed.push({ email: m.email, status: res.status, body: JSON.stringify(res.body).slice(0, 300) })
    console.warn(`  ❌ ${m.email}: ${res.status} — ${JSON.stringify(res.body).slice(0, 200)}`)
  }
  // Mild rate limit pause
  await new Promise(r => setTimeout(r, 800))
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  Added: ${added.length} · Skipped: ${skipped.length} · Failed: ${failed.length}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
if (failed.length > 0) {
  console.log('\nFAILURES:')
  for (const f of failed) console.log(`  ${f.email}  →  ${f.status}\n    ${f.body}`)
}
