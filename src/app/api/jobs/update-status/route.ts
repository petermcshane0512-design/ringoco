import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const VALID = new Set(['pending', 'scheduled', 'completed', 'cancelled'])

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status } = await req.json().catch(() => ({})) as { id?: string; status?: string }
  if (!id || !status || !VALID.has(status)) {
    return NextResponse.json({ error: 'Invalid id or status' }, { status: 400 })
  }

  // Double-filter: id AND user_id — prevents tenant A from updating tenant B's job by guessing id.
  // Also auto-stamp completed_at when transitioning to 'completed' so the review-requests
  // cron picks up the job 4h later for the Google review SMS.
  const update: Record<string, unknown> = { status }
  if (status === 'completed') update.completed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('jobs')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job: data })
}
