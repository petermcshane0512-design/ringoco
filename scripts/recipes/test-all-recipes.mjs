#!/usr/bin/env node
/**
 * scripts/recipes/test-all-recipes.mjs — orchestrator over every recipe ×
 * 5 zips × N metros. Writes a single JSON output that REPORT.md
 * compilation reads from.
 *
 * Designed specifically for the HVAC climate stress-test: probes the
 * mild-baseline + hot-climate + hot-tight + cold recipes against
 * Phoenix (hot), Austin (mild), Chicago (cold) and reports which
 * recipe wins per metro by fill rate × intent.
 *
 * COST WARNING: full sweep ≈ $45 in BatchData credits. Run --dry-run
 * first to see request count + estimated cost. Add --commit to live.
 *
 *   node scripts/recipes/test-all-recipes.mjs --dry-run
 *   node scripts/recipes/test-all-recipes.mjs --hvac-only --commit
 *   node scripts/recipes/test-all-recipes.mjs --trade roofing --commit
 *   node scripts/recipes/test-all-recipes.mjs --metro Phoenix --commit
 *
 * Output: scripts/recipes/output/probe-results-{ISO}.json
 *
 * Terminal 1 boundary: NO writes to leads / outreach_leads / any
 * production table. Pure read against BatchData + local JSON dump.
 */
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { RECIPES, TEST_METROS } from './recipe-definitions.mjs'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

// ── CLI args ───────────────────────────────────────────────────────────
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const hasFlag = (n) => process.argv.includes(`--${n}`)

const ONLY_TRADE = arg('trade', '')
const ONLY_METRO = arg('metro', '')
const HVAC_ONLY = hasFlag('hvac-only')
const TAKE = parseInt(arg('take', '15'), 10)
const COMMIT = hasFlag('commit')
const DRY_RUN = !COMMIT

let recipes = RECIPES.filter((r) => Object.keys(r.filters).length > 0)
if (ONLY_TRADE) recipes = recipes.filter((r) => r.trade === ONLY_TRADE.toLowerCase())
if (HVAC_ONLY) recipes = recipes.filter((r) => r.trade === 'hvac')

let metros = TEST_METROS
if (ONLY_METRO) {
  metros = metros.filter((m) => m.metro.toLowerCase().includes(ONLY_METRO.toLowerCase()))
}

const probeCount = recipes.length * metros.reduce((sum, m) => sum + m.zips.length, 0)
const costEstimateUsd = (probeCount * TAKE * 0.05).toFixed(2)

console.log('\n=== Recipe Lab — full sweep ===')
console.log(`Recipes:      ${recipes.length}  ${recipes.map((r) => r.slug).join(', ')}`)
console.log(`Metros:       ${metros.length}  ${metros.map((m) => m.metro).join(' | ')}`)
console.log(`Zips total:   ${metros.reduce((s, m) => s + m.zips.length, 0)}`)
console.log(`Probes:       ${probeCount}`)
console.log(`Take per:     ${TAKE}`)
console.log(`Cost ceiling: ~$${costEstimateUsd} (only if every probe returns full ${TAKE} results)\n`)

if (DRY_RUN) {
  console.log('*** DRY-RUN — no BatchData calls. Add --commit to live.\n')
  process.exit(0)
}

const apiKey = process.env.BATCHDATA_API_KEY
if (!apiKey) {
  console.error('BATCHDATA_API_KEY not set — abort.')
  process.exit(1)
}

async function probe(recipe, zip) {
  const t0 = Date.now()
  const body = { searchCriteria: { ...recipe.filters, query: zip }, options: { take: TAKE, skip: 0 } }
  try {
    const r = await fetch('https://api.batchdata.com/api/v1/property/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    const elapsed_ms = Date.now() - t0
    if (!r.ok) {
      const txt = await r.text()
      return { ok: false, http: r.status, elapsed_ms, body_first_400: txt.slice(0, 400) }
    }
    const j = await r.json()
    const props = j?.results?.properties ?? []
    const withOwnerAddr = props.filter((p) => p?.owner?.mailingAddress?.street).length
    return {
      ok: true,
      elapsed_ms,
      returned: props.length,
      with_owner_address: withOwnerAddr,
      fill_rate: TAKE > 0 ? Number((props.length / TAKE).toFixed(2)) : 0,
      first_sample: props[0]
        ? {
            owner: props[0].owner?.fullName ?? props[0].owner?.name?.full ?? null,
            year_built: props[0].building?.yearBuilt ?? null,
            value: props[0].valuation?.estimatedValue ?? null,
          }
        : null,
    }
  } catch (e) {
    return { ok: false, error: e.message, elapsed_ms: Date.now() - t0 }
  }
}

const rows = []
let done = 0
for (const metro of metros) {
  for (const zip of metro.zips) {
    for (const recipe of recipes) {
      const r = await probe(recipe, zip)
      const row = {
        metro: metro.metro,
        metro_climate: metro.climate,
        zip,
        recipe: recipe.slug,
        recipe_trade: recipe.trade,
        recipe_climate: recipe.climate,
        recipe_confidence: recipe.confidence,
        ...r,
      }
      rows.push(row)
      done++
      const tag = r.ok ? `✓ ${r.returned}/${TAKE}` : `✗ ${r.http ?? r.error}`
      console.log(`  [${done}/${probeCount}] ${metro.metro.split(' ')[0]} ${zip} ${recipe.slug.padEnd(36)} ${tag}`)
      await new Promise((res) => setTimeout(res, 35))
    }
  }
}

mkdirSync('scripts/recipes/output', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outFile = `scripts/recipes/output/probe-results-${stamp}.json`
writeFileSync(outFile, JSON.stringify({ run_at: new Date().toISOString(), take: TAKE, rows }, null, 2))
console.log(`\n✓ Wrote ${rows.length} probe rows → ${outFile}`)

// Summary by recipe
const byRecipe = {}
for (const row of rows) {
  if (!row.ok) continue
  byRecipe[row.recipe] ??= { runs: 0, returned: 0, with_owner: 0 }
  byRecipe[row.recipe].runs++
  byRecipe[row.recipe].returned += row.returned
  byRecipe[row.recipe].with_owner += row.with_owner_address
}
console.log('\n--- Recipe averages ---')
for (const [slug, s] of Object.entries(byRecipe)) {
  const avg = (s.returned / s.runs).toFixed(1)
  const ownerPct = ((s.with_owner / Math.max(s.returned, 1)) * 100).toFixed(0)
  console.log(`  ${slug.padEnd(36)} avg ${avg}/${TAKE} returned, ${ownerPct}% w/ owner address`)
}
