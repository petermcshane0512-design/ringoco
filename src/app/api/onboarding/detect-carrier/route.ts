import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Auto-detect the customer's mobile carrier via Twilio Lookup v2.
 *
 * GET /api/onboarding/detect-carrier
 * Returns: { carrier: 'verizon' | 'att' | 'tmobile' | 'sprint' | 'other', name: string }
 *
 * Used by the setup wizard to skip the "pick your carrier" step and show
 * exactly the right *71/**61 forwarding code instantly. Cost: ~$0.005/lookup.
 */

type CarrierKey = 'verizon' | 'att' | 'tmobile' | 'sprint' | 'other'

function classifyCarrier(name: string): CarrierKey {
  const n = (name || '').toLowerCase()
  if (n.includes('verizon')) return 'verizon'
  if (n.includes('at&t') || n.includes('at and t') || n.includes('cingular')) return 'att'
  if (n.includes('t-mobile') || n.includes('tmobile') || n.includes('sprint')) return 'tmobile' // sprint folded into t-mobile
  if (n.includes('us cellular') || n.includes('uscc') || n.includes('cricket') || n.includes('boost') || n.includes('metropcs')) return 'sprint'
  return 'other'
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('owner_phone')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.owner_phone) {
    return NextResponse.json({ error: 'No owner phone on file' }, { status: 400 })
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!
  const tok = process.env.TWILIO_AUTH_TOKEN!
  const basicAuth = Buffer.from(`${sid}:${tok}`).toString('base64')

  const phone = profile.owner_phone.replace(/\s+/g, '')
  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phone)}?Fields=line_type_intelligence`

  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } })
    if (!res.ok) {
      // If lookup fails (rate limit, bad number, account perms), return 'other'
      return NextResponse.json({ carrier: 'other', name: 'Unknown', detected: false })
    }
    const data = (await res.json()) as { line_type_intelligence?: { carrier_name?: string; type?: string } }
    const carrierName = data.line_type_intelligence?.carrier_name || ''
    const carrierKey = classifyCarrier(carrierName)
    return NextResponse.json({ carrier: carrierKey, name: carrierName || 'Unknown', detected: true })
  } catch (e) {
    console.error('carrier detect failed:', e)
    return NextResponse.json({ carrier: 'other', name: 'Unknown', detected: false })
  }
}
