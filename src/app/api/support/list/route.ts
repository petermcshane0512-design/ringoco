import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { effectiveAuth } from '@/lib/effectiveAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, category, status, priority, ai_summary, thread, created_at, updated_at, resolved_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data ?? [] })
}
