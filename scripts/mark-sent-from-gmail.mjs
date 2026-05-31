#!/usr/bin/env node
/**
 * mark-sent-from-gmail.mjs — scan Gmail Sent folder, mark DB rows sent.
 *
 * For manual sends. After Peter pastes 10 (or N) emails through Gmail web UI,
 * this scans his Sent label for the last N hours, pulls every recipient,
 * and flips matching outreach_leads.email to status='sent'.
 *
 * USAGE
 *   node scripts/mark-sent-from-gmail.mjs --hours 1
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const args = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const eq = a.indexOf('=')
  if (eq > 0) args[a.slice(2, eq)] = a.slice(eq + 1)
  else { const next = argv[i + 1]; if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++ } else args[a.slice(2)] = true }
}
const hours = parseInt(args.hours ?? '2', 10)

const oauth2 = new google.auth.OAuth2(
  process.env.GMAIL_OAUTH_CLIENT_ID,
  process.env.GMAIL_OAUTH_CLIENT_SECRET,
)
oauth2.setCredentials({ refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN })
const gmail = google.gmail({ version: 'v1', auth: oauth2 })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const query = `in:sent newer_than:${hours}h`
console.log(`🔍 Gmail search: ${query}`)

const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 200 })
const msgs = list.data.messages ?? []
console.log(`📨 ${msgs.length} sent messages found`)

const recipients = new Set()
for (const m of msgs) {
  const full = await gmail.users.messages.get({
    userId: 'me',
    id: m.id,
    format: 'metadata',
    metadataHeaders: ['To'],
  })
  const toHeader = full.data.payload?.headers?.find((h) => h.name === 'To')?.value ?? ''
  // Extract every email from the To header
  const matches = toHeader.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []
  for (const e of matches) recipients.add(e.toLowerCase())
}
console.log(`📧 ${recipients.size} unique recipients in last ${hours}h`)

if (recipients.size === 0) {
  console.log('Nothing to mark.')
  process.exit(0)
}

const list2 = [...recipients]
const { data: updated, error } = await supabase
  .from('outreach_leads')
  .update({ status: 'sent', updated_at: new Date().toISOString() })
  .in('email', list2)
  .neq('status', 'sent')
  .select('email, business_name')

if (error) {
  console.error('FATAL:', error.message)
  process.exit(1)
}

console.log(`\n✅ Marked ${updated?.length ?? 0} leads sent in DB`)
for (const u of updated ?? []) console.log(`   - ${u.business_name} (${u.email})`)
