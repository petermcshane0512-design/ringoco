import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { LEADS_PER_WEEK } from '@/lib/offer'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * POST /api/opportunity-check
 *
 * Real homepage zip-checker. Returns a count of homeowner opportunities
 * (rows in the `leads` table) within ~5 miles of the visitor's zip in the
 * last 90 days. NEVER fabricates. If the real count is <10 or the zip has
 * no centroid in zip_centroids, returns an "uncovered" fallback so the
 * widget can render the honest waitlist CTA.
 *
 * Body: { zip: "85015", trade: "hvac" | "plumbing" | ... | "other" }
 *
 * Reuses existing infra:
 *   - `leads` pool (2026-06-04 lead-engine build)
 *   - `zips_within_miles(zip, radius_mi)` SQL helper on zip_centroids
 *
 * Caches each (zip, trade) result for 24h in opportunity_zip_cache so
 * repeat checks are free. Every check is logged to opportunity_checks as
 * warm-lead capture (the visitor just told us their trade + service zip).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const CANONICAL_TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const
type CanonicalTrade = (typeof CANONICAL_TRADES)[number]

// Floor of "what real count is worth showing." Below this the spec
// requires the uncovered fallback — real beats big, but tiny numbers
// undermine the offer more than the fallback does.
const COUNT_FLOOR = 10
const CACHE_TTL_HOURS = 24
const RADIUS_MILES = 5
const WINDOW_DAYS = 90

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.ADMIN_API_SECRET || 'salt')).digest('hex').slice(0, 32)
}

// Round DOWN to a clean number per spec ("83 -> 80+"). Never round up.
// 10-99 -> nearest 10. 100-999 -> nearest 50. 1000+ -> nearest 100.
function roundDownClean(n: number): number {
  if (n < 100) return Math.floor(n / 10) * 10
  if (n < 1000) return Math.floor(n / 50) * 50
  return Math.floor(n / 100) * 100
}

function normalizeTrade(raw: string): { slug: string; canonical: CanonicalTrade | null; otherText?: string } {
  const t = (raw || '').toLowerCase().trim()
  if ((CANONICAL_TRADES as readonly string[]).includes(t)) {
    return { slug: t, canonical: t as CanonicalTrade }
  }
  if (t.startsWith('other')) {
    const txt = t.replace(/^other:?\s*/, '').slice(0, 80)
    return { slug: txt ? `other:${txt}` : 'other', canonical: null, otherText: txt || undefined }
  }
  return { slug: t.slice(0, 80), canonical: null }
}

type CacheRow = { count_real: number; covered: boolean; computed_at: string }

