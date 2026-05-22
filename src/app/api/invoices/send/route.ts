import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import twilio from 'twilio'
import { sendEmail, renderInvoiceEmail } from '@/lib/email'
import { lookupOwnerEmail } from '@/lib/notify'

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

    // Deliver the payment link via SMS + email in parallel. Each channel is
    // isolated in its own try/catch — Twilio A2P carrier blocks (error 30034)
    // must not kill the email path, and a Resend hiccup must not kill the SMS.
    // The Stripe invoice + DB row are already committed before this point.
    const channels: { sms: boolean; email: boolean; smsError?: string; emailError?: string } = {
      sms: false, email: false,
    }

    if (customer_phone) {
      try {
        await twilioClient.messages.create({
          body: `Hi ${customer_name}, you have an invoice for ${service_type} — $${parsedAmount.toFixed(2)}. Pay securely here: ${paymentLink.url} — ${businessName}`,
          from: fromNumber,
          to: customer_phone,
        })
        channels.sms = true
      } catch (e) {
        channels.smsError = e instanceof Error ? e.message : String(e)
        console.error('[invoices/send] sms failed:', channels.smsError)
      }
    }

    if (customer_email) {
      try {
        const contractorEmail = await lookupOwnerEmail(userId)
        const { subject, html, text } = renderInvoiceEmail({
          toEmail: customer_email,
          customerName: customer_name,
          contractorBusinessName: businessName,
          serviceType: service_type,
          amount: parsedAmount,
          paymentLinkUrl: paymentLink.url,
        })
        const result = await sendEmail({
          to: customer_email,
          subject,
          html,
          text,
          replyTo: contractorEmail ?? undefined,
        })
        channels.email = result.ok
        if (!result.ok) channels.emailError = result.error
      } catch (e) {
        channels.emailError = e instanceof Error ? e.message : String(e)
        console.error('[invoices/send] email failed:', channels.emailError)
      }
    }

    return NextResponse.json({ ok: true, invoice, channels })
  } catch (err: any) {
    console.error('Invoice error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
