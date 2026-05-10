// Fix UTF-8-as-Latin-1 mojibake throughout src/.
// Run: node scripts/fix-mojibake.mjs
//
// What happened: somewhere along the line a tool read the file as Latin-1
// and re-saved as UTF-8, double-encoding multi-byte chars. We map the visible
// mojibake patterns back to their intended unicode.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = 'src'
const EXTS = new Set(['.tsx', '.ts', '.jsx', '.js', '.md', '.css'])

// Order matters — match longer patterns first to avoid partial-overlap issues.
const FIXES = [
  // 4-byte emoji (most common in this codebase) — UTF-8 F0 9F XX XX bytes seen as 4 mojibake chars
  ['ðŸª ',  '🪠'],   // plunger (with trailing NBSP variant)
  ['ðŸªŸ',  '🪟'],   // window
  ['ðŸ§¹',  '🧹'],   // broom
  ['ðŸŒ¿',  '🌿'],   // herb
  ['ðŸ"¨',  '🔨'],   // hammer
  ['ðŸ"§',  '🔧'],   // wrench
  ['ðŸš—',  '🚗'],   // car
  ['ðŸ¾',  '🐾'],   // paw prints
  ['ðŸ\'§', '💧'],  // water drop
  ['ðŸ\'¬', '💬'],  // speech bubble
  ['ðŸ"ž',  '📞'],   // phone
  ['ðŸ"…',  '📅'],   // calendar
  ['ðŸ"',   '📍'],   // pin (also matches generic 4-byte starting w F0 9F 8F — be careful)
  ['ðŸ ',  '🏠'],   // house

  // 3-byte chars (UTF-8 E2 XX XX seen as â + 2 mojibake)
  ['â„ï¸', '❄️'],   // snowflake + variation selector
  ['âš¡',  '⚡'],    // high voltage
  ['â€™',  '’'], // right single quote
  ['â€˜',  '‘'], // left single quote
  ['â€œ',  '“'], // left double quote
  ['â€', '”'], // right double quote (SOMETIMES — depends on byte interp)
  // Em dash mojibake = bytes E2 80 94 read as Win-1252: â € " (where 0x94 → U+201D right double quote)
  ['â€”', '—'], // em dash
  ['â€“', '–'], // en dash (0x93 → U+201C left double quote)
  ['â€‘', '‑'], // non-breaking hyphen
  ['â€¦', '…'], // ellipsis
  ['â€¢', '•'], // bullet
  ['â†’', '→'], // right arrow (E2 86 92 → â † ')
  ['â†‘', '←'], // left arrow

  // 2-byte chars (UTF-8 C2/C3 XX seen as Â or Ã + 1 mojibake)
  ['Â·',   '·'],   // middle dot
  ['Â°',   '°'],   // degree
  ['Â®',   '®'],   // registered
  ['Â©',   '©'],   // copyright
  ['Â½',   '½'],
  ['Ã©',   'é'],
  ['Ã¨',   'è'],
  ['Ã ',   'à'],   // (note trailing space variant)
  ['Ã¡',   'á'],
  ['Ã³',   'ó'],
  ['Ã±',   'ñ'],
  ['Ã¼',   'ü'],
  ['Ã¶',   'ö'],
  ['Ã¤',   'ä'],
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      out.push(...walk(p))
    } else if (EXTS.has(extname(name))) {
      out.push(p)
    }
  }
  return out
}

const files = walk(ROOT)
let totalFiles = 0
let totalReplacements = 0

for (const file of files) {
  let content = readFileSync(file, 'utf8')
  const original = content
  let fileReplacements = 0
  for (const [bad, good] of FIXES) {
    if (!content.includes(bad)) continue
    const before = content
    content = content.split(bad).join(good)
    const count = (before.length - content.length) / Math.max(1, bad.length - good.length)
    fileReplacements += Math.round(count)
  }
  if (content !== original) {
    writeFileSync(file, content, 'utf8')
    console.log(`${file}: ${fileReplacements} replacements`)
    totalFiles++
    totalReplacements += fileReplacements
  }
}

console.log(`\nFixed ${totalReplacements} mojibake sequences across ${totalFiles} files.`)
