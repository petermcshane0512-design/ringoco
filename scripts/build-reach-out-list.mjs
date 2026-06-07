#!/usr/bin/env node
/**
 * Build IG Creator Reach-Out List as Excel (.xlsx).
 *
 * 5 columns only (per Peter, 2026-06-07):
 *   1. IG handle
 *   2. DM script         (personalized cold outreach text, ready to paste)
 *   3. Notes             (free-text + status badge)
 *   4. Personal code     (3-months-free, single-use)
 *   5. Fan code          ($200 off first month, multi-use)
 *
 * Codes shown:
 *   - MINTED  → live Stripe promo codes (real, ready to share)
 *   - PREDICTED → what the codes WILL be after Peter calls the mint
 *     endpoint. Same deterministic vanity-code logic. Tag with "(preview)"
 *     in the cell so Peter knows to provision before sharing.
 *
 * Sort order:
 *   1. active_creator + paid_bonus_hit (Que etc. — already in)
 *   2. replied_yes
 *   3. dmed
 *   4. saved              (the bulk — DM targets)
 *   5. replied_no / dropped
 *
 * Output: ./reach-out-list-<YYYY-MM-DD>.xlsx in project root. Opens
 * automatically via the OS default app.
 */

import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '..', '.env.local')

try {
  const env = readFileSync(envPath, 'utf8')
  env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  })
} catch { /* env may already be set */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// Per-id handle overrides — applied at render time only.
const HANDLE_OVERRIDES = {
  'cea66399-28a6-4999-8562-0294be96455d': 'sdivisuals',  // Que (was 'sienke' in DB)
}

// Minimum follower count to qualify for the reach-out list. Per Peter
// 2026-06-07: <800 followers = not worth the DM seat. Active creators
// (Que, etc.) bypass this floor since they're already partnered.
const MIN_FOLLOWERS = 800

const STATUS_PRIORITY = {
  active_creator: 1,
  paid_bonus_hit: 2,
  replied_yes:    3,
  dmed:           4,
  saved:          5,
  replied_no:     6,
  dropped:        7,
}

// Mirrors src/lib/creatorCodes.ts vanityCodeFromHandle / personalCodeFromHandle.
function vanityCodeFromHandle(handle) {
  return (handle || '').replace(/^@/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}
function personalCodeFromHandle(handle) {
  const base = vanityCodeFromHandle(handle)
  if (!base) return 'CREATOR3MO'
  const suffix = '3MO'
  const maxBase = 16 - suffix.length
  return `${base.slice(0, maxBase)}${suffix}`
}

function tradeLabel(trade) {
  const t = (trade || '').toLowerCase()
  if (t.includes('plumb'))  return 'plumbers'
  if (t.includes('elect'))  return 'electricians'
  if (t.includes('roof'))   return 'roofers'
  if (t.includes('handy'))  return 'handymen'
  if (t.includes('hvac'))   return 'HVAC shops'
  return 'home-service shops'
}

function buildDmScript(c) {
  const handle = c.handle || ''
  const firstNameGuess = handle.split(/[._-]/)[0].replace(/\d+/g, '').trim()
  const namePart = firstNameGuess ? firstNameGuess.charAt(0).toUpperCase() + firstNameGuess.slice(1).toLowerCase() : 'man'
  const _tradeBucket = tradeLabel(c.trade)
  const minted = !!(c.personal_promo_code && c.promo_code)
  const closeLine = minted
    ? `Your codes are already live — DMing them in the next message.`
    : `Hit me back if you want the codes — I'll send them within the hour.`

  return [
    `Hey ${namePart} — saw your ${c.trade || 'home-service'} posts. I built BellAveGo: AI receptionist that picks up every missed call 24/7, books the appointment straight into your calendar, and drops you 5 real leads in your neighborhood every Monday — real homeowners with real phone numbers and the real reason they need work (new move-ins, aging units, permit filings, rebate windows, storm-damage zones).`,
    ``,
    `Want to give you a personal code worth 3 months totally free — $891 of product, no card-charge risk. Try it on your own shop, see if it pays for itself.`,
    ``,
    `If you like it, I'll also send you a fan code with your name on it. Drop it in your bio + one story. Your followers get $200 off their first month ($97 instead of $297, with 30-day money-back). The moment they pay their second month, you get $200 cash. $1K bonus at 5 refs, $3K at 15. Paid every Friday via ACH.`,
    ``,
    closeLine,
    ``,
    `— Peter, BellAveGo`,
  ].join('\n')
}

async function run() {
  const { data: creators, error } = await supabase
    .from('ig_creator_outreach')
    .select('*')
    .limit(2000)
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }

  // Apply handle overrides BEFORE sort so downstream code sees the right value
  for (const c of creators) {
    if (HANDLE_OVERRIDES[c.id]) c.handle = HANDLE_OVERRIDES[c.id]
  }

  // 2026-06-07 — drop creators below the 800-follower floor. Active
  // creators (Que etc.) keep their seat regardless because they're
  // already partnered. paid_bonus_hit also stays for visibility.
  const KEEP_REGARDLESS = new Set(['active_creator', 'paid_bonus_hit', 'replied_yes', 'dmed'])
  const filtered = creators.filter((c) => {
    if (KEEP_REGARDLESS.has(c.status)) return true
    return (c.followers ?? 0) >= MIN_FOLLOWERS
  })

  const ordered = [...filtered].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99
    const pb = STATUS_PRIORITY[b.status] ?? 99
    if (pa !== pb) return pa - pb
    return (b.followers ?? 0) - (a.followers ?? 0)
  })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BellAveGo'
  wb.created = new Date()
  const ws = wb.addWorksheet('Reach-Out', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  })

  ws.columns = [
    { header: 'IG Handle',     key: 'handle',         width: 26 },
    { header: 'DM Script',     key: 'dm_script',      width: 90 },
    { header: 'Notes',         key: 'notes',          width: 38 },
    { header: 'Personal Code', key: 'personal_code',  width: 18 },
    { header: 'Fan Code',      key: 'fan_code',       width: 18 },
  ]

  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
  head.alignment = { vertical: 'middle', horizontal: 'left' }
  head.height = 24

  ordered.forEach((c) => {
    const personalCode = c.personal_promo_code || personalCodeFromHandle(c.handle)
    const publicCode = c.promo_code || vanityCodeFromHandle(c.handle)
    const minted = !!(c.personal_promo_code && c.promo_code)

    const notesParts = []
    notesParts.push(`[${c.status}]`)
    if (c.followers) notesParts.push(`${c.followers.toLocaleString()} followers`)
    if (c.trade) notesParts.push(c.trade)
    if (c.hashtag_source) notesParts.push(`via ${c.hashtag_source}`)
    if (c.paid_referrals_count) notesParts.push(`${c.paid_referrals_count} paid refs`)
    if (c.lifetime_paid_cents) notesParts.push(`$${(c.lifetime_paid_cents / 100).toFixed(0)} lifetime paid`)
    if (c.notes) notesParts.push(c.notes)

    const row = ws.addRow({
      handle: '@' + c.handle,
      dm_script: buildDmScript(c),
      notes: notesParts.join(' · '),
      personal_code: minted ? personalCode : `${personalCode} (preview)`,
      fan_code: minted ? publicCode : `${publicCode} (preview)`,
    })
    row.alignment = { vertical: 'top', wrapText: true }
    // Auto-height so the DM script is fully visible
    row.height = Math.max(80, Math.min(220, Math.ceil(buildDmScript(c).length / 90) * 18))

    // Color-band by status
    const color = c.status === 'active_creator' ? 'FFD1FAE5'
      : c.status === 'paid_bonus_hit'           ? 'FFFFE4B5'
      : c.status === 'replied_yes'              ? 'FFDDF7C2'
      : c.status === 'dmed'                     ? 'FFE0E7FF'
      : c.status === 'saved'                    ? 'FFFFFFFF'
      : c.status === 'replied_no'               ? 'FFFEE2E2'
      : c.status === 'dropped'                  ? 'FFE5E5E5'
      : 'FFFFFFFF'
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
  })

  const dateStamp = new Date().toISOString().slice(0, 10)
  const outPath = resolve(here, '..', `reach-out-list-${dateStamp}.xlsx`)
  await wb.xlsx.writeFile(outPath)

  const counts = {
    active_creator: ordered.filter((c) => c.status === 'active_creator').length,
    saved:          ordered.filter((c) => c.status === 'saved').length,
    dmed:           ordered.filter((c) => c.status === 'dmed').length,
    total:          ordered.length,
  }
  console.log(`\n✓ Wrote ${counts.total} creators to ${outPath}`)
  console.log(`  active_creator: ${counts.active_creator}  saved: ${counts.saved}  dmed: ${counts.dmed}`)

  const cmd = process.platform === 'win32' ? 'cmd'
    : process.platform === 'darwin' ? 'open'
    : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '""', outPath] : [outPath]
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: process.platform === 'win32' })
  child.unref()
  console.log(`  Opening ${outPath} ...`)
}

run().catch((e) => { console.error(e); process.exit(1) })
