import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED = new Set([
  'service_area_zips', 'competitor_place_ids', 'website_url', 'website_provider',
  'website_api_token', 'website_collection_id', 'google_place_id',
  'google_ads_customer_id', 'meta_ad_account_id', 'growth_wallet_auto_topup_cents',
  'reactivation_enabled', 'weather_triggers_enabled', 'permits_enabled',
  'competitor_watch_enabled', 'weekly_report_day',
])

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan_tier').eq('user_id', userId).maybeSingle()
  if (profile?.plan_tier !== 'concierge') {
    return NextResponse.json({ error: 'Concierge tier required' }, { status: 403 })
  }

  const raw = await req.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED.has(k)) update[k] = v
  }

  // Mark first onboarding completion
  const { data: existing } = await supabase.from('concierge_settings').select('onboarded_at').eq('user_id', userId).maybeSingle()
  if (!existing?.onboarded_at) update.onboarded_at = new Date().toISOString()

  const { error } = await supabase.from('concierge_settings').upsert(update, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
