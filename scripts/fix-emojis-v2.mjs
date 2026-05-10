// Robust emoji fix v2: byte-level identification + replacement.
// Run: node scripts/fix-emojis-v2.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const path = 'src/app/page.tsx'
let content = readFileSync(path, 'utf8')

// Match `{ icon: '<anything-not-quote>', label: 'X' }` and replace icon for known labels.
const targets = [
  { label: 'HVAC',          emoji: '❄️' },
  { label: 'Plumbing',      emoji: '🪠' },
  { label: 'Electrical',    emoji: '⚡' },
  { label: 'Cleaning',      emoji: '🧹' },
  { label: 'Landscaping',   emoji: '🌿' },
  { label: 'Handyman',      emoji: '🔨' },
  { label: 'Roofing',       emoji: '🏠' },
  { label: 'Appliance Repair', emoji: '🔧' },
  { label: 'Auto Detailing',   emoji: '🚗' },
  { label: 'Pet Services',  emoji: '🐾' },
  { label: 'Pool & Spa',    emoji: '💧' },
  { label: 'Window Cleaning', emoji: '🪟' },
]

let total = 0
for (const { label, emoji } of targets) {
  const re = new RegExp(`\\{\\s*icon:\\s*'[^']*',\\s*label:\\s*'${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*\\}`, 'g')
  const before = content
  content = content.replace(re, `{ icon: '${emoji}', label: '${label}' }`)
  if (content !== before) {
    const matches = (before.match(re) || []).length
    total += matches
    console.log(`✓ ${label.padEnd(18)} → ${emoji} (${matches} replacement${matches > 1 ? 's' : ''})`)
  } else {
    console.warn(`✗ ${label} — no match found, may already be correct`)
  }
}

writeFileSync(path, content, 'utf8')
console.log(`\nTotal replacements: ${total}\n`)
