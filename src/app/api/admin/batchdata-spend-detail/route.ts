import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/admin/batchdata-spend-detail — itemize today's BatchData spend so
 * we can tell REAL free-lead clicks from test/dev traffic (2026-06-15). Each
 * spend row carries the biz_id + zip/city/state it was generated for.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('batchdata_spend_log')
    .select('cost_cents, caller, context, spent_at, result_ok')
    .gte('spent_at', dayStart.toISOString())
    .order('spent_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (data ?? []) as Array<{ cost_cents: number | null; caller: string | null; context: Record<string, unknown> | null; spent_at: string; result_ok: boolean | null }>
  const total = rows.reduce((s, r) => s + (r.cost_cents ?? 0), 0) / 100
  const byCaller: Record<string, { count: number; cents: number }> = {}
  for (const r of rows) {
    const k = r.caller ?? 'unknown'
    byCaller[k] = byCaller[k] || { count: 0, cents: 0 }
    byCaller[k].count++; byCaller[k].cents += r.cost_cents ?? 0
  }

  return NextResponse.json({
    today_total_usd: total,
    count: rows.length,
    by_caller: Object.fromEntries(Object.entries(byCaller).map(([k, v]) => [k, { count: v.count, usd: v.cents / 100 }])),
    items: rows.map((r) => ({
      at: r.spent_at,
      usd: (r.cost_cents ?? 0) / 100,
      caller: r.caller,
      result_ok: r.result_ok,
      biz_id: r.context?.biz_id ?? null,
      where: [r.context?.city, r.context?.state, r.context?.zip].filter(Boolean).join(' '),
      results: r.context?.result_count ?? null,
    })),
  })
}
