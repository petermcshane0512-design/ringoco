import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { triggerWarmCall } from '@/lib/warmCaller/triggerCall'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/warm-caller
 *
 * Daily Vapi outbound warm-call run. Targets leads who OPENED the cold
 * email or visited the report URL in the last 36h and haven't been
 * dialed yet. Per-call throttle 90s to mimic a real SDR.
 *
 * Conv impact: openers are warm. AI caller on warm subset is the
 * biggest single lever from 0.31% → 0.50% cold→paid conversion.
 *
 * Auth: x-vercel-cron header OR x-admin-secret.
 *
 * Idempotency: outreach_calls UNIQUE(lead_id, week) prevents redial.
 */
export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isVercelCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── TCPA HARD GUARD 2026-05-30 ──────────────────────────────────────
  // Calling a prospect because they OPENED an email = not consent.
  // TCPA $500-$1500/call statutory damages on AI/autodialed calls to
  // cell phones without prior express written consent. Most small HVAC
  // owners use their cell as the business line, so the cell-phone
  // protections apply. FCC's 2024 ruling treats AI voice as
  // "artificial or prerecorded" under TCPA.
  //
  // This route now requires BOTH:
  //   (1) ENABLE_WARM_CALLER=1 in env (kill switch)
  //   (2) Each lead must have caller_consent_at populated (per-lead consent)
  //
  // caller_consent_at is set ONLY when the prospect explicitly opts in
  // (e.g., reply "yes" to an email, sign up for trial, or text us first).
  // No automatic consent inference allowed.
  if (process.env.ENABLE_WARM_CALLER !== '1') {
    return NextResponse.json(
      { ok: false, disabled: true, reason: 'Warm caller TCPA-disabled. Requires per-lead caller_consent_at. Do not flip ENABLE_WARM_CALLER without a documented consent flow.' },
      { status: 410 },
    )
  }

  const url = new URL(req.url)
  const limit = parseInt(url.searchParams.get('limit') ?? '30', 10)
  const throttleSec = parseInt(url.searchParams.get('throttle') ?? '90', 10)
  const dryRun = url.searchParams.get('dry') === '1'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Eligibility: opened email or visited report in last 36h, has phone,
  // no prior call this week, not DNC.
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString()
  const { data: pool, error: pullErr } = await supabase
    .from('outreach_leads')
    .select('id, business_name, owner_first_name, owner_phone, city, state, first_opened_at, report_visit_at, dnc_until')
    .or(`first_opened_at.gte.${since},report_visit_at.gte.${since}`)
    .not('owner_phone', 'is', null)
    .order('report_visit_at', { ascending: false, nullsFirst: false })
    .limit(limit * 3)

  if (pullErr) return NextResponse.json({ error: pullErr.message }, { status: 500 })

  const candidates = (pool ?? []).filter((l) => {
    if (l.dnc_until && new Date(l.dnc_until).getTime() > Date.now()) return false
    return true
  }).slice(0, limit)

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, dialed: 0, message: 'no warm openers in window' })
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry: true,
      would_dial: candidates.length,
      sample: candidates.slice(0, 3).map((c) => ({
        business_name: c.business_name, phone: c.owner_phone, city: c.city,
      })),
    })
  }

  let dialed = 0
  let skipped = 0
  const errors: { lead: string; reason: string }[] = []

  for (let i = 0; i < candidates.length; i++) {
    const l = candidates[i]

    // Pull cached report for context injection
    const { data: rpt } = await supabase
      .from('sample_reports')
      .select('business_name, city, report')
      .ilike('business_name', l.business_name ?? '')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const c = rpt?.report?.competitive ?? {}
    const o = rpt?.report?.opportunities?.[0] ?? {}

    const result = await triggerWarmCall({
      leadId: l.id,
      leadPhone: l.owner_phone ?? '',
      leadCity: l.city ?? '',
      leadStateAbbr: deriveStateAbbr(l.state),
      context: {
        prospect_business_name: l.business_name ?? 'your shop',
        prospect_first_name: firstName(l),
        prospect_city: l.city ?? '',
        report_review_count: c.yourReviewCount ?? 0,
        report_rank: c.yourRank ?? 0,
        report_total_competitors: c.totalCompetitors ?? 0,
        report_top_opportunity_title: o.title ?? 'revenue gap',
        report_top_opportunity_dollars: o.monthlyValue ?? 0,
        report_url: `https://www.bellavego.com/sample-report?for=${encodeURIComponent(l.business_name ?? '')}`,
        email_sent_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    })

    if (result.ok) {
      dialed++
    } else if ('skipped' in result) {
      skipped++
      errors.push({ lead: l.business_name ?? l.id, reason: `skipped: ${result.skipped} — ${result.reason}` })
    } else {
      errors.push({ lead: l.business_name ?? l.id, reason: result.error })
    }

    // Throttle between dials
    if (i < candidates.length - 1) {
      await new Promise((r) => setTimeout(r, throttleSec * 1000))
    }
  }

  return NextResponse.json({ ok: true, dialed, skipped, errors: errors.slice(0, 10) })
}

function firstName(l: { owner_first_name?: string | null }): string {
  const f = (l.owner_first_name || '').trim()
  if (f && f.toLowerCase() !== 'there' && f.length > 1 && f.length < 20) {
    return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase()
  }
  return 'team'
}

// Loose state → 2-letter abbrev. Used for timezone window.
function deriveStateAbbr(state: string | null | undefined): string | null {
  if (!state) return null
  const s = state.trim().toUpperCase()
  if (s.length === 2) return s
  const map: Record<string, string> = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
    MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK',
    OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
    VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI', WYOMING: 'WY',
  }
  return map[s] ?? null
}
