#!/usr/bin/env node
/**
 * 2026-06-08 — Simple generic DM list builder.
 *
 * Replaces the long personalized DM in build-reach-out-list.mjs with a
 * short generic template that only swaps first name. Peter scrolls IG +
 * pastes this. No follower math, no earnings ladder, no per-handle
 * customization.
 *
 * Output: reach-out-list-simple-<YYYY-MM-DD>.xlsx
 * Opens in default app on completion.
 */
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(resolve(here, '..', '.env.local'), 'utf8')
env.split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
})

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function vanityCodeFromHandle(handle) {
  return (handle || '').replace(/^@/, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}
function personalCodeFromHandle(handle) {
  const base = vanityCodeFromHandle(handle)
  if (!base) return 'CREATOR3MO'
  return `${base.slice(0, 13)}3MO`
}
function firstNameGuess(handle) {
  const raw = (handle || '').split(/[._-]/)[0].replace(/\d+/g, '').trim()
  if (!raw || raw.length < 2) return 'man'
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

function buildSimpleDm(handle) {
  const name = firstNameGuess(handle)
  return [
    `Hey ${name} — built BellAveGo for HVAC. Picks up every missed call 24/7, books jobs to the calendar, AND drops 5 FRESH real homeowner leads every Monday — names, addresses, phones, reasons — pulled overnight from nightly building-permit scrapes (HVAC permit pulled = job open), Census ACS aging-housing data (1985-2005 replacement window for furnaces/condensers), NOAA storm strike zones, and 90-day owner-occupied move-ins, all filtered to the shop's exact service area.`,
    ``,
    `3 months Pro FREE for you to test on your own shop. Refer a buddy running an HVAC shop and drop your code in your bio — you earn $200 cash for every shop that signs up AND stays subscribed into month 2 (5 = $2K, 10 = $5K, 25 = $13K, 50 = $33K). No churn = no payout, so only real customers count.`,
    ``,
    `Drop a yes, I'll send your codes.`,
    ``,
    `— Peter, BellAveGo`,
  ].join('\n')
}

async function run() {
  const { data: rows, error } = await supabase
    .from('ig_creator_outreach')
    .select('handle, trade, followers, status, personal_promo_code, promo_code')
    .eq('status', 'saved')
    .order('followers', { ascending: false, nullsFirst: false })
  if (error) { console.error(error); process.exit(1) }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'BellAveGo'
  wb.created = new Date()
  const ws = wb.addWorksheet('DM List', { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] })
  ws.columns = [
    { header: 'IG Handle',     key: 'handle',        width: 28 },
    { header: 'First (guess)', key: 'first',         width: 14 },
    { header: 'Trade',         key: 'trade',         width: 12 },
    { header: 'Followers',     key: 'followers',     width: 12 },
    { header: 'DM (paste)',    key: 'dm',            width: 80 },
    { header: 'Personal Code', key: 'personalCode',  width: 20 },
    { header: 'Fan Code',      key: 'fanCode',       width: 20 },
    { header: 'Sent?',         key: 'sent',          width: 10 },
    { header: 'Replied?',      key: 'replied',       width: 10 },
  ]

  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F3A' } }
  head.alignment = { vertical: 'middle', horizontal: 'left' }
  head.height = 24

  for (const r of rows) {
    const personalCode = r.personal_promo_code || `${personalCodeFromHandle(r.handle)} (preview)`
    const fanCode = r.promo_code || `${vanityCodeFromHandle(r.handle)} (preview)`
    const row = ws.addRow({
      handle: '@' + r.handle,
      first: firstNameGuess(r.handle),
      trade: r.trade || '',
      followers: r.followers || 0,
      dm: buildSimpleDm(r.handle),
      personalCode,
      fanCode,
      sent: '',
      replied: '',
    })
    row.alignment = { vertical: 'top', wrapText: true }
    const dmLines = buildSimpleDm(r.handle).split('\n').reduce((s, ln) => s + Math.max(1, Math.ceil(ln.length / 78)), 0)
    row.height = Math.min(640, Math.max(180, dmLines * 16))
  }

  const dateStamp = new Date().toISOString().slice(0, 10)
  const outPath = resolve(here, '..', `reach-out-list-simple-${dateStamp}.xlsx`)
  await wb.xlsx.writeFile(outPath)
  console.log(`✓ Wrote ${rows.length} rows to ${outPath}`)

  const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '""', outPath] : [outPath]
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: process.platform === 'win32' })
  child.unref()
}

run().catch((e) => { console.error(e); process.exit(1) })
