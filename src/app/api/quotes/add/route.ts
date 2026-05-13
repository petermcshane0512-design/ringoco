import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { OFFICE_MGR_TIERS } from '@/lib/pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * AI Quote Hunter — capture a quote sent to a prospect.
 * Schedules an SMS follow-up cadence: day 2, day 7, day 14.
 * Tier-gated to AI Office Manager + Concierge (legacy growth/premium back-compat).
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_tier, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.is_active || !OFFICE_MGR_TIERS.has(profile.plan_tier ?? '')) {
    return NextResponse.json({ error: 'AI Quote Hunter requires AI Office Manager tier or above.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    customerName?: string
    customerPhone?: string
    customerEmail?: string
    quoteAmount?: number
    quoteDescription?: string
  }

  if (!body.customerPhone) {
    return NextResponse.json({ error: 'customerPhone required' }, { status: 400 })
  }

  // First follow-up scheduled for ~48 hours from now.
  const nextFollowupAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase.from('quote_followups').insert({
    user_id: userId,
    customer_name: body.customerName,
    customer_phone: body.customerPhone,
    customer_email: body.customerEmail,
    quote_amount: body.quoteAmount,
    quote_description: body.quoteDescription,
    next_followup_at: nextFollowupAt,
    source: 'manual',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, quote: data })
}
