import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * PATCH /api/admin/ig-creators/[id]
 * Body: any subset of: status, notes, followers, trade, reply_summary,
 *       paid_referrals_count, posts_count, free_trial_started_at, etc.
 *
 * Auto-stamps timestamps when status flips:
 *   - status → 'dmed'           → dmed_at = now() (if null)
 *   - status → 'replied_yes/no' → replied_at = now() (if null)
 *   - status → 'active_creator' → free_trial_started_at = now() (if null)
 *   - status → 'paid_bonus_hit' → bonus_paid_at = now() (if null)
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const VALID_STATUS = ['saved', 'dmed', 'replied_yes', 'replied_no', 'active_creator', 'paid_bonus_hit', 'dropped']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  // Whitelist editable columns
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const editable = [
    'status', 'notes', 'followers', 'trade', 'hashtag_source',
    'reply_summary', 'paid_referrals_count', 'posts_count',
    'free_trial_started_at', 'first_post_at', 'total_commission_paid_cents',
  ]
  for (const k of editable) {
    if (body[k] !== undefined) updates[k] = body[k]
  }

  // Validate status
  if (updates.status && !VALID_STATUS.includes(updates.status as string)) {
    return NextResponse.json({ error: `invalid status. Valid: ${VALID_STATUS.join(',')}` }, { status: 400 })
  }

  // Pull current row to compare for auto-stamping
  const { data: current } = await supabase
    .from('ig_creator_outreach')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const now = new Date().toISOString()
  if (updates.status === 'dmed' && !current.dmed_at) updates.dmed_at = now
  if ((updates.status === 'replied_yes' || updates.status === 'replied_no') && !current.replied_at) updates.replied_at = now
  if (updates.status === 'active_creator' && !current.free_trial_started_at) updates.free_trial_started_at = now
  if (updates.status === 'paid_bonus_hit' && !current.bonus_paid_at) updates.bonus_paid_at = now

  const { data, error } = await supabase
    .from('ig_creator_outreach')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, creator: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { id } = await params
  const { error } = await supabase.from('ig_creator_outreach').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
