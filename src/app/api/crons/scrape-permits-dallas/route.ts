import { NextRequest, NextResponse } from 'next/server'
import { scrapeCityPermits } from '@/lib/permitScraper'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/scrape-permits-dallas
 *
 * City of Dallas Building Inspection Permits.
 *
 * Previous resource (e7gq-4sah) returned zero records in the 2026-06-06
 * backfill — dataset rotated upstream. 2026-06-07 update: trying the
 * actively-maintained "Issued Building Permits" resource (m9zn-99zg)
 * with the correct field names per Dallas Open Data current schema.
 *
 * If this also fails: tenants in DFW fall through to census-aging via
 * /api/agents/discover-for-tenant.
 *
 * Daily 5am UTC.
 */

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  // 2026-06-07 — switched from e7gq-4sah (returned 0) to the active
  // Dallas Open Data resource. Field names verified against current
  // schema. If Dallas rotates again, run:
  //   curl 'https://www.dallasopendata.com/api/views/metadata/v1?q=building+permit'
  // to discover the live resource id.
  const result = await scrapeCityPermits({
    cityLabel: 'Dallas TX',
    socrataUrl: 'https://www.dallasopendata.com/resource/m9zn-99zg.json',
    fields: {
      issueDate: 'issued_date',
      workDescription: 'work_description',
      permitType: 'permit_type',
      cost: 'estimated_cost',
      fullAddress: 'street_address',
      zip: 'zip_code',
    },
  }, {
    lookbackDays: parseInt(url.searchParams.get('days') ?? '14', 10),
    limit: parseInt(url.searchParams.get('limit') ?? '500', 10),
  })

  return NextResponse.json({ ...result, checked_at: new Date().toISOString() })
}
