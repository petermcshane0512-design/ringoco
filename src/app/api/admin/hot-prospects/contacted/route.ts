import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * POST /api/admin/hot-prospects/contacted
 * Body: { id: string, action: 'dialed' | 'texted' | 'demo_booked' | 'paid', notes?: string }
 *
 * One-tap action on the hot-prospects dashboard. Stamps the right
 * column on outreach_leads so the row drops out of the default
 * dial list.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const VALID_ACTIONS = ['dialed', 'texted', 'demo_booked', 'paid'] as const
type Action = (typeof VALID_ACTIONS)[number]

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: { id?: string; action?: string; notes?: string; outcome?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const id = body.id?.trim()
  const action = body.action as Action | undefined
  if (!id || !action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'id + valid action required' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }
  if (action === 'dialed') {
    updates.call_attempted_at = now
    if (body.outcome) updates.call_outcome = body.outcome.slice(0, 80)
    if (body.notes) updates.call_notes = body.notes.slice(0, 500)
  } else if (action === 'texted') {
    updates.text_sent_at = now
  } else if (action === 'demo_booked') {
    updates.demo_booked_at = now
    updates.status = 'demo_booked'
  } else if (action === 'paid') {
    updates.paid_at = now
    updates.status = 'paid'
  }

  const { error } = await supabase
    .from('outreach_leads')
    .update(updates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
