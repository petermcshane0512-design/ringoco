#!/usr/bin/env node
/**
 * Set / update a Vercel project env var via the REST API. Used to put
 * VAPI_WEBHOOK_SECRET (and any future similarly-sensitive value) into
 * production env without going through the interactive `vercel env add`
 * CLI prompt.
 *
 * Reads from process.env:
 *   VERCEL_TOKEN  (owner-scope or higher; from .env.local or inline)
 *   KEY           (the env var name to write, e.g. VAPI_WEBHOOK_SECRET)
 *   VALUE         (the value)
 *   PROJECT_ID    (defaults to bellavego: prj_OjYGcUxDNVdiwFVR0lhvJvZd01pj)
 *   TEAM_ID       (defaults to team_9bsYagJIOYlf6ADY8Cm7nrtu)
 *   TARGET        (comma-separated; default 'production')
 *
 * Behavior:
 *   - GETs existing envs, finds any with matching key+target
 *   - If found: DELETE then POST (clean replace; no PATCH races)
 *   - Otherwise: POST new
 *   - Marks type=encrypted so it's stored sensitive (default & correct)
 */
import path from 'node:path'
import fs from 'node:fs'

// Lightweight .env.local loader so we can pick up VERCEL_TOKEN locally
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key]) continue
    let val = raw.trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    process.env[key] = val
  }
}

const TOKEN = process.env.VERCEL_TOKEN
const KEY = process.env.KEY
const VALUE = process.env.VALUE
const PROJECT_ID = process.env.PROJECT_ID || 'prj_OjYGcUxDNVdiwFVR0lhvJvZd01pj'
const TEAM_ID = process.env.TEAM_ID || 'team_9bsYagJIOYlf6ADY8Cm7nrtu'
const TARGET = (process.env.TARGET || 'production').split(',').map(s => s.trim())

if (!TOKEN) { console.error('VERCEL_TOKEN required'); process.exit(1) }
if (!KEY)   { console.error('KEY env var required (e.g. KEY=VAPI_WEBHOOK_SECRET)'); process.exit(1) }
if (!VALUE) { console.error('VALUE env var required'); process.exit(1) }

const teamQS = TEAM_ID ? `?teamId=${TEAM_ID}` : ''
const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
const base = `https://api.vercel.com`

// 1. Check existing envs for a key/target collision
const listRes = await fetch(`${base}/v9/projects/${PROJECT_ID}/env${teamQS}`, { headers })
if (!listRes.ok) {
  console.error('LIST failed:', listRes.status, await listRes.text())
  process.exit(1)
}
const listBody = await listRes.json()
const existing = (listBody.envs || []).filter(e => e.key === KEY && e.target?.some(t => TARGET.includes(t)))
console.log(`Existing entries for ${KEY} in [${TARGET.join(',')}]: ${existing.length}`)

// 2. Delete any colliding entries (clean replace)
for (const e of existing) {
  const delRes = await fetch(`${base}/v9/projects/${PROJECT_ID}/env/${e.id}${teamQS}`, { method: 'DELETE', headers })
  console.log(`DELETE id=${e.id}: ${delRes.status} ${delRes.ok ? 'OK' : await delRes.text()}`)
}

// 3. Create the new entry
const createRes = await fetch(`${base}/v10/projects/${PROJECT_ID}/env${teamQS}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ key: KEY, value: VALUE, type: 'encrypted', target: TARGET }),
})
const createBody = await createRes.json()
if (!createRes.ok) {
  console.error('CREATE failed:', createRes.status, createBody)
  process.exit(1)
}
console.log(`CREATE ok — id=${createBody.created?.id || '(no id in response)'}, key=${KEY}, target=[${TARGET.join(',')}], type=encrypted`)
console.log('NOTE: existing deployment still has OLD env. Trigger a redeploy for the new value to take effect.')
