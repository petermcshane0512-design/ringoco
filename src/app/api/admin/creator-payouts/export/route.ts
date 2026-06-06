import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/creator-payouts/export?batch_friday=YYYY-MM-DD
 *
 * Streams a Mercury-ready CSV for a single batch Friday. Peter downloads
 * this, imports into Mercury's bulk ACH UI, and ships the wires in one
 * shot. Each row = one creator's full week of payable refs already
 * collapsed into a single line by the cron.
 *
 * Default (no batch_friday): today.
 *
 * Columns:
 *   recipient_handle    @hvacmike
 *   promo_code          HVACMIKE
 *   amount_usd          200.00
 *   ref_count           1
 *   batch_friday        2026-06-12
 *   notes               BellAveGo creator referral payout, week of ...
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const url = new URL(req.url)
  const batchFriday = url.searchParams.get('batch_friday') || new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('creator_payouts')
    .select('id, creator_id, promo_code, amount_cents, ref_count, batch_friday, paid_at, notes')
    .eq('batch_friday', batchFriday)
    .order('amount_cents', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type PayoutRow = {
    id: number
    creator_id: string | null
    promo_code: string | null
    amount_cents: number
    ref_count: number
    batch_friday: string
    paid_at: string
    notes: string | null
  }
  const rows = (data ?? []) as PayoutRow[]

  // Resolve handles in one round-trip
  const creatorIds = Array.from(new Set(rows.map((r) => r.creator_id).filter((x): x is string => Boolean(x))))
  const handles = new Map<string, string>()
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from('ig_creator_outreach')
      .select('id, handle')
      .in('id', creatorIds)
    type CreatorIdHandle = { id: string; handle: string | null }
    for (const c of (creators ?? []) as CreatorIdHandle[]) {
      handles.set(c.id, c.handle ?? '')
    }
  }

  const header = ['recipient_handle', 'promo_code', 'amount_usd', 'ref_count', 'batch_friday', 'paid_at', 'notes']
  const lines = [header.join(',')]
  for (const r of rows) {
    const handle = (r.creator_id && handles.get(r.creator_id)) || ''
    lines.push([
      csvEscape('@' + handle),
      csvEscape(r.promo_code || ''),
      csvEscape((r.amount_cents / 100).toFixed(2)),
      csvEscape(r.ref_count),
      csvEscape(r.batch_friday),
      csvEscape(r.paid_at),
      csvEscape(r.notes || ''),
    ].join(','))
  }

  const csv = lines.join('\n') + '\n'
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="creator-payouts-${batchFriday}.csv"`,
    },
  })
}
