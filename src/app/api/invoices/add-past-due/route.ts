import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { OFFICE_MGR_TIERS } from '@/lib/pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * AI Collections — capture a past-due invoice.
 * Schedules SMS chase cadence: day 2, day 7, day 14, day 30 with a Stripe Payment Link.
 * Tier-gated to Office Manager + Concierge.
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
    return NextResponse.json({ error: 'AI Collections requires Operator tier or above.' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    customerName?: string
    customerPhone?: string
    customerEmail?: string
    invoiceAmount?: number
    invoiceDescription?: string
    dueDate?: string
    stripePaymentLink?: string
  }

  if (!body.customerPhone || !body.invoiceAmount) {
    return NextResponse.json({ error: 'customerPhone and invoiceAmount required' }, { status: 400 })
  }

  const nextChaseAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase.from('invoice_followups').insert({
    user_id: userId,
    customer_name: body.customerName,
    customer_phone: body.customerPhone,
    customer_email: body.customerEmail,
    invoice_amount: body.invoiceAmount,
    invoice_description: body.invoiceDescription,
    due_date: body.dueDate,
    stripe_payment_link: body.stripePaymentLink,
    next_chase_at: nextChaseAt,
    source: 'manual',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, invoice: data })
}
