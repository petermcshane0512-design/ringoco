#!/usr/bin/env node
/**
 * enrich-leads.mjs — BellAveGo cold-outreach lead enrichment pipeline
 *
 * INPUT
 *   Apify Google Maps Scraper CSV export (compass/crawler-google-places).
 *   Pass the path as the first CLI arg.
 *
 * WHAT IT DOES
 *   1. Reads the CSV
 *   2. Filters out: closed, no phone, national chains, >500 reviews,
 *      <4.0 rating, <10 reviews, non-trade categories
 *   3. Tiers the survivors A/B/C by review count + rating + website
 *      sophistication
 *   4. Calls Claude Sonnet 4.6 to enrich each survivor with:
 *      - owner_first_name_guess
 *      - company_summary (1 sentence, factual, references their numbers)
 *      - pitch_hook (2 sentences, conversational, references specifics)
 *      - estimated_size (solo / 2-5 / 5-15)
 *      - recommended_plan (Starter $147 / Pro $297)
 *   5. Writes two CSVs next to the input file:
 *      - {basename}-enriched.csv  (all tiered rows + enrichment)
 *      - {basename}-tier-a.csv    (just Tier A for dialing first)
 *   6. Logs filter breakdown + Claude cost estimate
 *
 * USAGE
 *   npm install csv-parse csv-stringify p-limit dotenv   (one-time)
 *   node scripts/enrich-leads.mjs ./data/apify-phoenix-hvac.csv
 *
 * ENV
 *   ANTHROPIC_API_KEY — required. Read from .env first, then .env.local.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'
import pLimit from 'p-limit'

// Load .env first (the spec'd location), .env.local as fallback so it
// also works in dev environments that already have the key there.
dotenv.config()
dotenv.config({ path: '.env.local' })

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey || apiKey.length < 10) {
  console.error('❌ ANTHROPIC_API_KEY not set in .env or .env.local')
  process.exit(1)
}

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/enrich-leads.mjs <path-to-apify-csv>')
  process.exit(1)
}
if (!fs.existsSync(inputPath)) {
  console.error(`❌ File not found: ${inputPath}`)
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────────
// Filter rules
// ──────────────────────────────────────────────────────────────────

// Match by substring (case-insensitive) — handles minor name variations
const NATIONAL_CHAINS = [
  'roto-rooter', 'roto rooter',
  'mr. rooter', 'mr rooter',
  'benjamin franklin plumbing', 'benjamin franklin',
  'service experts',
  'ars/rescue rooter', 'ars rescue rooter', 'rescue rooter',
  'one hour heating',
  'aire serv',
  'mr. electric', 'mr electric',
  'parker & sons', 'parker and sons',
  'george brazil',
  'goettl',
  'hays cooling',
]

function nationalChainMatch(name) {
  const n = (name || '').toLowerCase()
  for (const chain of NATIONAL_CHAINS) {
    if (n.includes(chain)) return chain
  }
  return null
}

// Trade-specific category whitelist — must contain at least one keyword
const TRADE_KEYWORDS = [
  'hvac', 'air conditioning', 'ac repair', 'ac contractor',
  'heating', 'cooling', 'furnace',
  'plumbing', 'plumber',
  'electrical', 'electrician',
]
function isTradeSpecific(categories) {
  const c = (categories || '').toLowerCase()
  return TRADE_KEYWORDS.some(k => c.includes(k))
}

// Tier classifier
//   A: 25-100 reviews, 4.2+ rating, no website OR low-sophistication site
//   B: 100-200 reviews, 4.0+ rating, has website (presumed pro setup)
//   C: 10-25 reviews, 4.0+ rating (small but legit)
function tierOf(reviewCount, rating, website) {
  const w = (website || '').toLowerCase()
  const lowSophistication =
    !w ||
    w.includes('sites.google.com') ||
    w.includes('.wordpress.com') ||
    w.includes('weebly.com') ||
    w.includes('wix.com') ||
    w.includes('squarespace.com')

  // Peter's call learning 5/28/2026: shops with >150 reviews already have
  // receptionists / marketing teams / in-house staff. Real ICP = small dogs:
  // solo operators + 2-5 truck shops who answer the phone themselves.
  // New tiering targets 5-150 reviews; A = ideal sweet spot.
  if (reviewCount >= 5 && reviewCount <= 60 && rating >= 4.2 && lowSophistication) return 'A'
  if (reviewCount >= 10 && reviewCount <= 100 && rating >= 4.0) return 'B'
  if (reviewCount >= 5 && reviewCount < 10 && rating >= 4.0) return 'C'
  return null
}

// ──────────────────────────────────────────────────────────────────
// Apify CSV → normalized lead
// ──────────────────────────────────────────────────────────────────
// Apify Google Maps Scraper outputs vary by version. We try multiple
// column names for each field to be defensive.

function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k]
  }
  return ''
}

function normalize(row) {
  // Address parsing — Apify usually gives a single "address" column
  // formatted like "1234 Main St, Mesa, AZ 85201, United States"
  const address = pick(row, 'address', 'street')
  const cityFromRow = pick(row, 'city', 'addressInfo/city')
  // Fallback: parse city from "Street, City, State ZIP, Country"
  let city = cityFromRow
  if (!city && address) {
    const parts = address.split(',').map(s => s.trim())
    if (parts.length >= 3) city = parts[parts.length - 3]
  }
  return {
    name: pick(row, 'title', 'name'),
    phone: pick(row, 'phoneUnformatted', 'phone'),
    address,
    city,
    website: pick(row, 'website', 'url'),
    rating: parseFloat(pick(row, 'totalScore', 'rating', 'stars') || '0') || 0,
    reviewCount: parseInt(pick(row, 'reviewsCount', 'reviewCount', 'reviews') || '0', 10) || 0,
    permanentlyClosed:
      pick(row, 'permanentlyClosed', 'permanently_closed') === 'true' ||
      pick(row, 'permanentlyClosed', 'permanently_closed') === true,
    categories:
      pick(row, 'categoryName', 'categories/0', 'categories', 'category') ||
      [pick(row, 'categories/0'), pick(row, 'categories/1'), pick(row, 'categories/2')]
        .filter(Boolean).join(', '),
    placeId: pick(row, 'placeId', 'place_id', 'id'),
  }
}

// ──────────────────────────────────────────────────────────────────
// Claude enrichment
// ──────────────────────────────────────────────────────────────────
const client = new Anthropic({ apiKey })

const BELLAVEGO_CONTEXT = `BellAveGo is an AI phone receptionist for small home-service contractors.
When the contractor can't pick up (on a job, after hours), our AI "Emma" answers in their
business's name, captures the lead (name, callback, issue, urgency), and texts the
contractor a summary in 20 seconds. Per-tenant dedicated AI assistant per contractor —
trained on THEIR business, not a shared bot like Rosie/Goodcall. Competitive moat.

Pricing: Starter $147/mo (60 calls + core receptionist) or Pro $297/mo (300 calls +
quote follow-ups + collections + Google review management). Bi-monthly AI consulting
reports on missed calls + top services + what to fix.

Target buyer: small owner-operator HVAC/AC/plumbing/electrical contractors, 1-15
employees. Owner or one office person answers the phone. Loses jobs when techs are
mid-call and phones ring out. Year-round AC demand in Arizona = missed calls = real
revenue loss. Spanish customer base in Phoenix metro (BellAveGo supports Spanish).`

function buildPrompt(lead) {
  return `You are generating cold-call enrichment data for a BellAveGo sales rep.

BellAveGo context:
${BELLAVEGO_CONTEXT}

The lead you're enriching:
- Business: ${lead.name}
- Phone: ${lead.phone}
- City: ${lead.city || 'unknown'}
- Address: ${lead.address}
- Website: ${lead.website || 'NONE'}
- Google rating: ${lead.rating} stars
- Review count: ${lead.reviewCount}
- Categories: ${lead.categories}

Generate a JSON response with exactly these fields:
{
  "owner_first_name_guess": "...",     // Parse from business name if it contains a person's name ("Mike's HVAC" → "Mike", "Smith Plumbing" → ""). Empty string if uncertain.
  "company_summary": "...",            // ONE sentence, factual, references their actual numbers. Example: "Family-owned AC shop in Mesa, 47 reviews + 4.6 stars, no website — looks like a 2-3 person operation taking calls on a personal cell."
  "pitch_hook": "...",                 // TWO SENTENCES — what the sales rep reads at the START of a cold call. MUST reference at least 2 specific data points (name + city, or review count + rating, or website status + size). Conversational. End with a soft ask like "got 90 seconds for one question?". NOT a template.
  "estimated_size": "solo|2-5|5-15",   // Infer from review count + website sophistication. <20 reviews + no site = solo. 50-100 reviews + basic site = 2-5. 100+ reviews + real site = 5-15.
  "recommended_plan": "Starter|Pro"    // Starter ($147) for solo + 2-5 employees. Pro ($297) for 5-15.
}

Hard rules for pitch_hook (this is what the rep reads VERBATIM on the call):
- MUST reference at least 2 specific data points from the lead above
- MUST sound like a human salesperson — contractions, natural rhythm, NO marketing-speak
- NEVER mention "BellAveGo" or product features in the hook — that comes AFTER they say yes to the 90 seconds
- The hook earns the 90 seconds; it does not pitch

Good example for "Desert Air, Mesa, 47 reviews, 4.6 stars, no website":
"Hey — saw Desert Air on Google with 47 five-star reviews from Mesa customers, looks like you've got a solid local rep. Calling because most shops your size are losing 2-3 jobs a week to missed calls when techs are out — got 90 seconds for one question?"

Bad examples (do NOT do this):
- "I help HVAC contractors capture missed calls." (generic, no specifics)
- "Our revolutionary AI synergizes..." (marketing-speak)
- "Hi, I'm calling from BellAveGo about our AI receptionist service" (named product before earning the time)

Output ONLY the JSON object. No markdown fences, no commentary, no preamble.`
}

async function enrich(lead) {
  try {
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: buildPrompt(lead) }],
    })
    const text = res.content[0]?.type === 'text' ? res.content[0].text : ''
    // Strip possible markdown fence + trim
    const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(jsonStr)
    return {
      owner_first_name_guess: parsed.owner_first_name_guess || '',
      company_summary: parsed.company_summary || '',
      pitch_hook: parsed.pitch_hook || '',
      estimated_size: parsed.estimated_size || 'unknown',
      recommended_plan: parsed.recommended_plan || 'Starter',
      _input_tokens: res.usage?.input_tokens || 0,
      _output_tokens: res.usage?.output_tokens || 0,
    }
  } catch (e) {
    console.error(`  ⚠ enrich failed for "${lead.name}": ${e.message.slice(0, 100)}`)
    return {
      owner_first_name_guess: '',
      company_summary: `[enrichment failed: ${e.message.slice(0, 80)}]`,
      pitch_hook: '[enrichment failed — write hook manually]',
      estimated_size: 'unknown',
      recommended_plan: 'Starter',
      _input_tokens: 0,
      _output_tokens: 0,
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`📂 Reading ${inputPath}`)
  const raw = fs.readFileSync(inputPath, 'utf8')
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true })
  console.log(`   ${rows.length} rows in CSV`)

  // Filter pass
  const tiered = []
  const excluded = []
  for (const row of rows) {
    const lead = normalize(row)

    if (lead.permanentlyClosed) {
      excluded.push({ name: lead.name, reason: 'permanently closed' }); continue
    }
    if (!lead.phone) {
      excluded.push({ name: lead.name, reason: 'no phone' }); continue
    }
    const chain = nationalChainMatch(lead.name)
    if (chain) {
      excluded.push({ name: lead.name, reason: `national chain: ${chain}` }); continue
    }
    if (lead.reviewCount >= 150) {
      // Per Peter's call learning 5/28: 150+ review shops already have
      // receptionists + marketing teams. Wrong ICP for AI receptionist sale.
      excluded.push({ name: lead.name, reason: `too big — has receptionist (${lead.reviewCount} reviews)` }); continue
    }
    if (lead.rating > 0 && lead.rating < 4.0) {
      excluded.push({ name: lead.name, reason: `low rating ${lead.rating.toFixed(1)}` }); continue
    }
    if (lead.reviewCount < 10) {
      excluded.push({ name: lead.name, reason: `too small (${lead.reviewCount} reviews)` }); continue
    }
    if (!isTradeSpecific(lead.categories)) {
      excluded.push({ name: lead.name, reason: `not trade-specific: ${(lead.categories || '(empty)').slice(0, 40)}` }); continue
    }
    const tier = tierOf(lead.reviewCount, lead.rating, lead.website)
    if (!tier) {
      excluded.push({
        name: lead.name,
        reason: `no tier match (${lead.reviewCount}rev / ${lead.rating}★ / ${lead.website ? 'web' : 'no-web'})`,
      })
      continue
    }
    tiered.push({ ...lead, tier })
  }

  console.log(`   ✅ ${tiered.length} kept · ❌ ${excluded.length} excluded`)
  const tierA = tiered.filter(t => t.tier === 'A').length
  const tierB = tiered.filter(t => t.tier === 'B').length
  const tierC = tiered.filter(t => t.tier === 'C').length
  console.log(`   Tier A: ${tierA} · Tier B: ${tierB} · Tier C: ${tierC}`)

  if (tiered.length === 0) {
    console.error('No leads survived filtering. Nothing to enrich. Exiting.')
    process.exit(0)
  }

  // Enrich with Claude — 5 concurrent
  console.log(`\n🤖 Enriching with Claude Sonnet 4.6 (5 concurrent)…`)
  const limit = pLimit(5)
  let done = 0
  let totalIn = 0
  let totalOut = 0
  const enriched = await Promise.all(
    tiered.map(lead =>
      limit(async () => {
        const e = await enrich(lead)
        totalIn += e._input_tokens
        totalOut += e._output_tokens
        done++
        if (done % 10 === 0 || done === tiered.length) {
          console.log(`   ${done}/${tiered.length} enriched`)
        }
        return { ...lead, ...e }
      }),
    ),
  )

  // Build output rows in the spec'd column order
  const outputRows = enriched.map(l => ({
    tier: l.tier,
    business_name: l.name,
    owner_first_name_guess: l.owner_first_name_guess,
    phone: l.phone,
    city: l.city,
    address: l.address,
    website: l.website,
    google_rating: l.rating,
    review_count: l.reviewCount,
    categories: l.categories,
    estimated_size: l.estimated_size,
    recommended_plan: l.recommended_plan,
    company_summary: l.company_summary,
    pitch_hook: l.pitch_hook,
    apify_place_id: l.placeId,
    status: 'NEW',
    assigned_to: '',
    dial_attempt_1_date: '',
    result_1: '',
    dial_attempt_2_date: '',
    result_2: '',
    notes: '',
  }))

  // Sort: Tier A first, then by review count descending (most validated first)
  outputRows.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier)
    return b.review_count - a.review_count
  })

  const inputDir = path.dirname(inputPath)
  const inputBase = path.basename(inputPath, path.extname(inputPath))
  // If basename matches the convention, write the spec'd filenames;
  // otherwise prefix outputs with the input basename so multiple runs
  // don't overwrite each other.
  const enrichedName =
    /phoenix.*hvac/i.test(inputBase) ? 'phoenix-hvac-enriched.csv' : `${inputBase}-enriched.csv`
  const tierAName =
    /phoenix.*hvac/i.test(inputBase) ? 'phoenix-hvac-tier-a.csv' : `${inputBase}-tier-a.csv`

  const enrichedPath = path.join(inputDir, enrichedName)
  const tierAPath = path.join(inputDir, tierAName)

  fs.writeFileSync(enrichedPath, stringify(outputRows, { header: true }))
  fs.writeFileSync(
    tierAPath,
    stringify(outputRows.filter(r => r.tier === 'A'), { header: true }),
  )

  // Cost estimate — Claude Sonnet 4.6 pricing: $3/M input, $15/M output
  const inCost = (totalIn / 1_000_000) * 3
  const outCost = (totalOut / 1_000_000) * 15
  const totalCost = inCost + outCost

  console.log()
  console.log('═'.repeat(64))
  console.log('DONE')
  console.log('═'.repeat(64))
  console.log(`Input rows:       ${rows.length}`)
  console.log(`Excluded:         ${excluded.length}`)
  console.log(`Enriched:         ${enriched.length}`)
  console.log(`  Tier A:         ${tierA}  (dial first)`)
  console.log(`  Tier B:         ${tierB}`)
  console.log(`  Tier C:         ${tierC}`)
  console.log()
  console.log(`Output:`)
  console.log(`  ${enrichedPath}`)
  console.log(`  ${tierAPath}`)
  console.log()
  console.log(`Claude usage:`)
  console.log(`  Input tokens:   ${totalIn.toLocaleString()}`)
  console.log(`  Output tokens:  ${totalOut.toLocaleString()}`)
  console.log(`  Est cost:       $${totalCost.toFixed(3)}`)
  console.log()

  // Top exclusion reasons — useful for tuning filters
  const reasonCounts = {}
  for (const e of excluded) {
    // Bucket the reason (strip variable bits like specific review counts)
    const bucket = e.reason
      .replace(/\(\d+ reviews\)/, '(N reviews)')
      .replace(/rating \d\.\d/, 'rating X.X')
      .replace(/\(\d+rev.*\)/, '(no tier)')
      .replace(/national chain: .+/, 'national chain')
      .replace(/not trade-specific: .+/, 'not trade-specific')
    reasonCounts[bucket] = (reasonCounts[bucket] || 0) + 1
  }
  const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log('Top exclusion reasons:')
  for (const [reason, count] of sorted) {
    console.log(`  ${String(count).padStart(4)} × ${reason}`)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
