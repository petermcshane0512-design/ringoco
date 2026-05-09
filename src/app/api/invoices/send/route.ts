import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { customer_name, customer_email, customer_phone, service_type, amount } = await req.json()

  if (!customer_name || !service_type || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const parsedAmount = parseFloat(amount)
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
  }

  // Get contractor's Twilio number for sending SMS from correct number
  const { data: profile } = await supabase
    .from('profiles')
    .select('twilio_number, business_name')
    .eq('user_id', userId)
    .single()

  const fromNumber = profile?.twilio_number || process.env.TWILIO_PHONE_NUMBER!
  const businessName = profile?.business_name || 'BellAveGo'

  try {
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(parsedAmount * 100),
      product_data: { name: service_type },
    })

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { customer_name, customer_phone: customer_phone || '', customer_email: customer_email || '' },
    })

    const { data: invoice, error } = await supabase.from('invoices').insert({
      user_id: userId,
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      service_type,
      amount: parsedAmount,
      status: 'sent',
      stripe_url: paymentLink.url,
    }).select().single()

    if (error) throw error

    if (customer_phone) {
      await twilioClient.messages.create({
        body: `Hi ${customer_name}, you have an invoice for ${service_type} — $${parsedAmount.toFixed(2)}. Pay securely here: ${paymentLink.url} — ${businessName}`,
        from: fromNumber,
        to: customer_phone,
      })
    }

    return NextResponse.json({ ok: true, invoice })
  } catch (err: any) {
    console.error('Invoice error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
