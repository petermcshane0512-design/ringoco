#!/usr/bin/env node
/**
 * find-bounces.mjs — scan Gmail for mailer-daemon bounce notifications and
 * extract the recipient address that bounced.
 *
 * Reports every email that didn't deliver since the cutoff (default 24h).
 * Also flips matching outreach_leads rows to status='bounced' so the cron
 * never re-emails them.
 *
 * USAGE
 *   node scripts/find-bounces.mjs                  # last 24h
 *   node scripts/find-bounces.mjs --hours 48
 */

import { google } from 'googleapis'
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()
dotenv.config({ path: '.env.local' })

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]])
  return a
}, []))
const hours = parseInt(args.hours ?? '24', 10)

const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_OAUTH_CLIENT_ID,
  process.env.GMAIL_OAUTH_CLIENT_SECRET,
)
oauth2.setCredentials({ refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2 })

const q = `from:(mailer-daemon OR postmaster) newer_than:${Math.ceil(hours / 24)}d`
console.log(`🔍 Gmail query: ${q}\n`)

const list = await gmail.users.messages.list({ userId: 'me', q, maxResults: 200 })
const messages = list.data.messages ?? []
console.log(`Found ${messages.length} bounce notifications\n`)

const bouncedAddrs = new Set()
for (const m of messages) {
  const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
  const headers = full.data.payload?.headers ?? []
  const dateHdr = headers.find((h) => h.name?.toLowerCase() === 'date')?.value
  const body = extractText(full.data.payload)
  // Possible patterns: "wasn't delivered to X", "your message to X", "Final-Recipient: rfc822; X"
  const addrs = new Set()
  for (const m2 of body.matchAll(/(?:wasn't delivered to|to reach |Recipient address rejected:|Final-Recipient:\s*rfc822;)\s*<?([\w.+-]+@[\w.-]+\.[a-z]{2,})/gi)) {
    addrs.add(m2[1].toLowerCase())
  }
  for (const a of addrs) {
    bouncedAddrs.add(a)
    console.log(`  ❌ ${a}  ${dateHdr ?? ''}`)
  }
}

console.log(`\n${bouncedAddrs.size} unique bounced addresses\n`)

if (bouncedAddrs.size > 0) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const r = await c.query(
    `UPDATE outreach_leads SET status='bounced', updated_at=now() WHERE LOWER(email) = ANY($1::text[]) RETURNING email`,
    [[...bouncedAddrs]],
  )
  console.log(`📦 Marked ${r.rowCount} leads as bounced in outreach_leads`)
  await c.end()
}

function extractText(payload) {
  if (!payload) return ''
  if (payload.body?.data) return Buffer.from(payload.body.data, 'base64url').toString('utf8')
  const parts = payload.parts ?? []
  for (const p of parts) {
    if (p.mimeType === 'text/plain' && p.body?.data) return Buffer.from(p.body.data, 'base64url').toString('utf8')
  }
  for (const p of parts) {
    if (p.parts) {
      const inner = extractText(p)
      if (inner) return inner
    }
  }
  return ''
}
