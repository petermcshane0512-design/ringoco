#!/usr/bin/env node
/**
 * get-gmail-token.mjs — one-time OAuth dance to mint a Gmail API refresh
 * token for bellavegollc@gmail.com.
 *
 * RUN THIS ONCE. The refresh token never expires (unless revoked) and lets
 * the daily cron send emails as the authorized user forever.
 *
 * STEPS
 *   1. Reads .gmail-oauth-client.json (downloaded from Google Cloud Console)
 *   2. Builds OAuth authorize URL with gmail.send scope
 *   3. Opens browser → user clicks Allow
 *   4. Tiny local HTTP server on :8080 captures the redirect with the code
 *   5. Exchanges code for refresh_token
 *   6. Writes refresh_token + client_id + client_secret to .env.local
 *
 * USAGE
 *   node scripts/get-gmail-token.mjs
 */

import fs from 'node:fs'
import http from 'node:http'
import { URL } from 'node:url'
import { google } from 'googleapis'

const CLIENT_FILE = 'C:\\Users\\peter\\ringoco\\.gmail-oauth-client.json'
const ENV_FILE = 'C:\\Users\\peter\\ringoco\\.env.local'
const REDIRECT_URI = 'http://localhost:8080/oauth/callback'
// gmail.send → write outbound
// gmail.modify → read inbox + label/move messages (needed for reply handler
//   and bounce detection scripts)
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
]

if (!fs.existsSync(CLIENT_FILE)) {
  console.error(`Missing OAuth client file: ${CLIENT_FILE}`)
  console.error('Download it from https://console.cloud.google.com/apis/credentials → click your OAuth Client ID → DOWNLOAD JSON.')
  console.error(`Save the file at exactly that path.`)
  process.exit(1)
}

const creds = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'))
const credsRoot = creds.web ?? creds.installed
if (!credsRoot?.client_id || !credsRoot?.client_secret) {
  console.error('OAuth client JSON missing client_id or client_secret. Make sure you downloaded the "Web application" credentials.')
  process.exit(1)
}
const { client_id, client_secret } = credsRoot

const oauth2 = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI)
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // force a refresh_token even on re-auth
  scope: SCOPES,
})

console.log('\n🔐  Open this URL in your browser, sign in as bellavegollc@gmail.com, and click Allow:\n')
console.log(authUrl)
console.log('\nWaiting for redirect on http://localhost:8080/oauth/callback ...')

// Try auto-opening the browser via dynamic import (fails silently if unavailable).
try {
  const { default: open } = await import('open')
  await open(authUrl)
} catch {
  // Fine — user can paste the URL manually.
}

const code = await new Promise((resolve, reject) => {
  const server = http.createServer(async (req, res) => {
    if (!req.url) return
    const u = new URL(req.url, 'http://localhost:8080')
    if (u.pathname !== '/oauth/callback') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    const err = u.searchParams.get('error')
    if (err) {
      res.statusCode = 400
      res.end(`OAuth error: ${err}`)
      server.close()
      reject(new Error(err))
      return
    }
    const c = u.searchParams.get('code')
    if (!c) {
      res.statusCode = 400
      res.end('Missing code')
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<html><body style="font-family:system-ui;text-align:center;padding:60px"><h1>✅ Authorized</h1><p>You can close this tab and return to the terminal.</p></body></html>`)
    server.close()
    resolve(c)
  })
  server.listen(8080, '127.0.0.1', () => {
    // ready
  })
  server.on('error', reject)
})

console.log('\n📩  got authorization code, exchanging for refresh_token...')
const { tokens } = await oauth2.getToken(code)
if (!tokens.refresh_token) {
  console.error('\nERROR: Google returned no refresh_token.')
  console.error('This usually happens if you already authorized this client. Either:')
  console.error('  1. Revoke access at https://myaccount.google.com/permissions, then re-run, OR')
  console.error('  2. Re-run — the script already passes prompt=consent which should force a new one.')
  process.exit(1)
}

console.log('   refresh_token length:', tokens.refresh_token.length)
console.log('   scope:', tokens.scope)
console.log('   expiry:', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'n/a')

// Append to .env.local — preserve existing values
const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : ''
const newLines = []
if (!existing.includes('GMAIL_OAUTH_CLIENT_ID=')) newLines.push(`GMAIL_OAUTH_CLIENT_ID=${client_id}`)
if (!existing.includes('GMAIL_OAUTH_CLIENT_SECRET=')) newLines.push(`GMAIL_OAUTH_CLIENT_SECRET=${client_secret}`)
// Always replace refresh token (latest wins)
let updated = existing.replace(/^GMAIL_OAUTH_REFRESH_TOKEN=.*$/m, '')
updated = updated.trimEnd() + (updated.trim() ? '\n' : '')
updated += newLines.join('\n') + (newLines.length ? '\n' : '')
updated += `GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`
updated += `GMAIL_SEND_FROM=bellavegollc@gmail.com\n`.replace(/^GMAIL_SEND_FROM=bellavegollc@gmail.com$\n/m, (existing.includes('GMAIL_SEND_FROM=') ? '' : '$&'))

fs.writeFileSync(ENV_FILE, updated)

console.log('\n✅ Saved GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN to .env.local')
console.log('\nNext: node scripts/send-via-gmail.mjs --test  (sends one test email to yourself)')