export async function POST(req: NextRequest) {
  let body: { zip?: string; trade?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const zip = (body.zip || '').replace(/\D/g, '').slice(0, 5)
  if (zip.length !== 5) {
    return NextResponse.json({ ok: false, error: 'zip must be 5 digits' }, { status: 400 })
  }
  const trade = normalizeTrade(body.trade || '')
  if (!trade.slug) {
    return NextResponse.json({ ok: false, error: 'trade required' }, { status: 400 })
  }

  // ── 1. Cache hit?
  let countReal: number | null = null
  let covered: boolean | null = null
  try {
    const { data: cacheRow } = await supabase
      .from('opportunity_zip_cache')
      .select('count_real, covered, computed_at')
      .eq('zip', zip)
      .eq('trade', trade.slug)
      .maybeSingle<CacheRow>()
    if (cacheRow) {
      const ageHours = (Date.now() - new Date(cacheRow.computed_at).getTime()) / 3_600_000
      if (ageHours < CACHE_TTL_HOURS) {
        countReal = cacheRow.count_real
        covered = cacheRow.covered
      }
    }
  } catch (e) {
    console.warn('[opportunity-check] cache read err', e)
  }

  // ── 2. Compute fresh if cache missed
  if (countReal === null || covered === null) {
    const { data: centroid } = await supabase
      .from('zip_centroids')
      .select('zip')
      .eq('zip', zip)
      .maybeSingle()

    if (!centroid) {
      // No centroid = zip outside US/Puerto Rico/territories. We literally
      // cannot deliver. Honest fallback.
      countReal = 0
      covered = false
    } else {
      // 2026-06-10 — coverage shifted from shared-pool model to per-tenant
      // BatchData on signup. Every US zip has a centroid; every signup
      // gets find-real-leads pulling 80 owner-occupied properties for THAT
      // tenant's address-radius. So coverage = centroid exists.
      //
      // Shared-pool count below is now INFORMATIONAL — used for the
      // "tracking N opportunities" microcopy only, not the covered gate.
      // Display of the count itself stays gated on count >= COUNT_FLOOR in
      // the widget (UncoveredFallback no longer shows; widget renders the
      // claim CTA whenever covered=true even if count display is null).
      covered = true
      const { data: nearbyRows, error: rpcErr } = await supabase.rpc('zips_within_miles', {
        primary_zip: zip,
        radius_mi: RADIUS_MILES,
      })
      if (rpcErr) {
        console.warn('[opportunity-check] zips_within_miles err', rpcErr)
      }
      const zips: string[] = [zip]
      if (Array.isArray(nearbyRows)) {
        for (const r of nearbyRows) {
          if (r?.zip && typeof r.zip === 'string') zips.push(r.zip)
        }
      }

      const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3_600_000).toISOString()
      let q = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .in('zip', zips)
        .gte('created_at', sinceIso)
      if (trade.canonical) {
        // trade_match is a text[] — contains [trade] means rows tagged for it.
        q = q.contains('trade_match', [trade.canonical])
      }
      const { count, error: countErr } = await q
      if (countErr) {
        console.warn('[opportunity-check] count err', countErr)
        countReal = 0
      } else {
        countReal = count ?? 0
      }
    }

    // Write through cache. Non-fatal on failure.
    try {
      await supabase.from('opportunity_zip_cache').upsert({
        zip,
        trade: trade.slug,
        count_real: countReal,
        covered,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'zip,trade' })
    } catch (e) {
      console.warn('[opportunity-check] cache write err', e)
    }
  }

  // ── 3. Territory status (defaults to 'open' when no row exists)
  let territoryStatus: 'open' | 'grace' | 'claimed' = 'open'
  try {
    const { data: terrRow } = await supabase
      .from('territories')
      .select('status, grace_expires_at')
      .eq('zip', zip)
      .eq('trade', trade.canonical ?? trade.slug)
      .maybeSingle<{ status: string; grace_expires_at: string | null }>()
    if (terrRow) {
      if (terrRow.status === 'claimed') territoryStatus = 'claimed'
      else if (terrRow.status === 'grace') {
        // Grace lapsed -> still bookable as open.
        const expired = terrRow.grace_expires_at && new Date(terrRow.grace_expires_at).getTime() < Date.now()
        territoryStatus = expired ? 'open' : 'grace'
      }
    }
  } catch (e) {
    console.warn('[opportunity-check] territory err', e)
  }

  // ── 4. Capture log (warm lead). Non-fatal.
  try {
    const h = req.headers
    const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0]?.trim() || ''
    await supabase.from('opportunity_checks').insert({
      zip,
      trade: trade.slug,
      count_returned: covered ? countReal : null,
      covered,
      promo: req.cookies.get('bavg_promo')?.value || null,
      ref_code: req.cookies.get('bavg_ref')?.value || req.cookies.get('bavg_creator_code')?.value || null,
      biz_id: req.cookies.get('bavg_biz_id')?.value || null,
      referer: h.get('referer')?.slice(0, 500) || null,
      user_agent: h.get('user-agent')?.slice(0, 500) || null,
      ip_hash: ip ? hashIp(ip) : null,
    })
  } catch (e) {
    console.warn('[opportunity-check] capture err', e)
  }

  const showCount = covered && countReal !== null && countReal >= COUNT_FLOOR
  return NextResponse.json({
    ok: true,
    zip,
    trade: trade.slug,
    covered,
    count: showCount ? roundDownClean(countReal!) : null,
    rawCount: countReal,
    territoryStatus,
    leadsPerWeek: LEADS_PER_WEEK,
    radiusMiles: RADIUS_MILES,
    windowDays: WINDOW_DAYS,
  })
}
