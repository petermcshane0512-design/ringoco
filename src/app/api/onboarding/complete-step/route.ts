import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Body = {
  step?: number              // advance to this step
  forwardingCarrier?: 'verizon' | 'att' | 'tmobile' | 'sprint' | 'other'
  forwardingConfirmed?: boolean
  crmProvider?: 'jobber' | 'housecallpro' | 'servicetitan' | 'none'
  customPromptNotes?: string
  setupComplete?: boolean
  kickoffScheduled?: boolean
}

/**
 * Generic state-saving endpoint for the setup wizard.
 * Each step in /dashboard/setup posts here to advance state.
 * No big refactor — just a typed dispatch on small profile fields.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body

  const update: Record<string, unknown> = {}
  if (typeof body.step === 'number') update.setup_step = body.step
  if (body.forwardingCarrier) update.forwarding_carrier = body.forwardingCarrier
  if (body.forwardingConfirmed) update.forwarding_confirmed_at = new Date().toISOString()
  if (body.crmProvider) {
    update.crm_provider = body.crmProvider
    if (body.crmProvider !== 'none') update.crm_connected_at = new Date().toISOString()
  }
  if (typeof body.customPromptNotes === 'string') update.custom_prompt_notes = body.customPromptNotes
  if (body.kickoffScheduled) update.kickoff_scheduled_at = new Date().toISOString()
  if (body.setupComplete) update.setup_complete = true

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, noChange: true })
  }

  const { error } = await supabase.from('profiles').update(update).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
