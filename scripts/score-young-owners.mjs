#!/usr/bin/env node
/**
 * Batch-score every outreach_leads row for young_owner_score.
 *
 * Run once after migration. Idempotent — re-run anytime to refresh scores
 * after tuning signal weights or adding new patterns.
 *
 * Targets ALL leads (not just unscored) so iterating on the algorithm
 * cleanly re-applies to historical data.
 */
import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

// Inline the scoring lib (TS not directly runnable here without tsx)
const OLD_SHOP_PATTERNS = [
  [/\bsince (?:19\d{2}|200\d|201[0-5])\b/i, -35],
  [/\b(20|30|40|50)\+?\s*years?\b/i, -25],
  [/\bsecond[- ]generation|third[- ]generation|family[- ]owned[- ]since\b/i, -20],
  [/\bestablished (?:19\d{2}|200\d|201[0-5])\b/i, -25],
  [/\bfounded (?:19\d{2}|200\d|201[0-5])\b/i, -25],
]
const YOUNG_SHOP_PATTERNS = [
  [/\b(small|local|family[- ]run|veteran[- ]owned)\s+(business|shop|operation)\b/i, +6],
  [/\bestablished (?:202[1-9]|2030)|founded (?:202[1-9]|2030)\b/i, +30],
  [/\bsince (?:202[1-9]|2030)\b/i, +30],
  [/\bnew(?:ly)? (?:opened|launched|started)\b/i, +15],
  [/\bowner[- ]operated\b/i, +10],
  [/\bfounder|entrepreneur|young\b/i, +5],
  [/\bAI[- ]powered|software|app|book online\b/i, +8],
]

function scoreYoungOwner(row) {
  const signals = {}
  let score = 50
  // Domain age — strongest signal
  if (row.domain_registered_at) {
    const regDate = new Date(row.domain_registered_at)
    if (!isNaN(regDate.getTime())) {
      const yearsOld = (Date.now() - regDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      if (yearsOld < 3) signals.domain_very_young = 35
      else if (yearsOld < 6) signals.domain_young = 25
      else if (yearsOld < 10) signals.domain_mid = 10
      else if (yearsOld < 15) signals.domain_established = -10
      else if (yearsOld < 25) signals.domain_old = -25
      else signals.domain_legacy = -35
    }
  }
  const ec = row.employee_count_est
  if (typeof ec === 'number') {
    if (ec >= 1 && ec <= 3) signals.tiny_team = 20
    else if (ec >= 4 && ec <= 10) signals.small_team = 10
    else if (ec >= 11 && ec <= 25) signals.mid_team = 0
    else if (ec > 25) signals.large_team = -15
  }
  if (row.owner_first_name && String(row.owner_first_name).trim().length > 1 && String(row.owner_first_name).toLowerCase() !== 'team') {
    signals.owner_name_known = 5
  }
  const t = String(row.trade || '').toLowerCase()
  if (t === 'hvac') signals.trade_modern_naming = 5
  else if (t.includes('contractor') || t.includes('supplier')) signals.trade_corporate_naming = -5
  const text = `${row.website_snippet || ''} ${row.notes || ''} ${row.business_name || ''}`
  for (const [pattern, pts] of OLD_SHOP_PATTERNS) {
    if (pattern.test(text)) {
      signals[`old_phrase_${pattern.source.slice(0, 18)}`] = pts
    }
  }
  for (const [pattern, pts] of YOUNG_SHOP_PATTERNS) {
    if (pattern.test(text)) {
      signals[`young_phrase_${pattern.source.slice(0, 18)}`] = pts
    }
  }
  const bn = String(row.business_name || '').trim()
  if (/^[A-Z][a-z]+(?:[A-Z][a-z]+)?\s*(LLC|Inc|Co)?$/.test(bn) && bn.length >= 5 && bn.length <= 12) {
    signals.brandable_name = 8
  }
  if (/^[A-Z][a-z]+'s\s/.test(bn)) {
    signals.possessive_traditional_name = -3
  }
  for (const v of Object.values(signals)) score += v
  score = Math.max(0, Math.min(100, score))
  return { score, signals }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
console.log('  ✓ connected')

const { rows } = await client.query(
  `select id, business_name, trade, employee_count_est, website_snippet, notes,
          owner_first_name, domain_registered_at
   from outreach_leads`,
)
console.log(`  ✓ scoring ${rows.length} leads...`)

let scored = 0
let hot = 0       // 60+
let warm = 0      // 40-59
let cold = 0      // <40

const BATCH = 200
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  // Use VALUES update for speed
  const valueClauses = []
  const params = []
  batch.forEach((row, idx) => {
    const r = scoreYoungOwner(row)
    if (r.score >= 60) hot++
    else if (r.score >= 40) warm++
    else cold++
    const base = idx * 3
    valueClauses.push(`($${base + 1}::uuid, $${base + 2}::int, $${base + 3}::jsonb)`)
    params.push(row.id, r.score, JSON.stringify(r.signals))
  })
  const sql = `
    update outreach_leads ol
    set young_owner_score = v.score,
        young_signals = v.signals,
        young_scored_at = now()
    from (values ${valueClauses.join(',')}) as v(id, score, signals)
    where ol.id = v.id
  `
  try {
    const res = await client.query(sql, params)
    scored += res.rowCount ?? 0
  } catch (e) {
    console.error(`  ✗ batch ${i / BATCH}: ${e.message}`)
  }
}

console.log(`\n  ✓ updated ${scored} rows`)
console.log(`  Distribution:`)
console.log(`    🔥 hot (60+):  ${hot}`)
console.log(`    🟡 warm (40-59): ${warm}`)
console.log(`    ❄️ cold (<40):  ${cold}`)

// Sanity check
const { rows: dist } = await client.query(`
  select
    count(*) filter (where young_owner_score >= 60)::int hot,
    count(*) filter (where young_owner_score >= 40 and young_owner_score < 60)::int warm,
    count(*) filter (where young_owner_score < 40)::int cold,
    count(*) filter (where young_owner_score >= 40 and owner_phone is not null and owner_phone <> '')::int dial_able_young,
    count(*) filter (where young_owner_score >= 40 and email is not null)::int email_able_young
  from outreach_leads
`)
console.log(`\n  DB sanity:`)
console.log(`    Dial-able young (phone + score ≥40): ${dist[0].dial_able_young}`)
console.log(`    Email-able young (email + score ≥40): ${dist[0].email_able_young}`)

await client.end()
console.log('\nDONE')
