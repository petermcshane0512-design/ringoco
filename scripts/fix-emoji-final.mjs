// Final targeted fix for remaining 4-byte emoji mojibake.
// Uses regex with surrounding context to find + replace.
import { readFileSync, writeFileSync } from 'node:fs'

const path = 'src/app/page.tsx'
let content = readFileSync(path, 'utf8')

// Each mojibake'd 4-byte emoji starts with ðŸ (ðŸ). The next 2 chars vary.
// Strategy: find "ðŸ..." + " " + known label nearby, replace based on context label.

const fixes = [
  // Map: surrounding text after the emoji → correct emoji
  { ctx: ' Customer gets handled instantly',     emoji: '💬' },
  { ctx: ' Contractor can&apos;t answer',         emoji: '📍' },
  { ctx: ' Call the AI Demo',                    emoji: '📞' },
  // Inside the icon array — match by title
  { ctx: ", title: 'BellAveGo answers'",          emoji: '📞' },
  { ctx: ", title: 'Job gets booked'",            emoji: '📅' },
  { ctx: ", title: 'Customer texted'",            emoji: '💬' },
]

let totalReplacements = 0
for (const { ctx, emoji } of fixes) {
  // Find "ðŸ" followed by 1-3 chars then the context string
  const re = new RegExp(`ðŸ[\\s\\S]{1,4}?(?=${ctx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g')
  const before = content
  content = content.replace(re, emoji)
  if (content !== before) {
    const matches = (before.match(re) || []).length
    totalReplacements += matches
    console.log(`✓ ${emoji}  (replaced ${matches} before "${ctx.trim().slice(0, 30)}")`)
  } else {
    console.warn(`✗ no match for context: ${ctx.trim().slice(0, 40)}`)
  }
}

writeFileSync(path, content, 'utf8')
console.log(`\nFinal pass: ${totalReplacements} replacements.`)
