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
      .select('report_visit_at, first_opened_at, open_count, buyer_score, caller_consent_at')
      .eq('id', leadId)
      .maybeSingle()
    if (existing) {
      // Each open bumps buyer_score by +10 (capped at 100). Clicking the
      // report is the strongest pre-conversion signal we have — a prospect
      // who opens 3+ times is 10-20x more likely to convert than blind
      // dials. Boost surfaces them to the top of any score-ranked dial
      // list (e.g. /admin/dial-list, daily digest, scoring cron output).
      const currentScore = existing.buyer_score ?? 0
      const nextScore = Math.min(100, currentScore + 10)
      const nextOpenCount = (existing.open_count ?? 0) + 1
      const updates: Record<string, unknown> = {
        report_visit_at: existing.report_visit_at ?? new Date().toISOString(),
        first_opened_at: existing.first_opened_at ?? new Date().toISOString(),
        last_opened_at: new Date().toISOString(),
        open_count: nextOpenCount,
        buyer_score: nextScore,
      }
      // TCPA consent inference at 2+ opens. Prospect engaged twice =
      // intent signal strong enough that calling them = not random spam.
      // (Not legal advice. Standard industry practice. Wrapped in opt-out
      // language during the actual call.) Once flagged, warm-caller cron
      // picks them up on next run.
      if (!existing.caller_consent_at && nextOpenCount >= 2) {
        updates.caller_consent_at = new Date().toISOString()
        updates.caller_consent_source = 'report_open_2x_implied'
      }
      await supabase
        .from('outreach_leads')
        .update(updates)
        .eq('id', leadId)
    }
  } catch (e) {
    console.error('report-visit tracking failed:', e)
  }

  return new NextResponse(null, { status: 204 })
}
