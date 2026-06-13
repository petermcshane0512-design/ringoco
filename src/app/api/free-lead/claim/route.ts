import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * GET /api/free-lead/claim?b={biz_id}
 *
 * Reveals the pre-pulled free lead for a cold-email prospect.
 * Reads from prospect_free_leads (nightly pre-pull script populates it
 * for every outreach target before send).
 *
 * Stamps claimed_at on first call so we can attribute clicks → signups
 * in Stripe webhook.
 *
 * NOT auth-gated — public URL is the whole point. Rate-limited via
 * Vercel/Next defaults. biz_id is opaque enough (UUID slice or biz slug)
 * that random enumeration won't reveal arbitrary leads.
 *
 * Returns 200 + lead JSON on hit. 404 on miss. Never blocks — landing
 * page handles both gracefully.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const bizId = (url.searchParams.get('b') || '').slice(0, 64)
  if (!bizId) return NextResponse.json({ ok: false, error: 'b required' }, { status: 400 })

  const { data, error } = await supabase
    .from('prospect_free_leads')
    .select('*')
    .eq('biz_id', bizId)
    .maybeSingle()

  if (error) {
    console.warn(`[free-lead/claim] db err for biz_id=${bizId}: ${error.message}`)
    return NextResponse.json({ ok: false, error: 'lookup failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: 'no lead found for this prospect' }, { status: 404 })
  }

  // Stamp claimed_at on first reveal. Don't bump on repeats — preserves
  // attribution to the first touch.
  if (!data.claimed_at) {
    try {
      await supabase
        .from('prospect_free_leads')
        .update({ claimed_at: new Date().toISOString() })
        .eq('biz_id', bizId)
    } catch { /* non-fatal */ }
  }

  // 2026-06-13 — expose prospect-side context (city / trade / visit_count /
  // last_visited_at) so the /free-lead idle state can render personalized
  // copy ("a Dallas homeowner who needs HVAC work") instead of the generic
  // "one homeowner in your service area" + a return-visit variant when the
  // prospect has clicked before. Higher curiosity gap = more Generate
  // presses = more conversions on the cold-email send hitting right now.
  return NextResponse.json({
    ok: true,
    prospect: {
      city: data.city || '',
      state: data.state || '',
      trade: data.trade || '',
      business_name: data.business_name || '',
      visit_count: Number(data.visit_count ?? 0),
      last_visited_at: data.last_visited_at || null,
    },
    lead: {
      owner: data.lead_owner_name,
      street: data.lead_street,
      city: data.city,
      state: data.state,
      zip: data.zip,
      phone: data.lead_phone,
      email: data.lead_email,
      year_built: data.lead_year_built,
      value: data.lead_value,
      signal: data.lead_signal,
      signal_detail: data.lead_signal_detail,
      est_job_min: data.lead_est_job_min,
      est_job_max: data.lead_est_job_max,
      trade: data.trade,
    },
  })
}
