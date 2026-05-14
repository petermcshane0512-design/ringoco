import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { provisionNumberForUser } from '@/lib/provisionNumber'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com'])

/**
 * POST /api/admin/queue/action — single endpoint that handles every action
 * the admin queue page can take. Body: { kind, id, action, payload? }
 *
 *   kind="prompt" action="apply"   — appends suggestion to profile.custom_prompt_notes,
 *                                     marks prompt_suggestions.applied=true.
 *   kind="prompt" action="dismiss" — marks dismissed_at.
 *
 *   kind="review" action="approve" payload.editedReply? — marks approved_at,
 *                                     sets status='approved', SMSes contractor
 *                                     the final reply text to copy/paste into Google.
 *   kind="review" action="dismiss" — marks dismissed_at.
 *
 *   kind="provisioning" action="retry" — runs provisionNumberForUser again.
 *   kind="provisioning" action="dismiss" — marks resolved (e.g. Peter handled manually).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clerkClient } = await import('@clerk/nextjs/server')
  const client = await clerkClient()
  const me = await client.users.getUser(userId)
  const email = me.emailAddresses?.[0]?.emailAddress?.toLowerCase()
  if (!email || !ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { kind, id, action, payload } = (await req.json()) as {
    kind: 'prompt' | 'review' | 'provisioning'
    id: string
    action: string
    payload?: { editedReply?: string }
  }

  if (!kind || !id || !action) {
    return NextResponse.json({ error: 'kind + id + action required' }, { status: 400 })
  }

  if (kind === 'prompt') {
    const { data: row } = await supabase
      .from('prompt_suggestions')
      .select('id, profile_id, suggestion')
      .eq('id', id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

    if (action === 'apply') {
      // Append to existing custom_prompt_notes (preserves prior tuning)
      const { data: profile } = await supabase
        .from('profiles')
        .select('custom_prompt_notes')
        .eq('user_id', row.profile_id)
        .maybeSingle()
      const prior = (profile as { custom_prompt_notes?: string } | null)?.custom_prompt_notes ?? ''
      const updated = prior ? `${prior}\n\n${row.suggestion}` : row.suggestion
      await supabase.from('profiles').update({ custom_prompt_notes: updated }).eq('user_id', row.profile_id)
      await supabase.from('prompt_suggestions').update({ applied: true, applied_at: new Date().toISOString() }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'dismiss') {
      await supabase.from('prompt_suggestions').update({ dismissed_at: new Date().toISOString() }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
  }

  if (kind === 'review') {
    const { data: row } = await supabase
      .from('review_drafts')
      .select('id, user_id, review_author, drafted_reply')
      .eq('id', id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

    if (action === 'approve') {
      const finalReply = payload?.editedReply?.trim() || row.drafted_reply
      await supabase
        .from('review_drafts')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          drafted_reply: finalReply,
        })
        .eq('id', id)

      // SMS the contractor the approved reply so they can paste into Google.
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('owner_phone, twilio_number, business_name')
          .eq('user_id', row.user_id)
          .maybeSingle()
        if (profile?.owner_phone && profile?.twilio_number) {
          await twilioClient.messages.create({
            body: `Approved review reply for ${row.review_author || 'a customer'} — copy/paste into Google:\n\n${finalReply}`,
            from: profile.twilio_number,
            to: profile.owner_phone,
          })
        }
      } catch (e) {
        console.error('approved-reply contractor SMS failed:', e)
      }
      return NextResponse.json({ ok: true })
    }
    if (action === 'dismiss') {
      await supabase
        .from('review_drafts')
        .update({ dismissed_at: new Date().toISOString(), status: 'dismissed' })
        .eq('id', id)
      return NextResponse.json({ ok: true })
    }
  }

  if (kind === 'provisioning') {
    if (action === 'retry') {
      const { data: row } = await supabase
        .from('provisioning_failures')
        .select('id, user_id')
        .eq('id', id)
        .maybeSingle()
      if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

      const result = await provisionNumberForUser(row.user_id).catch((e) => ({ ok: false as const, error: (e as Error).message }))
      if (result.ok) {
        await supabase
          .from('provisioning_failures')
          .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', id)
        return NextResponse.json({ ok: true, phoneNumber: result.phoneNumber })
      }
      await supabase
        .from('provisioning_failures')
        .update({
          last_error: result.error,
          attempts: (await supabase.from('provisioning_failures').select('attempts').eq('id', id).maybeSingle()).data?.attempts ?? 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    }
    if (action === 'dismiss') {
      await supabase
        .from('provisioning_failures')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', id)
      return NextResponse.json({ ok: true })
    }
  }

  return NextResponse.json({ error: 'unknown kind/action' }, { status: 400 })
}
