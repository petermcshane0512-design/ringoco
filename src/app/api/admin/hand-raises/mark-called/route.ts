import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_OUTCOMES = new Set(['answered', 'voicemail', 'no_answer', 'not_interested', 'demo_booked'])

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  let body: { outreach_id?: string; outcome?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  if (!body.outreach_id || !body.outcome) return NextResponse.json({ error: 'outreach_id + outcome required' }, { status: 400 })
  if (!ALLOWED_OUTCOMES.has(body.outcome)) return NextResponse.json({ error: 'bad outcome' }, { status: 400 })
  const { error } = await supabase
    .from('outreach_leads')
    .update({
      call_attempted_at: new Date().toISOString(),
      call_outcome: body.outcome,
    })
    .eq('id', body.outreach_id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
