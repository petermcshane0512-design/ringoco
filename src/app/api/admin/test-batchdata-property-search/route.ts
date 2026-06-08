import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { batchdataPropertySearch } from '@/lib/skipTrace'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * POST /api/admin/test-batchdata-property-search
 *
 * Hits BatchData Property Search across 5 random US zips with handyman-
 * style filters (recent buyers, owner-occupied, 1970-2010 build) and
 * reports what came back. Used to verify the national coverage path
 * BEFORE committing to BatchData as the universal fallback for any
 * city without a Socrata permit scraper.
 *
 * Returns the raw count + first 3 sample properties per zip so we can
 * see if the API call shape is correct OR if it returns 0 for unknown
 * reasons.
 *
 * Cost: ~$0.05 per property × ~5 properties × 5 zips = ~$1.25 total.
 */
const ZIPS = [
  { zip: '30309', city: 'Atlanta GA' },
  { zip: '33133', city: 'Miami FL' },
  { zip: '80205', city: 'Denver CO' },
  { zip: '98101', city: 'Seattle WA' },
  { zip: '83702', city: 'Boise ID' },
]

export async function POST() {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    const results = []
    for (const z of ZIPS) {
      const r = await batchdataPropertySearch({
        zip: z.zip,
        yearBuiltMin: 1970,
        yearBuiltMax: 2010,
        recentSaleWithinDays: 180,
        ownerOccupiedOnly: true,
        resultsLimit: 5,
      })
      results.push({
        zip: z.zip,
        city: z.city,
        ok: r.ok,
        count: r.properties.length,
        cost_cents: r.cost_cents,
        error: r.error,
        sample: r.properties.slice(0, 3).map((p) => ({
          street: p.street_address,
          owner: p.owner_name,
          year_built: p.year_built,
          last_sale: p.last_sale_date,
        })),
      })
    }

    const totalCost = results.reduce((s, r) => s + r.cost_cents, 0)
    const totalProps = results.reduce((s, r) => s + r.count, 0)
    const okZips = results.filter((r) => r.ok && r.count > 0).length

    return NextResponse.json({
      ok: true,
      summary: {
        zips_tested: ZIPS.length,
        zips_returning_properties: okZips,
        total_properties_returned: totalProps,
        total_cost_dollars: (totalCost / 100).toFixed(2),
      },
      verdict: okZips === ZIPS.length
        ? '✅ BatchData Property Search works nationally — wire as universal fallback for non-Socrata cities'
        : okZips === 0
          ? '❌ BatchData returned 0 across all zips — request shape is broken, need to fix'
          : `⚠ Partial: ${okZips}/${ZIPS.length} zips returned properties — investigate per-zip failures`,
      results,
    })
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ ok: false, error: err.message || String(e) }, { status: 500 })
  }
}
