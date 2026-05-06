import { NextRequest, NextResponse } from 'next/server'
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
  const { customer_name, customer_email, customer_phone, service_type, amount } = await req.json()

  try {
    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: Math.round(parseFloat(amount) * 100),
      product_data: {
        name: service_type,
      },
    })

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        customer_name,
        customer_phone: customer_phone || '',
        customer_email: customer_email || '',
      },
    })

    const { data: invoice, error } = await supabase.from('invoices').insert({
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      service_type,
      amount: parseFloat(amount),
      status: 'sent',
      stripe_url: paymentLink.url,
    }).select().single()

    if (error) throw error

    if (customer_phone) {
      await twilioClient.messages.create({
        body: `Hi ${customer_name}, you have an invoice for ${service_type} — $${amount}. Pay securely here: ${paymentLink.url} — BellAveGo`,
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: customer_phone,
      })
    }

    return NextResponse.json({ ok: true, invoice })
  } catch (err: any) {
    console.error('Invoice error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}