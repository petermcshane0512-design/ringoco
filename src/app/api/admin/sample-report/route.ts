import { NextResponse } from 'next/server'
import { generateReportPdf, SAMPLE_REPORT } from '@/lib/generateReport'

/**
 * Public sample-report endpoint for sales demos.
 * Visit https://www.bellavego.com/api/admin/sample-report to download
 * the BellAveGo-themed Q2 2026 report for the fictional Smith HVAC profile.
 *
 * Send this PDF to prospects on cold calls / discovery calls — it's the
 * "moat" feature in physical form.
 */
export async function GET() {
  const pdf = await generateReportPdf(SAMPLE_REPORT)
  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="bellavego-sample-report.pdf"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
