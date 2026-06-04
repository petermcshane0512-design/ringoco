import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

/**
 * GET /api/admin/calls/[callSid]
 *
 * Returns a single call_logs row by call_sid (Twilio call SID). Used by
 * /admin/calls/[callSid] to render the call summary + transcript after the
 * demo-line notification is tapped.
 *
 * Side-effect: stamps viewed_at + bumps viewed_count so we can later track
 * notification engagement.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ callSid: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const { callSid } = await params
  if (!callSid) return NextResponse.json({ error: 'callSid required' }, { status: 400 })

  const { data, error } = await supabase
    .from('call_logs')
    .select(
      'id, user_id, caller_phone, caller_name, job_type, transcript, summary, ' +
      'booking_completed, hangup_turn, job_id, created_at, viewed_at, viewed_count, recording_url',
    )
    .eq('call_sid', callSid)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'call not found' }, { status: 404 })

  // Bump viewed counter (fire-and-forget)
  supabase
    .from('call_logs')
    .update({
      viewed_at: (data as { viewed_at?: string | null }).viewed_at ?? new Date().toISOString(),
      viewed_count: ((data as { viewed_count?: number | null }).viewed_count ?? 0) + 1,
    })
    .eq('call_sid', callSid)
    .then(() => {}, () => {})

  return NextResponse.json({ ok: true, call: data })
}
