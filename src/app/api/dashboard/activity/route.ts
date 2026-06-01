import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'

/**
 * Dashboard Activity Feed.
 *
 * Persistent in-app history of every call the AI handled — survives the
 * OS clearing push notifications and the contractor's inbox burying emails.
 *
 * GET  /api/dashboard/activity?limit=20  → most recent N call_logs + unread count
 * POST /api/dashboard/activity?id=<uuid> → mark a single call_log row as viewed
 * POST /api/dashboard/activity?all=1     → mark every unread row viewed (bulk)
 *
 * Tenant-scoped via effectiveAuth() — admin impersonation honored.
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Math.min(
    parseInt(new URL(req.url).searchParams.get('limit') || '20', 10),
    50,
  )

  const [{ data: rows, error: rowsErr }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('call_logs')
      .select('id, call_sid, caller_phone, job_type, job_created, booking_completed, summary, viewed_at, created_at, recording_url')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('viewed_at', null),
  ])

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })

  return NextResponse.json({
    activity: rows ?? [],
    unread: unreadCount ?? 0,
  })
}

/**
 * Mark a call_log row as viewed. Two modes:
 *   ?id=<uuid> — mark a single row
 *   ?all=1     — mark every unread row for this user (bulk dismiss)
 */
export async function POST(req: NextRequest) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const id = params.get('id')
  const all = params.get('all') === '1'

  if (!id && !all) {
    return NextResponse.json({ error: 'pass ?id= or ?all=1' }, { status: 400 })
  }

  if (all) {
    // Bulk: stamp every unread row + bump viewed_count
    const { error } = await supabase
      .from('call_logs')
      .update({ viewed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('viewed_at', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Single row — atomic update + counter increment
  const { data: existing } = await supabase
    .from('call_logs')
    .select('viewed_count')
    .eq('id', id!)
    .eq('user_id', userId)
    .maybeSingle()
  const newCount = ((existing as { viewed_count?: number } | null)?.viewed_count ?? 0) + 1

  const { error } = await supabase
    .from('call_logs')
    .update({
      viewed_at: new Date().toISOString(),
      viewed_count: newCount,
    })
    .eq('id', id!)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, viewed_count: newCount })
}
