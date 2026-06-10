#!/usr/bin/env node
/**
 * scripts/recipes/probe-recipe.mjs — generic single-recipe prober.
 *
 * Hits BatchData property/search with a recipe's searchCriteria against
 * one zip, returns { returned, with_owner_address, sample, elapsed_ms }.
 *
 * Used standalone for ad-hoc probes OR as a subroutine by
 * test-all-recipes.mjs. NO writes — pure read-only intent.
 *
 * Cost: $0.05 per result returned, capped at --take (default 15).
 *
 *   node scripts/recipes/probe-recipe.mjs --slug hvac-hot-climate --zip 85015
 *   node scripts/recipes/probe-recipe.mjs --slug roofing-asphalt-3tab --zip 77002 --take 25
 *   node scripts/recipes/probe-recipe.mjs --slug hvac-mild-baseline --zip 60615 --json
 *   node scripts/recipes/probe-recipe.mjs --slug hvac-hot-climate --zip 85015 --dry-run
 *
 * Hard rule (Terminal 1 boundary): Recipe Lab use only. NOTHING here
 * gets written into leads / outreach_leads / find-real-leads.
 */
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { RECIPES } from './recipe-definitions.mjs'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

// ── CLI args ───────────────────────────────────────────────────────────
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const hasFlag = (n) => process.argv.includes(`--${n}`)

const SLUG = arg('slug', '')
const ZIP = arg('zip', '')
const TAKE = parseInt(arg('take', '15'), 10)
const AS_JSON = hasFlag('json')
const DRY_RUN = hasFlag('dry-run')

if (!SLUG || !ZIP) {
  console.error('Required: --slug <recipe-slug> --zip <5-digit>')
  console.error('Optional: --take <N=15> --json --dry-run')
  console.error('Available slugs: ' + RECIPES.map((r) => r.slug).join(', '))
  process.exit(1)
}

const recipe = RECIPES.find((r) => r.slug === SLUG)
if (!recipe) {
  console.error(`Unknown recipe slug: ${SLUG}`)
  console.error('Available: ' + RECIPES.map((r) => r.slug).join(', '))
  process.exit(1)
}

if (recipe.confidence === 'data-thin' || Object.keys(recipe.filters).length === 0) {
  console.error(`Recipe ${SLUG} is marked data-thin (no real filters). Refusing to probe.`)
  console.error(`Reason: ${recipe.rationale}`)
  process.exit(2)
}

const apiKey = process.env.BATCHDATA_API_KEY
if (!apiKey && !DRY_RUN) {
  console.error('BATCHDATA_API_KEY not set. Add --dry-run to see request payload only.')
  process.exit(1)
}

const searchCriteria = { ...recipe.filters, query: ZIP }
const body = { searchCriteria, options: { take: TAKE, skip: 0 } }

if (DRY_RUN) {
  console.log(JSON.stringify({ recipe: SLUG, zip: ZIP, would_send: body }, null, 2))
  process.exit(0)
}

const t0 = Date.now()
let result
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
    result = { ok: false, http: r.status, elapsed_ms, body_first_400: txt.slice(0, 400) }
  } else {
    const j = await r.json()
    const props = j?.results?.properties ?? []
    const withOwnerAddr = props.filter((p) => p?.owner?.mailingAddress?.street).length
    result = {
      ok: true,
      elapsed_ms,
      recipe: SLUG,
      zip: ZIP,
      take: TAKE,
      returned: props.length,
      with_owner_address: withOwnerAddr,
      fill_rate: TAKE > 0 ? Number((props.length / TAKE).toFixed(2)) : 0,
      sample: props[0]
        ? {
            address: props[0].address,
            owner_name: props[0].owner?.fullName ?? props[0].owner?.name?.full,
            year_built: props[0].building?.yearBuilt,
            value: props[0].valuation?.estimatedValue,
          }
        : null,
    }
  }
} catch (e) {
  result = { ok: false, error: e.message, elapsed_ms: Date.now() - t0 }
}

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`recipe=${SLUG} zip=${ZIP} take=${TAKE}`)
  if (!result.ok) {
    console.log(`  ✗ FAILED ${JSON.stringify(result)}`)
  } else {
    console.log(`  ✓ returned=${result.returned}/${TAKE} (fill ${(result.fill_rate * 100).toFixed(0)}%)  owner-addr=${result.with_owner_address}  ${result.elapsed_ms}ms`)
    if (result.sample) {
      console.log(`  sample: ${result.sample.owner_name || '?'} · ${result.sample.address?.street || '?'} · built ${result.sample.year_built || '?'} · $${result.sample.value || '?'}`)
    }
  }
}
