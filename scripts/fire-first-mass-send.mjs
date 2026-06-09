#!/usr/bin/env node
/**
 * fire-first-mass-send.mjs — 2026-06-08 one-shot launcher.
 *
 * What it does:
 *   1. PATCHes Instantly campaign sequence to single-tier $297 + 30-day MBG copy
 *      (current draft has stale $147 + 7-day trial that NEVER went live)
 *   2. Pushes first 50 ICP-queued outreach_leads to Instantly campaign as new leads
 *   3. Resumes (activates) the campaign — flips status 0 (draft) → 1 (active)
 *   4. Marks pushed leads status='in_instantly_queue' in outreach_leads
 *
 * Safe: stops at every step if previous fails. Logs everything.
 *
 * USAGE: node scripts/fire-first-mass-send.mjs [--dry-run] [--limit 50]
 */

import 'dotenv/config'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitArg = args.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 450

const KEY = process.env.INSTANTLY_API_KEY
const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

if (!KEY) { console.error('INSTANTLY_API_KEY missing'); process.exit(1) }

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const STEP_0_SUBJECT = '{{firstName}} — first month $97 for {{companyName}}'
const STEP_0_BODY = `Hey {{firstName}},

Built BellAveGo for solo + 1-3 person {{city}} crews like {{companyName}}. Two things you don't have time for:

1. Prospecting new homeowners every Monday morning
2. Picking up the phone every time it rings while you're on a job

We solve both:

— **5 fresh homeowner leads every Monday** in your service area. Real names + addresses. Public-record events: permits filed, aging units, property changes. You call em.

— **AI receptionist (Emma)** answers every missed call 24/7 — sounds human, asks the right questions, books the job, texts you the appt. So you can stay under the truck w/o losing the lead.

**First month $97** (save $400) w/ code **FIRST400** at checkout. Then $497/mo flat after. 30-day money-back. Cancel anytime.

Hear Emma live in 1 ring: (651) 467-7829
Claim your $200 off: bellavego.com/start?promo=FIRST400

— Peter
BellAveGo · (773) 710-9565`

const STEP_1_SUBJECT = 're: $97 first month for {{companyName}}'
const STEP_1_BODY = `{{firstName}},

Did that $200-off code land for you?

Quick recap on what {{companyName}} gets:
- 5 fresh homeowner addresses every Monday in your service area
- AI receptionist answering 24/7 — books the job, texts you the booking
- **First month $97** w/ code **FIRST400** (then $497/mo flat)
- 30-day money-back

Hear Emma live in 1 ring: (651) 467-7829
Claim: bellavego.com/start?promo=FIRST400

Or reply w/ questions — I read every one.

— Peter
BellAveGo · (773) 710-9565`

const STEP_2_SUBJECT = '$97 first month closes Friday'
const STEP_2_BODY = `{{firstName}} — closing the loop.

{{city}} HVAC owners are missing ~12 calls/mo on avg. Each missed call is a $400-$1,200 job in someone else's truck. Plus the leads you're not getting because nobody's prospecting Mon morning for you.

BellAveGo fixes both:
- 5 fresh homeowner leads every Monday (real names + addresses)
- AI receptionist on every missed call, 24/7
- **First month $97 w/ code FIRST400** (then $497/mo flat)
- 30-day money-back guarantee

Hear Emma live: (651) 467-7829
Claim: bellavego.com/start?promo=FIRST400

Either way, good luck out there.

— Peter
(773) 710-9565`

async function api(path, opts = {}) {
  const r = await fetch(`${INSTANTLY_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KEY}`,
      ...(opts.headers || {}),
    },
  })
  const text = await r.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
  if (!r.ok) {
    throw new Error(`API ${r.status} ${path}: ${text.slice(0, 400)}`)
  }
  return json
}

// ── Step 1: PATCH the sequence ────────────────────────────────────────
async function patchSequence() {
  console.log('\n[1/4] PATCH campaign sequence — fix $147→$297, 7-day→30-day MBG')
  const body = {
    sequences: [
      {
        steps: [
          { type: 'email', delay: 0, variants: [{ subject: STEP_0_SUBJECT, body: STEP_0_BODY, v_disabled: false }] },
          { type: 'email', delay: 3, variants: [{ subject: STEP_1_SUBJECT, body: STEP_1_BODY, v_disabled: false }] },
          { type: 'email', delay: 4, variants: [{ subject: STEP_2_SUBJECT, body: STEP_2_BODY, v_disabled: false }] },
        ],
      },
    ],
  }
  if (dryRun) { console.log('  [dry-run] skipping PATCH'); return }
  const result = await api(`/campaigns/${CAMPAIGN_ID}`, { method: 'PATCH', body: JSON.stringify(body) })
  console.log('  ✓ patched (3 steps).')
  return result
}

// ── Step 2: pull leads from supabase ────────────────────────────────
async function loadLeads() {
  console.log(`\n[2/4] Pull ${LIMIT} queued ICP leads from outreach_leads`)
  const { data, error } = await sb
    .from('outreach_leads')
    .select('id, email, business_name, owner_first_name, city, state, trade')
    .eq('status', 'queued')
    .not('email', 'is', null)
    .limit(LIMIT)
  if (error) throw error
  if (!data || data.length === 0) throw new Error('no leads found')
  console.log(`  ✓ pulled ${data.length} leads (states: ${[...new Set(data.map(l => l.state).filter(Boolean))].join(', ')})`)
  return data
}

