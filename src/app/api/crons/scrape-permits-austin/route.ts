import { NextRequest, NextResponse } from 'next/server'
import { scrapeCityPermits } from '@/lib/permitScraper'
import { classifyCronAuth, recordCronStart, recordCronFinish } from '@/lib/cronRuns'

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
  const startedAtMs = Date.now()
  const mode = classifyCronAuth(req, process.env.ADMIN_API_SECRET)
  const cronRunId = await recordCronStart('scrape-permits-austin', mode)
  if (mode === 'unauthorized') {
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

  await recordCronFinish(cronRunId, result.ok !== false, result as unknown as Record<string, unknown>, startedAtMs)
  return NextResponse.json({ ...result, checked_at: new Date().toISOString() })
}
