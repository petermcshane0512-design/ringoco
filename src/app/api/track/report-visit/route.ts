import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * POST or GET /api/track/report-visit?l=<lead_id>
 *
 * Fires when a prospect clicks through from a cold email to the
 * personalized sample-report page. Logs report_visit_at + last_opened_at,
 * which becomes the eligibility signal for warm-call qualification (with
 * TCPA consent) and the strongest opener signal for daily-funnel.
 *
 * Returns 204 No Content — fire-and-forget.
 */
export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const leadId = url.searchParams.get('l') || url.searchParams.get('lead_id') || null

  if (!leadId) return new NextResponse(null, { status: 204 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: existing } = await supabase
      .from('outreach_leads')
      .select('report_visit_at, first_opened_at, open_count')
      .eq('id', leadId)
      .maybeSingle()
    if (existing) {
      await supabase
        .from('outreach_leads')
        .update({
          report_visit_at: existing.report_visit_at ?? new Date().toISOString(),
          first_opened_at: existing.first_opened_at ?? new Date().toISOString(),
          last_opened_at: new Date().toISOString(),
          open_count: (existing.open_count ?? 0) + 1,
        })
        .eq('id', leadId)
    }
  } catch (e) {
    console.error('report-visit tracking failed:', e)
  }

  return new NextResponse(null, { status: 204 })
}
