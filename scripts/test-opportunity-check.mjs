#!/usr/bin/env node
/**
 * Read-only test harness for the homepage opportunity-checker.
 *
 * Exercises the same query the /api/opportunity-check route runs against
 * production Supabase, but without writing to opportunity_checks /
 * opportunity_zip_cache. Use to verify real counts before applying the
 * migration or deploying the widget.
 *
 *   node scripts/test-opportunity-check.mjs
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: 'C:\\Users\\peter\\ringoco\\.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const RADIUS_MILES = 5
const WINDOW_DAYS = 90
const COUNT_FLOOR = 10

const CASES = [
  { zip: '85015', trade: 'hvac', label: 'Phoenix central (covered)' },
  { zip: '85013', trade: 'hvac', label: 'Phoenix midtown (covered)' },
  { zip: '85008', trade: 'hvac', label: 'Phoenix east (covered)' },
  { zip: '99501', trade: 'hvac', label: 'Anchorage AK (uncovered — has centroid, low leads)' },
  { zip: '00000', trade: 'hvac', label: 'Bogus zip (uncovered — no centroid row)' },
]

function roundDownClean(n) {
  if (n < 100) return Math.floor(n / 10) * 10
  if (n < 1000) return Math.floor(n / 50) * 50
  return Math.floor(n / 100) * 100
}

async function check(c) {
  const { data: centroid } = await supabase
    .from('zip_centroids')
    .select('zip, city, state')
    .eq('zip', c.zip)
    .maybeSingle()

  if (!centroid) {
    return { ...c, covered: false, rawCount: 0, displayed: null, reason: 'no zip_centroids row -> FALLBACK' }
  }

  const { data: nearby, error: rpcErr } = await supabase.rpc('zips_within_miles', {
    primary_zip: c.zip, radius_mi: RADIUS_MILES,
  })
  if (rpcErr) console.warn('rpc err', rpcErr)

  const zips = [c.zip, ...(Array.isArray(nearby) ? nearby.map(r => r.zip).filter(Boolean) : [])]
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3_600_000).toISOString()

  const { count, error: countErr } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .in('zip', zips)
    .gte('created_at', sinceIso)
    .contains('trade_match', [c.trade])

  if (countErr) return { ...c, error: countErr.message }

  const raw = count ?? 0
  const covered = raw >= COUNT_FLOOR
  return {
    ...c,
    centroid: `${centroid.city}, ${centroid.state}`,
    zipsQueried: zips.length,
    rawCount: raw,
    covered,
    displayed: covered ? `${roundDownClean(raw).toLocaleString()}+` : 'FALLBACK (waitlist email capture)',
  }
}

const out = []
for (const c of CASES) out.push(await check(c))
console.log(JSON.stringify(out, null, 2))
