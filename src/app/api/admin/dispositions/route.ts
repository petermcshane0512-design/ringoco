import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * POST /api/admin/dispositions — record a call-queue disposition
 * (2026-06-12, CEO Nucleus). Body: { email, action, notes? }.
 * Actions: called | voicemail | no_answer | bad_number | booked_call.
 * Dispositioned prospects drop out of the queue; no_answer re-surfaces
 * after 24h (queue-side logic). Table: sql/2026-06-12-lead-dispositions.sql.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ACTIONS = new Set(['called', 'voicemail', 'no_answer', 'bad_number', 'booked_call'])

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  let body: { email?: string; action?: string; notes?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const email = (body.email || '').toLowerCase().trim()
  const action = (body.action || '').toLowerCase().trim()
  if (!email || !ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: 'email + valid action required' }, { status: 400 })
  }
  const { error } = await supabase.from('lead_dispositions').insert({
    email, action, notes: (body.notes || '').slice(0, 500) || null,
  })
  if (error) {
    // Pre-migration (table missing) or transient — surface it honestly.
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