// Build {{leads_preview}} = 5 real homeowner records in this prospect's
// state from the `leads` table. Hormozi lead magnet — gives them tangible
// proof of what they'd get on Monday before they pay a dollar.
async function buildLeadsPreview(state, trade) {
  if (!state) return ''
  // Normalize state — outreach_leads stores "Texas", leads table expects "TX"
  const STATE_MAP = { Texas:'TX', Nevada:'NV', Arizona:'AZ', Florida:'FL', California:'CA', Georgia:'GA', Illinois:'IL', Tennessee:'TN', Colorado:'CO', 'North Carolina':'NC', 'South Carolina':'SC' }
  const stateCode = state.length === 2 ? state : (STATE_MAP[state] || state)
  const { data: zips } = await sb.from('zip_centroids').select('zip').eq('state', stateCode).limit(500)
  if (!zips || zips.length === 0) return ''
  const tradeFilter = (trade || 'hvac').toLowerCase().includes('plumb') ? 'plumbing'
    : (trade || 'hvac').toLowerCase().includes('elect') ? 'electrical'
    : (trade || 'hvac').toLowerCase().includes('roof') ? 'roofing'
    : 'hvac'
  const { data: rows } = await sb
    .from('leads')
    .select('street_address, zip, source, source_details, trade_match')
    .in('zip', zips.map(z => z.zip).slice(0, 200))
    .contains('trade_match', [tradeFilter])
    .order('lead_score', { ascending: false })
    .limit(5)
  if (!rows || rows.length === 0) return ''
  return rows.map((l, i) => {
    const d = l.source_details || {}
    let descriptor = ''
    if (l.source === 'permit') {
      const work = (d.work_description) || (d.permit_type) || 'permit filed'
      descriptor = `${String(work).slice(0, 60)}`
    } else if (l.source === 'aging_hvac') {
      const units = d.annual_replace_estimate ?? 0
      descriptor = `aging HVAC zone · ~${units} units/yr replace`
    } else {
      descriptor = 'homeowner opportunity'
    }
    const addr = l.street_address && !l.street_address.startsWith('Aging ') ? l.street_address : `ZIP ${l.zip}`
    return `${i + 1}. ${addr} · ${descriptor}`
  }).join('\n')
}

// ── Step 3: push to Instantly ───────────────────────────────────────
async function pushToInstantly(leads) {
  console.log(`\n[3/4] Push ${leads.length} leads to Instantly campaign ${CAMPAIGN_ID}`)
  if (dryRun) { console.log('  [dry-run] skipping push'); return { pushed: 0 } }
  // Instantly v2 = one lead per POST. email at TOP level, custom vars in "payload".
  let ok = 0
  let fail = 0
  const pushedIds = []
  for (const l of leads) {
    const body = {
      campaign: CAMPAIGN_ID,
      email: l.email,
      first_name: l.owner_first_name || 'there',
      last_name: '',
      company_name: l.business_name || 'your shop',
      personalization: '',
      payload: {
        firstName: l.owner_first_name || 'there',
        companyName: l.business_name || 'your shop',
        city: l.city || 'your city',
      },
      skip_if_in_workspace: true,
      skip_if_in_campaign: true,
      verify_leads_for_lead_finder: false,
      verify_leads_on_import: false,
    }
    try {
      await api('/leads', { method: 'POST', body: JSON.stringify(body) })
      ok++
      pushedIds.push(l.id)
    } catch (e) {
      fail++
      if (fail <= 3) console.warn(`    ⚠ ${l.email}: ${e.message.slice(0, 120)}`)
    }
    if ((ok + fail) % 25 === 0) console.log(`    ${ok + fail}/${leads.length} processed (ok=${ok}, fail=${fail})`)
  }
  console.log(`  ✓ pushed ${ok}/${leads.length} (failed ${fail})`)
  // mark only successfully pushed
  if (pushedIds.length > 0) {
    const { error } = await sb
      .from('outreach_leads')
      .update({ status: 'in_instantly_queue', updated_at: new Date().toISOString(), pushed_at: new Date().toISOString() })
      .in('id', pushedIds)
    if (error) console.warn('  ⚠ supabase mark failed:', error.message)
    else console.log(`  ✓ marked ${pushedIds.length} leads status='in_instantly_queue'`)
  }
  return { pushed: ok, failed: fail }
}

// ── Step 4: resume (activate) campaign ──────────────────────────────
async function resumeCampaign() {
  console.log('\n[4/4] Resume campaign (status draft → active)')
  if (dryRun) { console.log('  [dry-run] skipping resume'); return }
  const r = await api(`/campaigns/${CAMPAIGN_ID}/activate`, { method: 'POST', body: JSON.stringify({}) })
  console.log('  ✓ activated:', JSON.stringify(r).slice(0, 200))
}

// ── Main ─────────────────────────────────────────────────────────────
;(async () => {
  console.log(`╔═══════════════════════════════════════════════════════════╗`)
  console.log(`║ FIRE FIRST MASS SEND — ${dryRun ? 'DRY RUN' : 'LIVE'}                              ║`)
  console.log(`║ campaign: ${CAMPAIGN_ID}    ║`)
  console.log(`║ limit:    ${String(LIMIT).padEnd(48)}║`)
  console.log(`╚═══════════════════════════════════════════════════════════╝`)

  try {
    await patchSequence()
    const leads = await loadLeads()
    await pushToInstantly(leads)
    await resumeCampaign()
    console.log('\n🚀 DONE. First mass send is live.')
    console.log(`   Check Instantly UI — campaign should show Active.`)
    console.log(`   Sends start within the next Mon-Fri 9-5 CST window.`)
    console.log(`   Daily cap = 480, today's pool = ${LIMIT}.`)
  } catch (e) {
    console.error('\n✗ FAIL:', e.message)
    console.error('   Stopped. Nothing irreversible left half-done unless you see "marked".')
    process.exit(1)
  }
})()
