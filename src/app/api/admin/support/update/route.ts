import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { requireAdmin } from '@/lib/auth/requireAdmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const VALID_STATUS = new Set(['new', 'triaged', 'in_progress', 'resolved', 'closed'])

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const { id, status, reply } = (await req.json().catch(() => ({}))) as {
    id?: string
    status?: string
    reply?: string
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status && VALID_STATUS.has(status)) {
    update.status = status
    if (status === 'resolved' || status === 'closed') {
      update.resolved_at = new Date().toISOString()
    }
  }

  // Append reply to thread if provided
  if (reply && reply.trim()) {
    const { data: existing } = await supabase
      .from('support_tickets')
      .select('thread, user_id')
      .eq('id', id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'ticket not found' }, { status: 404 })
    const thread = Array.isArray(existing.thread) ? existing.thread : []
    thread.push({ from: 'peter', body: reply.trim(), at: new Date().toISOString() })
    update.thread = thread

    // SMS the customer that Peter replied (best-effort)
    try {
      const { data: customer } = await supabase
        .from('profiles')
        .select('owner_phone, twilio_number')
        .eq('user_id', existing.user_id)
        .maybeSingle()
      if (customer?.owner_phone) {
        await twilioClient.messages.create({
          body: `BellAveGo support reply from Peter:\n\n${reply.slice(0, 240)}${reply.length > 240 ? '…' : ''}\n\nFull thread: https://www.bellavego.com/dashboard/support/${id}`,
          from: customer.twilio_number ?? process.env.TWILIO_PHONE_NUMBER!,
          to: customer.owner_phone,
        })
      }
    } catch (e) {
      console.error('[admin/support] customer reply SMS failed:', e)
    }
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ticket: data })
}
