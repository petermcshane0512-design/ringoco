import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/young-conversion-stats
 *
 * Learning loop. Shows per-bucket conversion of young_owner_score to:
 *   - open_count > 0 (engaged)
 *   - report_visit_at IS NOT NULL (clicked report)
 *   - demo_booked_at (booked demo)
 *   - paid_at (paying customer)
 *
 * Drives scoring tuning. If 60+ bucket converts 5x better than 40-59
 * bucket → raise the algorithm bias on signals that move scores into 60+.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const { data, error } = await supabase.rpc('young_conversion_stats')
  if (error) {
    // RPC not yet defined — fall back to inline query
    const { data: rows, error: e2 } = await supabase
      .from('outreach_leads')
      .select('young_owner_score, open_count, report_visit_at, demo_booked_at, paid_at, text_response_at, status')
      .not('young_owner_score', 'is', null)

    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

    type Lead = {
      young_owner_score: number | null
      open_count: number | null
      report_visit_at: string | null
      demo_booked_at: string | null
      paid_at: string | null
      text_response_at: string | null
      status: string | null
    }

    const buckets = [
      { label: 'cold (<30)', min: 0, max: 29 },
      { label: 'low (30-39)', min: 30, max: 39 },
      { label: 'warm (40-49)', min: 40, max: 49 },
      { label: 'warm+ (50-59)', min: 50, max: 59 },
      { label: 'hot (60-74)', min: 60, max: 74 },
      { label: 'blazing (75+)', min: 75, max: 100 },
    ].map((b) => ({ ...b, count: 0, opened: 0, clicked_report: 0, replied: 0, demo_booked: 0, paid: 0 }))

    for (const l of (rows ?? []) as Lead[]) {
      const s = l.young_owner_score ?? 0
      const bucket = buckets.find((b) => s >= b.min && s <= b.max)
      if (!bucket) continue
      bucket.count++
      if ((l.open_count ?? 0) > 0) bucket.opened++
      if (l.report_visit_at) bucket.clicked_report++
      if (l.text_response_at) bucket.replied++
      if (l.demo_booked_at) bucket.demo_booked++
      if (l.paid_at) bucket.paid++
    }

    const ratios = buckets.map((b) => ({
      ...b,
      open_rate: b.count > 0 ? +(b.opened / b.count * 100).toFixed(2) : 0,
      click_rate: b.count > 0 ? +(b.clicked_report / b.count * 100).toFixed(2) : 0,
      reply_rate: b.count > 0 ? +(b.replied / b.count * 100).toFixed(2) : 0,
      demo_rate: b.count > 0 ? +(b.demo_booked / b.count * 100).toFixed(2) : 0,
      paid_rate: b.count > 0 ? +(b.paid / b.count * 100).toFixed(2) : 0,
    }))

    return NextResponse.json({
      ok: true,
      total_scored: (rows ?? []).length,
      buckets: ratios,
      learnings: deriveLearnings(ratios),
    })
  }

  return NextResponse.json({ ok: true, data })
}

function deriveLearnings(buckets: Array<{ label: string; count: number; paid_rate: number; click_rate: number }>): string[] {
  const out: string[] = []
  const hot = buckets.find((b) => b.label.startsWith('hot'))
  const cold = buckets.find((b) => b.label.startsWith('cold'))
  if (hot && cold && hot.count > 5 && cold.count > 5) {
    const lift = cold.paid_rate > 0 ? (hot.paid_rate / cold.paid_rate).toFixed(1) : '∞'
    out.push(`Hot bucket converts ${lift}x better than cold by paid_rate`)
  }
  const blazing = buckets.find((b) => b.label.startsWith('blazing'))
  if (blazing && blazing.count > 0 && blazing.click_rate < 5) {
    out.push(`⚠️ Blazing bucket has low click rate (${blazing.click_rate}%) — possible over-scoring`)
  }
  if (hot && hot.count > 50 && hot.paid_rate === 0) {
    out.push(`⚠️ 50+ hot leads, 0 paid — algorithm needs tuning OR send copy ineffective`)
  }
  return out
}
