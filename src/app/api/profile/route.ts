import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { effectiveAuth } from '@/lib/effectiveAuth'
import { repatchPerTenantAssistant } from '@/lib/provisionNumber'

// Profile fields that, when changed, require re-PATCHing the contractor's
// per-tenant Vapi assistant — otherwise the dashboard save lands in
// Supabase but the live AI assistant keeps the OLD prompt until next
// provision. Fire-and-forget after the save succeeds.
const VAPI_PROMPT_RELEVANT_FIELDS = new Set([
  'business_name',
  'owner_first_name',
  'services',
  'service_area',
  'ai_tone',
  'ai_voice_id',
  'ai_language',
  'custom_prompt_notes',
  // Greeting style + custom template feed the firstMessage build in
  // /api/vapi/assistant-request. Changes must trigger an assistant repatch.
  'ai_greeting_style',
  'ai_greeting_custom',
])

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
  // ── auto-booking controls (sql/2026-05-21-auto-booking-controls.sql) ──
  'auto_booking_enabled', 'auto_booking_min_hour', 'auto_booking_max_hour',
  // ── appointment settings (migration 021) ──────────────────────────
  // Used by /lib/calendar/availability.ts to decide how long the AI
  // blocks each booked job + how much travel buffer to leave before/after.
  'default_job_duration_min', 'travel_buffer_min', 'appointment_settings_at',
  // ── greeting style (migration 2026-06-01) ─────────────────────────
  'ai_greeting_style', 'ai_greeting_custom',
  // ── forwarding diag (migration 2026-06-01) ────────────────────────
  'forwarding_test_from', 'forwarding_test_strict_match',
  // ── lead routing (sql/2026-06-04-profile-service-zips.sql) ────────
  // service_zips = home ZIPs the contractor works out of (array). Drives
  // /api/crons/lead-engine — every lead is filtered to ZIPs within
  // service_radius_mi of any of these. Captured at onboarding.
  'service_zips', 'service_radius_mi',
  // ── 2026-06-06 onboarding deltas (sql/2026-06-06-onboarding-fields.sql)
  // business_description — 1-sentence pitch for Emma + lead pitch script
  // sub_trade            — free-text specialty filter for lead engine
  // min_ticket           — USD floor under which leads are dropped
  'business_description', 'sub_trade', 'min_ticket',
  // ── 2026-06-07 first-drop tracking (sql/2026-06-07-first-drop-tracking.sql) ──
  // first_lead_drop_at — set by lead engine on first successful drop.
  // Read by the dashboard to swap the "leads within 24h" countdown for
  // the real leads view. Not user-writable from this route, but listed
  // here for the GET-side select shape.
  'first_lead_drop_at',
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

  // Settings save succeeded — if any prompt-relevant field changed, fire a
  // background re-PATCH of the contractor's Vapi assistant so their next call
  // uses the new prompt. NOT awaited (we don't want to delay the 200 response
  // while Vapi round-trips). Errors logged inside the helper, never thrown.
  const touchedPromptField = Object.keys(filtered).some((k) =>
    VAPI_PROMPT_RELEVANT_FIELDS.has(k),
  )
  if (touchedPromptField) {
    repatchPerTenantAssistant(userId)
      .then((r) =>
        r.ok
          ? console.log(`[profile POST] Vapi assistant ${r.assistantId} re-PATCHed for ${userId}`)
          : console.warn(`[profile POST] Vapi re-PATCH skipped for ${userId}: ${r.reason}`),
      )
      .catch((e) => console.error(`[profile POST] Vapi re-PATCH threw for ${userId}:`, e))
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