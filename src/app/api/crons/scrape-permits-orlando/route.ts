import { NextRequest, NextResponse } from 'next/server'
import { scrapeCityPermits } from '@/lib/permitScraper'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/scrape-permits-orlando
 *
 * City of Orlando Permit Applications (last 365 days).
 * Source: data.cityoforlando.net resource ryhf-m453
 * Daily 5:30am UTC.
 *
 * Notes: Orlando dataset has no direct lat/lng or zip — uses
 * geocoded_column (string lat/lng pair) + permit_address.
 * We'll parse geocoded_column post-hoc; for now use only the
 * permit_address + nearest-centroid via property_owner_name's
 * known billing ZIP if available. Skipping rows without geo.
 */

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const result = await scrapeCityPermits({
    cityLabel: 'Orlando FL',
    socrataUrl: 'https://data.cityoforlando.net/resource/ryhf-m453.json',
    dateColumn: 'processed_date',
    fields: {
      issueDate: 'processed_date',
      workDescription: 'worktype',
      permitType: 'application_type',
      cost: 'estimated_cost',
      fullAddress: 'permit_address',
      // Orlando ryhf-m453 stores geo as nested GeoJSON Point in
      // `geocoded_column.coordinates: [lng, lat]`. Flat
      // `location_latitude/longitude` virtual columns DO NOT exist on this
      // resource — prior config silently produced skippedNoGeo on every row.
      // 2026-06-10 fix.
      geocodedColumn: 'geocoded_column',
    },
  }, {
    lookbackDays: parseInt(url.searchParams.get('days') ?? '14', 10),
    limit: parseInt(url.searchParams.get('limit') ?? '500', 10),
  })

  return NextResponse.json({ ...result, checked_at: new Date().toISOString() })
}
