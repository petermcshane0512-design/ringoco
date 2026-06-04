import { NextRequest, NextResponse } from 'next/server'
import { scrapeCityPermits } from '@/lib/permitScraper'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/scrape-permits-austin
 *
 * City of Austin Building Permits.
 * Source: data.austintexas.gov resource 3syk-w9eu
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
  const result = await scrapeCityPermits({
    cityLabel: 'Austin TX',
    socrataUrl: 'https://data.austintexas.gov/resource/3syk-w9eu.json',
    fields: {
      issueDate: 'issue_date',
      workDescription: 'description',
      permitType: 'permit_type_desc',
      cost: 'total_job_valuation',
      fullAddress: 'original_address1',
      zip: 'original_zip',
      contractorPhone: 'contractor_phone',
    },
  }, {
    lookbackDays: parseInt(url.searchParams.get('days') ?? '14', 10),
    limit: parseInt(url.searchParams.get('limit') ?? '500', 10),
  })

  return NextResponse.json({ ...result, checked_at: new Date().toISOString() })
}
