import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

export const runtime = 'nodejs'

/**
 * POST /api/profile/ai-pause
 *
 * Pauses or resumes the AI receptionist for the calling user's profile.
 *
 * Body:
 *   { paused_until: ISO timestamp | null, mode?: 'forward'|'voicemail'|'silent', reason?: string }
 *
 * Setting paused_until=null resumes the AI immediately. Setting it to a future
 * timestamp pauses until that time. Setting it to year 9999 = "until I turn
 * it back on" (indefinite pause).
 */
export async function POST(req: NextRequest) {
  const a = await auth()
  const userId = a.userId
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const pausedUntil = body?.paused_until === null ? null
    : typeof body?.paused_until === 'string' ? body.paused_until
    : undefined
  if (pausedUntil === undefined) {
    return NextResponse.json({ error: 'paused_until required (ISO string or null)' }, { status: 400 })
  }

  const mode = body?.mode && ['forward', 'voicemail', 'silent'].includes(body.mode) ? body.mode : 'forward'
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 280) : null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data, error } = await supabase
    .from('profiles')
    .update({
      ai_paused_until: pausedUntil,
      ai_pause_mode: mode,
      ai_paused_reason: reason,
    })
    .eq('user_id', userId)
    .select('user_id, ai_paused_until, ai_pause_mode')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'profile not found' }, { status: 404 })

  return NextResponse.json({ ok: true, ai_paused_until: data.ai_paused_until, ai_pause_mode: data.ai_pause_mode })
}

export async function GET() {
  const a = await auth()
  const userId = a.userId
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const { data } = await supabase
    .from('profiles')
    .select('ai_paused_until, ai_pause_mode, ai_paused_reason')
    .eq('user_id', userId)
    .maybeSingle()

  const isPaused = !!data?.ai_paused_until && new Date(data.ai_paused_until) > new Date()
  return NextResponse.json({
    is_paused: isPaused,
    ai_paused_until: data?.ai_paused_until ?? null,
    ai_pause_mode: data?.ai_pause_mode ?? 'forward',
    ai_paused_reason: data?.ai_paused_reason ?? null,
  })
}
