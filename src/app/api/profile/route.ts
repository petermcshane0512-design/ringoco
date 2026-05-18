import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { effectiveAuth } from '@/lib/effectiveAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Columns we know exist on the bare profiles table. Used as a defensive whitelist
// when an `ADD COLUMN IF NOT EXISTS` migration hasn't propagated yet — we never
// want a missing-column error to send the customer back to /onboarding next login.
const SAFE_PROFILE_COLUMNS = new Set([
  'user_id', 'business_name', 'business_type', 'owner_phone', 'services',
  'service_area', 'ai_tone', 'twilio_number', 'revenue_range', 'team_size',
  'hours_open', 'hours_close', 'onboarding_complete', 'is_active',
  'plan_tier', 'stripe_customer_id', 'stripe_subscription_id', 'stripe_metered_item_id',
  'welcomed_at', 'google_place_id', 'review_request_enabled', 'ai_language',
  'setup_complete', 'setup_step', 'forwarding_carrier', 'forwarding_confirmed_at',
  'test_call_at', 'test_call_received', 'a2p_submitted_at', 'a2p_brand_sid',
  'crm_provider', 'crm_connected_at', 'kickoff_scheduled_at', 'custom_prompt_notes',
  // ── added in migration 009 ────────────────────────────────────────
  'owner_first_name', 'services_offered', 'zip_code', 'business_address',
  'timezone', 'welcome_report_at', 'last_consulting_report_at',
  'verification_nudged_at', 'a2p_brand_status', 'a2p_campaign_sid',
  'a2p_messaging_service_sid',
  // ── added by AI agent build (May 2026) ────────────────────────────
  'ai_voice_id', 'backup_owner_phone', 'onboarding_day3_at', 'onboarding_day7_at',
  'vapi_phone_number_id',
])

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await req.json()
  // Filter to known columns — if migration hasn't propagated, drop the unknown fields
  // rather than fail the whole save. Customer's business_name still lands; the
  // "onboarding_complete" flag we attempt anyway and tolerate failure.
  const filtered: Record<string, unknown> = { user_id: userId }
  for (const [k, v] of Object.entries(raw)) {
    if (SAFE_PROFILE_COLUMNS.has(k)) filtered[k] = v
  }

  // ── Referral attribution capture ──
  // If the visitor landed via ?ref=BAVG-XXXXXX, middleware set a bavg_ref cookie.
  // Read it here on first profile creation and pre-fill referred_by so the
  // Stripe webhook can grant the referrer a free month when checkout completes.
  // First-touch wins: we never overwrite an existing referred_by value.
  try {
    const refCookie = req.cookies.get('bavg_ref')?.value
    if (refCookie && /^BAVG-[A-Z0-9]{6}$/.test(refCookie)) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('referred_by')
        .eq('user_id', userId)
        .maybeSingle()
      const already = (existing as { referred_by?: string | null } | null)?.referred_by
      if (!already) {
        filtered.referred_by = refCookie
      }
    }
  } catch {
    // Cookie read failure is non-fatal — profile save continues without attribution.
  }

  const { error } = await supabase
    .from('profiles')
    .upsert(filtered, { onConflict: 'user_id' })

  if (error) {
    // If a column is missing (PGRST204), retry with onboarding_complete dropped
    // so the customer's business info still gets saved.
    if (error.code === 'PGRST204' || /column.*does not exist/i.test(error.message)) {
      console.warn('[profile POST] schema mismatch, retrying without optional columns:', error.message)
      const bareRetry: Record<string, unknown> = {
        user_id: userId,
        business_name: raw.business_name,
        owner_phone: raw.owner_phone,
        services: raw.services,
      }
      const { error: retryErr } = await supabase
        .from('profiles')
        .upsert(bareRetry, { onConflict: 'user_id' })
      if (retryErr) {
        console.error('[profile POST] retry failed:', retryErr)
        return NextResponse.json({ error: retryErr.message, hint: 'Run RUN-IN-SUPABASE-NOW.sql' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, warning: 'Schema incomplete — onboarding flag not persisted to DB. Run migrations.' })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}