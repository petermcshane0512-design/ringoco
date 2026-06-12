// End-to-end test of the cold-email CLOSE mechanism:
// create a test prospect (Chicago roofing) -> hit the live generate
// endpoint -> confirm the returned lead carries lat/lng so the demo-
// dashboard MAP PIN renders. ~$0.05 BatchData. READ of result only.
import dotenv from 'dotenv'
import fs from 'node:fs'
if (fs.existsSync('.env.local.prod')) dotenv.config({ path: '.env.local.prod', quiet: true })
dotenv.config({ path: '.env.local', quiet: true })
import { createClient } from '@supabase/supabase-js'

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const bizId = 'flowtest_chi_roof'

// 1. Seed a test prospect row in a real Chicago zip + roofing trade.
const { error: upErr } = await s.from('prospect_free_leads').upsert({
  biz_id: bizId, email: 'flowtest@example.com', trade: 'roofing',
  zip: '60643', city: 'Chicago', state: 'IL', source_batch: 'flow_test',
}, { onConflict: 'biz_id' })
if (upErr) { console.error('seed err:', upErr.message); process.exit(1) }
console.log('seeded test prospect', bizId, '(Chicago 60643 roofing)')

// 2. Hit the LIVE generate endpoint (public, POST-only, human-gated).
const r = await fetch(`https://www.bellavego.com/api/free-lead/generate?b=${bizId}`, {
  method: 'POST',
  headers: { 'User-Agent': 'Mozilla/5.0 (flow-test manual)' },
})
console.log('generate HTTP', r.status)
const j = await r.json().catch(() => null)
if (!j) { console.error('no json'); process.exit(1) }
if (!j.ok) { console.log('NOT OK:', JSON.stringify(j).slice(0, 300)); process.exit(0) }

const L = j.lead
console.log('\n=== returned free lead ===')
console.log('owner:', L.owner)
console.log('street:', L.street, '|', L.city, L.state, L.zip)
console.log('lat/lng:', L.lat, L.lng, L.lat && L.lng ? '✓ MAP PIN WILL RENDER' : '✗ NO COORDS — map hidden')
console.log('est job:', L.est_job_min, '-', L.est_job_max)
console.log('signal:', L.signal_detail)
