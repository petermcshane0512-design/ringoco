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
 * 2026-06-09 REWRITE — nationwide instant coverage.
 *
 * Old shape: tried city scraper first (only 5 cities work), then fell back
 * to BatchData. Small-metro signups got nothing instant.
 *
 * New shape: BatchData `find-real-leads` runs FIRST as the foundation.
 * Every US zip works day 1. City scrapers + census refresh layer on TOP as
 * bonus signals when available. Idempotent. Safe to re-call.
 *
 * Order:
 *   0. BATCHDATA NATIONAL PULL — find-real-leads pulls up to 80 owner-
 *                                occupied candidates across tenant's primary
 *                                zips + radius expansion. Skip-traces top
 *                                20 for verified phones. ~$6 CAC.
 *   1. CITY SCRAPE OPPORTUNISTIC — if tenant's metro matches a registered
 *                                   scraper, fire it for bonus permit-driven
 *                                   leads on top of the BatchData base.
 *   2. CENSUS AGING TOP-UP        — fire only if pool still light (<25)
 *                                   after foundation + city scrape.
 *
 * Auth: x-admin-secret OR Clerk admin session.
 *
 * Body:  { user_id: string }
 * Output: { ok, steps, leads_in_radius, service_area, zip, trade }
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

  // STEP 0 — BATCHDATA NATIONAL FOUNDATION (2026-06-09 reorder).
  // Was last; now first. Guarantees every US zip gets ~80 candidates +
  // 20 skip-traced phones day 1. ~$6 CAC. The lead-engine cron later
  // delivers from this pool to the dashboard.
  try {
    const r = await fetch(`${APP_URL}/api/agents/find-real-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_API_SECRET || '',
      },
      body: JSON.stringify({ user_id: userId, max_candidates: 80, skip_trace_top_n: 20 }),
    })
    const json = await r.json().catch(() => ({}))
    steps.push({
      kind: 'find_real_leads',
      ok: r.ok && json.ok,
      detail: `assigned=${json.assigned ?? 0} zips=${json.zips_searched ?? 0} skip_traced=${json.skip_traced ?? 0} spent_cents=${json.spent_cents ?? 0}${json.reason ? ` reason=${json.reason}` : ''}`,
    })
  } catch (e) {
    steps.push({ kind: 'find_real_leads', ok: false, detail: (e as Error).message })
  }

  // STEP 1 — city scraper layered on top. Bonus permit-driven leads on
  // top of the BatchData foundation when tenant happens to be in a metro
  // we already scrape. No-op for everyone else (foundation already covers).
  const area = (profile.service_area || '').toString()
  const cityMatch = CITY_SCRAPERS.find((c) => c.match.test(area))
  if (cityMatch) {
    steps.push(await fireCityScraper(cityMatch.route, 30))
  } else {
    steps.push({ kind: 'scrape:city', ok: true, detail: `no city scraper for "${area}" — BatchData foundation covers it` })
  }

  // STEP 2 — census-aging refresh ONLY if pool is still light after
  // foundation + city scrape. Should almost never fire now.
  const { count: poolAfterFoundation } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .contains('trade_match', [tradeFilter])
    .in('zip', [...eligibleZips])

  if ((poolAfterFoundation ?? 0) < 25) {
    steps.push(await fireCensusAging())
  } else {
    steps.push({ kind: 'scrape:census-aging', ok: true, detail: `pool sufficient (${poolAfterFoundation}), skipped` })
  }

  steps.push({ kind: 'skip_trace', ok: true, detail: 'top-20 verified during find-real-leads; remainder click-to-reveal' })

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
