// One-off Vercel admin: disable Speed Insights on ringoco + push the
// TWILIO_MESSAGING_SERVICE_SID env var. Run with PAT in env:
//   $env:VERCEL_TOKEN = "vcp_..."
//   node scripts/vercel-fix.mjs

const TOKEN = process.env.VERCEL_TOKEN
if (!TOKEN) { console.error('❌ VERCEL_TOKEN env var required'); process.exit(1) }

const PROJECT_ID = 'prj_otxgpBb6XpkmusClLVdN4SkSn3hV'
const TEAM_ID = 'team_9bsYagJIOYlf6ADY8Cm7nrtu'

async function v(method, path, body) {
  const url = `https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`
  const opts = {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(url, opts)
  const text = await r.text()
  let json = null; try { json = JSON.parse(text) } catch {}
  return { status: r.status, ok: r.ok, body: json ?? text }
}

console.log('\n=== Step 1: Verify token + project access ===')
const user = await v('GET', '/v2/user')
if (!user.ok) { console.error('❌ Token invalid:', user.status); process.exit(1) }
console.log(`✅ Authed as: ${user.body.user?.username || user.body.user?.email || 'unknown'}`)

const proj = await v('GET', `/v9/projects/${PROJECT_ID}`)
if (!proj.ok) { console.error('❌ Project fetch failed:', proj.status, JSON.stringify(proj.body)); process.exit(1) }
console.log(`✅ Project found: ${proj.body.name}`)
console.log(`   speedInsights: ${JSON.stringify(proj.body.speedInsights)}`)
console.log(`   analytics:     ${JSON.stringify(proj.body.analytics)}`)

console.log('\n=== Step 2: Disable Speed Insights ===')
// Vercel has two endpoints — the project-level toggle and the analytics endpoint.
// Try the project-level patch first.
const patchRes = await v('PATCH', `/v9/projects/${PROJECT_ID}`, {
  speedInsights: { enabled: false },
})
console.log(`   PATCH status: ${patchRes.status}`)
if (!patchRes.ok) console.log(`   body: ${JSON.stringify(patchRes.body).slice(0, 400)}`)

// Also try the dedicated speed-insights teardown
const delRes = await v('DELETE', `/v1/speed-insights/${PROJECT_ID}`)
console.log(`   DELETE /speed-insights status: ${delRes.status}`)

// Re-fetch to confirm state
const projAfter = await v('GET', `/v9/projects/${PROJECT_ID}`)
console.log(`✅ After: speedInsights = ${JSON.stringify(projAfter.body.speedInsights)}`)

console.log('\n=== Step 3: Push TWILIO_MESSAGING_SERVICE_SID env var ===')
const MS_SID = 'MG869e306b3b31b23051a30a4652719ac9'

// Delete any existing one first (idempotent)
const existing = await v('GET', `/v9/projects/${PROJECT_ID}/env`)
const dupes = (existing.body.envs ?? []).filter((e) => e.key === 'TWILIO_MESSAGING_SERVICE_SID')
for (const d of dupes) {
  await v('DELETE', `/v9/projects/${PROJECT_ID}/env/${d.id}`)
  console.log(`   Removed old env var entry ${d.id}`)
}

const createEnv = await v('POST', `/v10/projects/${PROJECT_ID}/env`, {
  key: 'TWILIO_MESSAGING_SERVICE_SID',
  value: MS_SID,
  type: 'encrypted',
  target: ['production', 'preview', 'development'],
})
if (!createEnv.ok) {
  console.error('❌ Env var create failed:', createEnv.status, JSON.stringify(createEnv.body))
} else {
  console.log(`✅ Env var pushed to Production + Preview + Development`)
  console.log(`   ID: ${createEnv.body.created?.id || createEnv.body.id}`)
}

console.log('\n=== Step 4: Trigger redeploy (so the new env var takes effect) ===')
// Find the latest production deployment to redeploy
const deps = await v('GET', `/v6/deployments?projectId=${PROJECT_ID}&target=production&state=READY&limit=1`)
const latest = deps.body.deployments?.[0]
if (!latest) {
  console.log('   No production deployment found yet — env var will apply on next push.')
} else {
  console.log(`   Latest prod deployment: ${latest.uid}`)
  const redep = await v('POST', `/v13/deployments`, {
    name: latest.name,
    deploymentId: latest.uid,
    target: 'production',
    meta: { redeployFor: 'apply-twilio-ms-sid' },
  })
  if (redep.ok) console.log(`✅ Triggered redeploy: ${redep.body.id ?? redep.body.url}`)
  else console.log(`   redeploy resp: ${redep.status} ${JSON.stringify(redep.body).slice(0, 300)}`)
}

console.log('\n=== DONE ===')
console.log('Now go upgrade to Pro — Speed Insights should no longer be locked in.')
console.log('After upgrade, revoke the PAT at https://vercel.com/account/settings/tokens')
