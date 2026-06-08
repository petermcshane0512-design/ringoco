import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/agents/discover-for-tenant
 *
 * On-signup lead discovery. Fires from the Stripe webhook the moment a
 * subscription activates AND from a 6-hourly per-tenant cron to keep the
 * pool fresh.
 *
 * Architecture (Peter spec 2026-06-06):
 *   "You don't have to scrape these leads now. Just when someone signs
 *    up you have to be able to have that agent go find them for them."
 *
 * The agent — given a tenant's ZIPs + trade — does up to 3 things in
 * priority order, stopping when it has enough fresh leads in their radius:
 *
 *   1. KNOWN-CITY SCRAPE   — if the tenant's metro has a city-specific
 *                            permit scraper registered, fire it on-demand
 *                            (last 30 days, scoped to their state).
 *   2. CENSUS AGING-HVAC   — Census ACS aging-housing already runs
 *                            nationally; if their ZIPs are stale, trigger
 *                            a targeted refresh for just their state.
 *   3. SKIP-TRACE PASS     — for every lead in their 50mi radius that has
 *                            no phone yet, BatchData lookup ($0.10/each).
 *
 * Idempotent. Safe to re-call. Auth: x-admin-secret OR Clerk admin session
 * OR an internal `internal_user_id` query param signed via webhook trust.
 *
 * Body / query:
 *   { user_id: string }   — required
 *
 * Output:
 *   { ok, steps: [...], leads_in_radius, skip_traced }
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

// Registry of city-specific permit scrapers. Add new entries when we build
// a new city scraper. The key is matched against the tenant's
// service_area (rough "City, ST" string) — case-insensitive substring.
const CITY_SCRAPERS: Array<{ match: RegExp; route: string }> = [
  { match: /chicago/i,  route: '/api/crons/scrape-permits-chicago'  },
  { match: /austin/i,   route: '/api/crons/scrape-permits-austin'   },
  { match: /phoenix|scottsdale|mesa|tempe|chandler|glendale/i, route: '/api/crons/scrape-permits-phoenix' },
  { match: /dallas|plano|irving|garland|frisco/i,              route: '/api/crons/scrape-permits-dallas'  },
  { match: /orlando|kissimmee/i,                                route: '/api/crons/scrape-permits-orlando' },
]

type Step = { kind: string; ok: boolean; detail?: string }

async function fireCityScraper(route: string, lookbackDays: number): Promise<Step> {
  const url = `${APP_URL}${route}?days=${lookbackDays}&limit=1500`
  try {
    const r = await fetch(url, {
      headers: { 'x-admin-secret': process.env.ADMIN_API_SECRET || '' },
    })
    const ok = r.ok
    return { kind: `scrape:${route}`, ok, detail: ok ? `HTTP ${r.status}` : `HTTP ${r.status}` }
  } catch (e) {
    return { kind: `scrape:${route}`, ok: false, detail: (e as Error).message }
  }
}

async function fireCensusAging(): Promise<Step> {
  // Census aging is a global pull (one Census API call), not state-scoped.
  // Already runs weekly Monday 4am UTC. Fire it on-demand only when the
  // tenant's ZIPs have zero aging-HVAC leads — otherwise it's wasted work.
  try {
    const r = await fetch(`${APP_URL}/api/crons/scrape-census-aging`, {
      headers: { 'x-admin-secret': process.env.ADMIN_API_SECRET || '' },
    })
    return { kind: 'scrape:census-aging', ok: r.ok, detail: `HTTP ${r.status}` }
  } catch (e) {
    return { kind: 'scrape:census-aging', ok: false, detail: (e as Error).message }
  }
}

