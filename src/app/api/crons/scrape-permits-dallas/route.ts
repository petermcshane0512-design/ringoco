import { NextRequest, NextResponse } from 'next/server'
import { scrapeCityPermits } from '@/lib/permitScraper'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/scrape-permits-dallas
 *
 * City of Dallas Building Inspection Permits.
 * Source: dallasopendata.com resource e7gq-4sah
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
  // Dallas dataset has 'mapped_location' with lat/lng inside, plus a separate
  // 'work_description' field. Some rows have 'permit_address' as combined.
  const result = await scrapeCityPermits({
    cityLabel: 'Dallas TX',
    socrataUrl: 'https://www.dallasopendata.com/resource/e7gq-4sah.json',
    fields: {
      issueDate: 'issued_date',
      workDescription: 'work_description',
      permitType: 'permit_type',
      cost: 'value',
      fullAddress: 'permit_address',
      latitude: 'latitude',
      longitude: 'longitude',
    },
  }, {
    lookbackDays: parseInt(url.searchParams.get('days') ?? '14', 10),
    limit: parseInt(url.searchParams.get('limit') ?? '500', 10),
  })

  return NextResponse.json({ ...result, checked_at: new Date().toISOString() })
}
