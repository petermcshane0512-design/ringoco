// One-shot fix: replace mojibake'd emojis in landing page with proper UTF-8 emojis.
// The file currently has double-encoded characters (UTF-8 bytes interpreted as Latin-1 then re-saved as UTF-8).
// Run once: node scripts/fix-emojis.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const path = 'src/app/page.tsx'
const original = readFileSync(path, 'utf8')

// Map mojibake → correct emoji. Keys are the actual mojibake byte sequences as UTF-8 read.
const fixes = [
  ["'â„ï¸'", "'❄️'"],         // HVAC snowflake
  ["'ðŸª '", "'🪠'"],         // plunger (note trailing space in mojibake)
  ["'âš¡'", "'⚡'"],           // lightning
  ["'ðŸ§¹'", "'🧹'"],          // broom
  ["'ðŸŒ¿'", "'🌿'"],          // herb
  ["'ðŸ”¨'", "'🔨'"],          // hammer
  ["'ðŸ '", "'🏠'"],          // house (note trailing space)
  ["'ðŸ”§'", "'🔧'"],          // wrench
  ["'ðŸš—'", "'🚗'"],          // car
  ["'ðŸ¾'", "'🐾'"],          // paw prints
  ["'ðŸ’§'", "'💧'"],          // water drop
  ["'ðŸªŸ'", "'🪟'"],          // window
]

let updated = original
let changes = 0
for (const [bad, good] of fixes) {
  const before = updated
  updated = updated.split(bad).join(good)
  if (updated !== before) changes++
  else console.warn(`Did not find: ${JSON.stringify(bad)}`)
}

if (updated !== original) {
  writeFileSync(path, updated, 'utf8')
  console.log(`Fixed ${changes} emoji groups in ${path}`)
} else {
  console.log('No changes needed.')
}
