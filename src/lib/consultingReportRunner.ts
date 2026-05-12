import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { generateReportPdf, type ReportInput } from './generateReport'
import { pullInternalMetrics, pullMarketContext, computeBellaveGoScore } from './consultingMetrics'
import { generateReportNarrative } from './generateReportNarrative'
import { cadenceDaysForTier, periodLabel } from './reportCadence'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

export type RunnerProfile = {
  user_id: string
  business_name?: string | null
  business_type?: string | null
  owner_phone?: string | null
  owner_first_name?: string | null
  twilio_number?: string | null
  service_area?: string | null
  zip_code?: string | null
  google_place_id?: string | null
  plan_tier?: string | null
  is_active?: boolean | null
  welcome_report_at?: string | null
  last_consulting_report_at?: string | null
}

export type RunOutcome = {
  user_id: string
  status: 'generated' | 'skipped' | 'error'
  reportType?: 'welcome' | 'periodic'
  reportId?: string
  pdfUrl?: string
  reason?: string
}

/**
 * Generate ONE consulting report end-to-end for a single contractor:
 *   1. Pull internal metrics (call_logs + jobs over cadence window)
 *   2. Pull local market context (Google Places, optional)
 *   3. Compute BellAveGo Score
 *   4. Call Claude Sonnet to write the opportunity + outlook narrative
 *   5. Render PDF via @react-pdf/renderer
 *   6. Upload PDF to Supabase Storage (bucket: consulting-reports)
 *   7. Insert row into consulting_reports
 *   8. Update profiles.last_consulting_report_at (and welcome_report_at if first)
 *   9. SMS contractor with download link
 *
 * Idempotency: caller decides whether the customer is due (via reportDue() from
 * lib/reportCadence). This function trusts the call and always generates.
 */
export async function generateAndDeliverReport(
  profile: RunnerProfile,
  reportType: 'welcome' | 'periodic',
): Promise<RunOutcome> {
  const userId = profile.user_id
  const businessName = profile.business_name || 'Your Business'
  const businessType = profile.business_type || 'home services'
  const serviceArea = profile.service_area || profile.zip_code || 'your local area'
  const firstName = profile.owner_first_name || splitFirstName(businessName)

  const cadenceDays = cadenceDaysForTier(profile.plan_tier) ?? 90
  // For welcome reports we use a 30-day lookback even though there's no data —
  // keeps the period_label sensible.
  const lookbackDays = reportType === 'welcome' ? 30 : cadenceDays

  let metrics: ReportInput['metrics']
  let market: ReportInput['market']
  try {
    metrics = await pullInternalMetrics(userId, lookbackDays)
    market = await pullMarketContext(profile)
  } catch (e) {
    return { user_id: userId, status: 'error', reason: `metrics: ${(e as Error).message}` }
  }

  const score = computeBellaveGoScore(metrics)

  let narrative
  try {
    narrative = await generateReportNarrative({
      businessName,
      businessType,
      serviceArea,
      reportType,
      metrics,
      market,
      bellaveGoScore: score,
    })
  } catch (e) {
    return { user_id: userId, status: 'error', reason: `narrative: ${(e as Error).message}` }
  }

  const windowEnd = new Date()
  const reportInput: ReportInput = {
    businessName,
    reportTitle:
      reportType === 'welcome'
        ? 'Welcome — Your First BellAveGo Report'
        : `${quarterLabel(windowEnd)} Performance Report`,
    periodLabel: periodLabel({ reportType, planTier: profile.plan_tier, windowEnd }),
    generatedFor: firstName,
    serviceArea,
    metrics,
    market,
    bellaveGoScore: score,
    opportunity: narrative.opportunity,
    nextQuarter: narrative.nextQuarter,
  }

  // 5. Render PDF
  let pdfBuffer: Buffer
  try {
    pdfBuffer = await generateReportPdf(reportInput)
  } catch (e) {
    return { user_id: userId, status: 'error', reason: `pdf: ${(e as Error).message}` }
  }

  // 6. Upload to Storage
  const reportId = crypto.randomUUID()
  const filePath = `${userId}/${reportId}.pdf`
  const { error: uploadErr } = await supabase
    .storage
    .from('consulting-reports')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false })
  if (uploadErr) {
    return { user_id: userId, status: 'error', reason: `upload: ${uploadErr.message}` }
  }
  const { data: pub } = supabase.storage.from('consulting-reports').getPublicUrl(filePath)
  const pdfUrl = pub.publicUrl

  // 7. Insert DB row
  const { error: insertErr } = await supabase.from('consulting_reports').insert({
    id: reportId,
    user_id: userId,
    profile_id: userId,
    title: reportInput.reportTitle,
    client_name: businessName,
    period_label: reportInput.periodLabel,
    report_type: reportType,
    cadence_tier: profile.plan_tier ?? null,
    pdf_url: pdfUrl,
    pdf_path: filePath,
    payload: reportInput,
    bellavego_score: score.composite,
    generated_by: 'cron',
  })
  if (insertErr) {
    return { user_id: userId, status: 'error', reason: `db insert: ${insertErr.message}` }
  }

  // 8. Update profile timestamps
  const profileUpdate: Record<string, string> = {
    last_consulting_report_at: new Date().toISOString(),
  }
  if (reportType === 'welcome') {
    profileUpdate.welcome_report_at = new Date().toISOString()
  }
  await supabase.from('profiles').update(profileUpdate).eq('user_id', userId)

  // 9. SMS the contractor
  if (profile.owner_phone) {
    const fromNumber = profile.twilio_number || process.env.TWILIO_PHONE_NUMBER!
    const link = `https://www.bellavego.com/dashboard/reports/${reportId}`
    const body =
      reportType === 'welcome'
        ? `${firstName}, your BellAveGo welcome consulting report is ready. ${narrative.opportunity.estimatedValue} addressable in your market. View: ${link}`
        : `${firstName}, your latest BellAveGo report is ready. ${narrative.opportunity.headline} (~${narrative.opportunity.estimatedValue}). View: ${link}`
    try {
      await twilioClient.messages.create({ body, from: fromNumber, to: profile.owner_phone })
    } catch (e) {
      console.error('report SMS failed:', e)
      // Non-fatal — report still generated
    }
  }

  return { user_id: userId, status: 'generated', reportType, reportId, pdfUrl }
}

function splitFirstName(businessName: string): string {
  // crude: "Smith HVAC" → "Smith". Used only as a fallback for SMS greeting.
  return businessName.split(/\s+/)[0] || 'there'
}

function quarterLabel(d: Date): string {
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
}
