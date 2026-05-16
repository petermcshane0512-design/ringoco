import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { auth } from '@clerk/nextjs/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const PETER_PHONE = process.env.FALLBACK_OWNER_PHONE ?? '+17737109565'

const VALID_TIERS = new Set(['concierge', 'multi_location'])

/**
 * Public waitlist signup for tiers we're deferring until Q3 2026.
 * Inserts into concierge_waitlist table + SMSes Peter so he can call.
 *
 * POST /api/waitlist/concierge
 * Body: { email, business_name, phone, business_type, zip_code, team_size, monthly_revenue, tier_interested, notes }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    email?: string
    business_name?: string
    phone?: string
    business_type?: string
    zip_code?: string
    team_size?: string
    monthly_revenue?: string
    tier_interested?: string
    notes?: string
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const tier = body.tier_interested && VALID_TIERS.has(body.tier_interested)
    ? body.tier_interested
    : 'concierge'

  // Capture Clerk userId if they happen to be signed in (most won't be)
  let userId: string | null = null
  try {
    const a = await auth()
    userId = a.userId ?? null
  } catch {}

  const { data: row, error } = await supabase
    .from('concierge_waitlist')
    .insert({
      email,
      business_name: body.business_name ?? null,
      phone: body.phone ?? null,
      business_type: body.business_type ?? null,
      zip_code: body.zip_code ?? null,
      team_size: body.team_size ?? null,
      monthly_revenue: body.monthly_revenue ?? null,
      tier_interested: tier,
      notes: (body.notes ?? '').slice(0, 1000),
      user_id: userId,
    })
    .select()
    .single()

  if (error) {
    console.error('[waitlist] insert failed:', error)
    return NextResponse.json({ error: 'Could not join waitlist — text Peter at (773) 710-9565' }, { status: 500 })
  }

  // SMS Peter — high-intent lead, he should call within an hour
  try {
    const tierLabel = tier === 'multi_location' ? 'Multi-Location' : 'Concierge'
    const lines = [
      `🎯 New ${tierLabel} waitlist signup`,
      ``,
      `👤 ${body.business_name || '(no business name)'}`,
      `📧 ${email}`,
      body.phone ? `📞 ${body.phone}` : null,
      body.business_type ? `🔧 ${body.business_type}` : null,
      body.zip_code ? `📍 ${body.zip_code}` : null,
      body.team_size ? `👥 Team: ${body.team_size}` : null,
      body.monthly_revenue ? `💰 Revenue: ${body.monthly_revenue}` : null,
      body.notes ? `\n💬 "${body.notes.slice(0, 200)}"` : null,
      `\nCall them today — high-intent.`,
    ].filter(Boolean)
    await twilioClient.messages.create({
      body: lines.join('\n'),
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: PETER_PHONE,
    })
  } catch (e) {
    console.error('[waitlist] SMS to Peter failed:', e)
    // Non-fatal — the row is saved either way
  }

  return NextResponse.json({ ok: true, id: row.id })
}
