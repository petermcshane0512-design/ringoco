import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_FIELDS = new Set([
  'title', 'customer_name', 'customer_phone', 'address', 'job_type',
  'scheduled_time', 'price',
])

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json().catch(() => ({}))
  const body: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_FIELDS.has(k)) body[k] = v
  }

  const { data, error } = await supabase
    .from('jobs')
    .insert({ ...body, user_id: userId, status: 'pending' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ job: data })
}