async function discoverForTenant(userId: string): Promise<{
  ok: boolean
  steps: Step[]
  leads_in_radius: number
  service_area?: string
  zip?: string
  trade?: string
}> {
  const steps: Step[] = []

  type ProfileRow = {
    user_id: string
    service_zips: string[] | null
    service_radius_mi: number | null
    business_type: string | null
    service_area: string | null
    zip_code: string | null
  }
  const { data: profileRaw, error } = await supabase
    .from('profiles')
    .select('user_id, service_zips, service_radius_mi, business_type, service_area, zip_code')
    .eq('user_id', userId)
    .maybeSingle()
  const profile = profileRaw as ProfileRow | null

  if (error || !profile) {
    return { ok: false, steps: [{ kind: 'fetch_profile', ok: false, detail: error?.message || 'not found' }], leads_in_radius: 0 }
  }

  const homeZips = (profile.service_zips || []).filter(Boolean)
  const radius = Math.min(50, profile.service_radius_mi ?? 20)
  const trade = (profile.business_type || '').toLowerCase()
  const tradeFilter = trade.includes('plumb') ? 'plumbing'
    : trade.includes('elect') ? 'electrical'
    : trade.includes('roof') ? 'roofing'
    : trade.includes('handy') ? 'handyman'
    : 'hvac'

  if (homeZips.length === 0) {
    return {
      ok: false,
      steps: [{ kind: 'profile_check', ok: false, detail: 'no service_zips on profile' }],
      leads_in_radius: 0,
      service_area: profile.service_area ?? undefined,
      trade: tradeFilter,
    }
  }

  // Expand to full radius coverage
  const eligibleZips = new Set<string>(homeZips)
  for (const hz of homeZips) {
    const { data: nearby } = await supabase.rpc('zips_within_miles', {
      primary_zip: hz,
      radius_mi: radius,
    })
    if (Array.isArray(nearby)) {
      for (const z of nearby) {
        if (z?.zip) eligibleZips.add(z.zip)
      }
    }
  }

  // Count current pool inside the tenant's radius
  const { count: poolBefore } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .contains('trade_match', [tradeFilter])
    .in('zip', [...eligibleZips])

  steps.push({ kind: 'count_pool_before', ok: true, detail: `${poolBefore ?? 0} candidates in ${eligibleZips.size} ZIPs` })

  // Step 1 — city scraper if tenant's metro matches a registered scraper.
  const area = (profile.service_area || '').toString()
  const cityMatch = CITY_SCRAPERS.find((c) => c.match.test(area))
  if (cityMatch) {
    steps.push(await fireCityScraper(cityMatch.route, 30))
  } else {
    steps.push({ kind: 'scrape:city', ok: true, detail: `no city scraper registered for "${area}" — falling through to census-aging` })
  }

  // Step 2 — census-aging targeted refresh ONLY if pool is still light.
  // Re-count after city scrape; if still under 15 candidates, fire aging.
  const { count: poolAfterCity } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .contains('trade_match', [tradeFilter])
    .in('zip', [...eligibleZips])

  if ((poolAfterCity ?? 0) < 15) {
    steps.push(await fireCensusAging())
  } else {
    steps.push({ kind: 'scrape:census-aging', ok: true, detail: 'pool sufficient, skipped' })
  }

  // 2026-06-07 — UNIVERSAL FALLBACK via BatchData Property Search.
  // After city scrape + census-aging, fire find-real-leads to populate
  // address-level leads for ANY US zip — handles every city without a
  // dedicated scraper. Costs ~$0.05/property × 15 = $0.75 per tenant.
  try {
    const r = await fetch(`${APP_URL}/api/agents/find-real-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_API_SECRET || '',
      },
      body: JSON.stringify({ user_id: userId }),
    })
    const json = await r.json().catch(() => ({}))
    steps.push({ kind: 'find_real_leads', ok: r.ok && json.ok, detail: `assigned=${json.assigned ?? 0} spent_cents=${json.spent_cents ?? 0}${json.reason ? ` reason=${json.reason}` : ''}` })
  } catch (e) {
    steps.push({ kind: 'find_real_leads', ok: false, detail: (e as Error).message })
  }

  // Click-to-reveal phones — no enrichment at discovery time.
  steps.push({ kind: 'skip_trace', ok: true, detail: 'click-to-reveal — no enrichment at discovery time' })

  const { count: poolAfter } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .contains('trade_match', [tradeFilter])
    .in('zip', [...eligibleZips])

  return {
    ok: true,
    steps,
    leads_in_radius: poolAfter ?? 0,
    service_area: profile.service_area ?? undefined,
    zip: profile.zip_code ?? undefined,
    trade: tradeFilter,
  }
}

export async function POST(req: NextRequest) {
  // Two auth paths: admin (Clerk session or header) OR an internal
  // webhook-trust signature. The Stripe webhook fires this from server
  // code inside the same Vercel project, so we trust the admin-secret
  // header path. No public callers — never exposed without auth.
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: { user_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  if (!body.user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  const result = await discoverForTenant(body.user_id)
  return NextResponse.json(result)
}
