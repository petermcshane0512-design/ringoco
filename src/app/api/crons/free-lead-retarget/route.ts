import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/crons/free-lead-retarget
 *
 * Returns prospects who clicked the free-lead landing BUT didn't sign up
 * within 4 hours. Per Hormozi $100M Leads: "4-hour window is when intent
 * decays from warm to cold — re-engage before they forget the lead."
 *
 * Designed to be called by Vercel Cron every hour AND by Peter ad-hoc
 * via Instantly's API integration. Two output modes:
 *   1. JSON list (default) — easy to pipe to a script that fires
 *      Instantly follow-up emails
 *   2. mode=mark — also stamps retargeted_at + bumps retarget_count
 *      (use this when actually firing the send so we don't double-touch)
 *
 * Filter logic:
 *   - claimed_at NOT NULL (they actually opened the lead)
 *   - signed_up_at NULL (haven't converted)
 *   - claimed_at < now - 4 hours (intent decay window passed)
 *   - retarget_count < 3 (Hormozi cap: 3 touches before annoying)
 *   - retargeted_at NULL OR retargeted_at < now - 24h (no spam)
 *
 * Auth: admin-secret header OR Clerk admin session.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const RETARGET_CAP = 3

export async function GET(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') || 'list'
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') || '200', 10))

  const fourHoursAgo = new Date(Date.now() - FOUR_HOURS_MS).toISOString()
  const twentyFourHoursAgo = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString()

  // Hand-rolled query — Supabase v2 doesn't support OR-with-NULL-check cleanly.
  // Pull anything claimed > 4h ago + retarget_count < cap + signed_up_at NULL,
  // then filter the "never retargeted OR retargeted > 24h ago" branch in code.
  const { data, error } = await supabase
    .from('prospect_free_leads')
    .select('biz_id, email, zip, city, state, trade, lead_owner_name, lead_signal, lead_signal_detail, lead_est_job_min, lead_est_job_max, claimed_at, retargeted_at, retarget_count')
    .is('signed_up_at', null)
    .not('claimed_at', 'is', null)
    .lte('claimed_at', fourHoursAgo)
    .lt('retarget_count', RETARGET_CAP)
    .limit(limit)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  type Row = {
    biz_id: string
    email: string | null
    zip: string | null
    city: string | null
    state: string | null
    trade: string | null
    lead_owner_name: string | null
    lead_signal: string | null
    lead_signal_detail: string | null
    lead_est_job_min: number | null
    lead_est_job_max: number | null
    claimed_at: string
    retargeted_at: string | null
    retarget_count: number | null
  }
  const eligible = (data || []).filter((r) => {
    const row = r as Row
    if (!row.retargeted_at) return true
    return new Date(row.retargeted_at).getTime() < Date.now() - TWENTY_FOUR_HOURS_MS
  }) as Row[]

  const hoursSinceClaim = (ts: string) => Math.round((Date.now() - new Date(ts).getTime()) / (60 * 60 * 1000))

  const rows = eligible.map((r) => {
    const previous = r.retarget_count ?? 0
    const subject = previous === 0
      ? `${r.lead_owner_name || 'Your lead'} in ${r.zip || 'your area'} — still on the table`
      : previous === 1
        ? `last call — ${r.lead_owner_name || 'this lead'} unlocks at midnight`
        : `closing your ${r.zip || 'area'} slot tonight`
    const body = previous === 0
      ? `Saw you opened the lead I pulled for you in ${r.zip || 'your area'} ${hoursSinceClaim(r.claimed_at)}h ago.\n\nIt's still attached to your email — yours regardless. But to LOCK ${r.zip || 'your area'} as the one shop we send leads to every Monday, takes 90 seconds:\n\nbellavego.com/start?promo=FIRST400&b=${r.biz_id}\n\n40 leads in your area for $97 — ${r.trade || 'in your trade'}. Cancel anytime.\n\n— Peter`
      : previous === 1
        ? `${r.lead_owner_name || 'The homeowner'} in ${r.zip} is still cold. 24h until I release ${r.zip} to the next shop on the waitlist.\n\nLock yours for $97: bellavego.com/start?promo=FIRST400&b=${r.biz_id}\n\n— Peter`
        : `Last touch. ${r.zip} territory closes tonight if you don't claim it. $97 first month, 40 leads, refund + free month 2 if I don't book you a job: bellavego.com/start?promo=FIRST400&b=${r.biz_id}\n\n— Peter`

    return {
      biz_id: r.biz_id,
      email: r.email,
      previous_touches: previous,
      hours_since_claim: hoursSinceClaim(r.claimed_at),
      subject,
      body,
    }
  })

  // mode=mark: actually stamp retargeted_at + bump count.
  // Returns the SAME rows so the caller can fire emails AND we move state forward atomically.
  let marked = 0
  if (mode === 'mark' && rows.length > 0) {
    const bizIds = rows.map((r) => r.biz_id)
    const updates = eligible.map((r) => ({
      biz_id: r.biz_id,
      retargeted_at: new Date().toISOString(),
      retarget_count: (r.retarget_count ?? 0) + 1,
    }))
    // Upsert on biz_id to update specifically. Supabase v2: per-row update via loop (no batch update by primary key in single call).
    for (const u of updates) {
      const { error: upErr } = await supabase
        .from('prospect_free_leads')
        .update({ retargeted_at: u.retargeted_at, retarget_count: u.retarget_count })
        .eq('biz_id', u.biz_id)
      if (!upErr) marked++
    }
    // Log retarget batch identifier so we can audit if Peter complains about double-sends
    console.log(`[free-lead-retarget] marked ${marked}/${rows.length} for retargeting (biz_ids head: ${bizIds.slice(0, 3).join(',')})`)
  }

  return NextResponse.json({
    ok: true,
    mode,
    eligible_count: rows.length,
    marked,
    rows,
  })
}
