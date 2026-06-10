#!/usr/bin/env node
/**
 * check-lead-count-hardcoding.mjs
 *
 * Build-time guard against the 5-vs-10 contradiction regression
 * (Task 1 of the 2026-06-10 offer-rebuild plan).
 *
 * Greps src/ for hardcoded "<N> (fresh|exclusive)? (homeowner|contractor)?
 * leads/wk|week|mo|month" patterns. Exits non-zero if any are found outside
 * the allowlist — wire into pre-commit or `npm run build` to keep marketing
 * + engine in sync via src/lib/offer.ts.
 *
 * Allowlist (files where literal lead counts are intentional, not promises):
 *   - src/lib/offer.ts                       — single source of truth
 *   - src/app/dashboard/buy-leads/page.tsx   — Stripe SKU labels (a la carte)
 *   - src/app/api/stripe/checkout-alacarte/  — Stripe SKU labels (a la carte)
 *
 * Usage:
 *   node scripts/check-lead-count-hardcoding.mjs
 *
 * Exit codes:
 *   0 — clean
 *   1 — hardcoded violation found (file:line printed)
 *   2 — script error (e.g. src/ missing)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')

// Files allowed to have literal counts. Use POSIX-style relative paths for
// cross-platform stability.
const ALLOWLIST_FILES = new Set([
  // Source of truth.
  'src/lib/offer.ts',
  // Stripe à la carte SKU labels — literal pack sizes ARE the product name.
  'src/app/dashboard/buy-leads/page.tsx',
  'src/app/api/stripe/checkout-alacarte/route.ts',
  // Legacy v6/v7/v8 tier metadata for grandfathered subscribers.
  // Per CLAUDE.md only Pro (officemgr/v9) is sold to new signups; these
  // strings render only in grandfathered customer surfaces and must NOT
  // drift (5/quarter, 25/wk etc. are contractual to those customers).
  'src/lib/pricing.ts',
  // LIVE voice route + Vapi prompts for grandfathered receptionist subs.
  // CLAUDE.md flag: 'src/app/api/twilio/voice/route.ts is LIVE answering
  // real calls — never modify without explicit instruction'. Vapi prompts
  // are the script those calls follow.
  'src/lib/vapi.ts',
  // Legacy Stripe product descriptions for grandfathered receptionist
  // tiers. Modifying these mutates the descriptions grandfathered subs
  // see on their Stripe billing portal — handled in T7 cleanup if at all.
  'src/app/api/admin/fix-stripe-products/route.ts',
])

// Skip these directories entirely.
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git'])

// Pattern per Task 1 spec: "<N> (fresh|exclusive)? (homeowner|contractor)? leads"
// where <N> is a literal digit run. Template literals like ${LEADS_PER_WEEK}
// won't match because there's no literal digit before "fresh|leads".
const PATTERN =
  /\b(\d{1,3})\s+(?:fresh\s+|exclusive\s+|verified\s+|insurance-ready\s+)?(?:homeowner\s+|contractor\s+|neighborhood\s+|high-intent\s+)?leads?\b/gi

function toPosix(p) {
  return p.split(sep).join('/')
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walk(full, files)
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

function check() {
  if (!statSync(SRC).isDirectory()) {
    console.error('[check-lead-count-hardcoding] src/ not found at', SRC)
    process.exit(2)
  }
  const files = walk(SRC)
  const violations = []

  for (const file of files) {
    const rel = toPosix(relative(ROOT, file))
    if (ALLOWLIST_FILES.has(rel)) continue

    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')

    lines.forEach((line, idx) => {
      // Skip pure comment lines + import lines.
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) return

      // "<N> [qualifier]? leads" with literal digit. Reset lastIndex per line.
      PATTERN.lastIndex = 0
      let m
      while ((m = PATTERN.exec(line)) !== null) {
        const num = parseInt(m[1], 10)
        // Tolerate sub-3 ("1 lead per drop") and giant counts ("5000 leads"
        // for inventory math) — only fire on customer-facing-promise range.
        if (num < 3 || num > 200) continue
        const ctx = line.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20)
        violations.push({ file: rel, line: idx + 1, snippet: ctx.trim() })
      }
    })
  }

  if (violations.length === 0) {
    console.log('[check-lead-count-hardcoding] clean — all lead-count strings import from src/lib/offer.ts')
    return 0
  }

  console.error(`[check-lead-count-hardcoding] ${violations.length} hardcoded lead-count violation(s):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`)
    console.error(`    ${v.snippet}`)
  }
  console.error(`\nFix: import LEADS_PER_WEEK / LEADS_PER_MONTH / PRICE_PER_LEAD_USD from '@/lib/offer'.`)
  console.error(`If the match is a Stripe SKU label or other intentional literal, add the file to ALLOWLIST_FILES in this script.`)
  return 1
}

process.exit(check())
