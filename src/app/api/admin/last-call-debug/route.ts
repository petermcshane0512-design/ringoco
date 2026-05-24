import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { lookupOwnerEmail } from '@/lib/notify'

/**
 * Diagnostic — returns the most recent call_logs row for a user_id and
 * tells you what notifications SHOULD have fired (and which would have
 * been skipped because of missing data).
 *
 * Built specifically to debug "I called my number and didn't get an
 * SMS/email" reports. Read what came back and compare against what the
 * /api/vapi/end-of-call-report code path actually runs.
 *
 * Auth: requireAdmin() (x-admin-secret header OR admin Clerk session).
 *
 * USAGE
 *   GET /api/admin/last-call-debug?user_id=user_xxxxx
 *   curl -H "x-admin-secret: $ADMIN_API_SECRET" \
 *     "https://www.bellavego.com/api/admin/last-call-debug?user_id=user_xxxxx"
 */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const params = new URL(req.url).searchParams
  let userId = params.get('user_id')
  const twilioNumber = params.get('twilio_number')

  // Allow lookup by twilio_number too — saves having to dig up the Clerk
  // user_id when diagnosing a specific tenant number.
  if (!userId && twilioNumber) {
    const { data: byNum } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('twilio_number', twilioNumber)
      .maybeSingle()
    if (byNum?.user_id) userId = byNum.user_id
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'missing user_id (or twilio_number) query param' },
      { status: 400 },
    )
  }

  // Pull profile + most recent call_log + most recent job in parallel.
  // Use `select('*')` on profiles so missing columns (e.g. first_call_at if
  // its migration hasn't been run) don't error the whole endpoint — we'd
  // rather get back what we have than fail closed during a debug session.
  const [
    { data: profile, error: profErr },
    { data: lastCall, error: callErr },
    { data: lastJob, error: jobErr },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('jobs')
      .select('id, customer_name, customer_phone, job_type, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!profile) {
    return NextResponse.json(
      {
        error: `no profile for user_id=${userId}`,
        debug: { profErr, callErr, jobErr },
      },
      { status: 404 },
    )
  }

  // Pull Clerk primary email to confirm where the contractor-lead email
  // SHOULD have landed. Wrapped in try because Clerk lookup can throw.
  let clerkEmail: string | null = null
  let clerkLookupError: string | null = null
  try {
    clerkEmail = await lookupOwnerEmail(userId)
  } catch (e) {
    clerkLookupError = (e as Error).message
  }

  // Diagnose: what would the end-of-call webhook have done?
  const fallbackOwnerPhone = process.env.FALLBACK_OWNER_PHONE ?? null
  const fallbackOwnerEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
  const resendKeyPresent = !!process.env.RESEND_API_KEY
  const twilioDemoNumber = process.env.TWILIO_DEMO_NUMBER || '+16514677829'

  const p = profile as {
    owner_phone?: string | null
    business_name?: string | null
  }
  const c = lastCall as {
    created_at?: string
    job_created?: boolean | null
    booking_completed?: boolean | null
    summary?: string | null
    transcript?: string | null
  } | null

  const messageCaptured = !!c?.job_created
  const ownerPhoneResolved = p.owner_phone || fallbackOwnerPhone

  const wouldHaveFired = {
    contractor_sms_to_ownerPhone: {
      would_send: !!ownerPhoneResolved,
      to: ownerPhoneResolved ?? '(no number — SMS skipped)',
      from: twilioDemoNumber,
      gated_on: 'tenant.owner_phone || FALLBACK_OWNER_PHONE env',
      note: !p.owner_phone && fallbackOwnerPhone
        ? '⚠️ profile.owner_phone is empty — SMS would go to FALLBACK_OWNER_PHONE (Peter\'s cell), not contractor'
        : !p.owner_phone
        ? '❌ profile.owner_phone is empty AND FALLBACK_OWNER_PHONE not set — SMS would be SKIPPED'
        : '✓ profile.owner_phone present',
    },
    peter_alert_email: {
      would_send: !!(fallbackOwnerEmail && ownerPhoneResolved && resendKeyPresent),
      to: fallbackOwnerEmail,
      gated_on: 'FALLBACK_OWNER_EMAIL + ownerPhone + RESEND_API_KEY',
      resend_configured: resendKeyPresent,
      note: !resendKeyPresent
        ? '❌ RESEND_API_KEY not set — Resend rejects all sends, ALL emails skipped silently'
        : !ownerPhoneResolved
        ? '❌ ownerPhone falsy — Peter alert email is gated on it'
        : '✓ would send',
    },
    contractor_lead_email: {
      would_send: !!(clerkEmail && resendKeyPresent && messageCaptured),
      to: clerkEmail ?? '(Clerk lookup returned null)',
      gated_on: 'Clerk primary email + RESEND_API_KEY + take_message fired',
      clerk_lookup_error: clerkLookupError,
      note: clerkLookupError
        ? `❌ Clerk lookup threw: ${clerkLookupError}`
        : !clerkEmail
        ? '❌ Clerk returned no email for this user_id'
        : !resendKeyPresent
        ? '❌ RESEND_API_KEY not set'
        : !messageCaptured
        ? '⚠️ take_message did NOT fire — only the missed-info email path runs'
        : '✓ would send',
    },
    first_call_celebration: {
      already_fired: !!(profile as { first_call_at?: string | null }).first_call_at,
      note: (profile as { first_call_at?: string | null }).first_call_at
        ? `Already stamped at ${(profile as { first_call_at?: string }).first_call_at} — celebration only fires ONCE per profile`
        : 'Not yet fired — next take_message that wins the atomic claim will trigger it',
    },
  }

  // Query Vapi for actual call history on this assistant. If a call hit Vapi
  // but we have no call_logs row, the webhook never reached us (signature
  // failure, env mismatch, etc.). Vapi truth-source vs our DB will pinpoint
  // the gap. Limited to 5 most recent so we don't burn the budget.
  let vapiCalls: unknown = null
  let vapiAssistantConfig: unknown = null
  const vapiAssistantId = (profile as { vapi_assistant_id?: string | null }).vapi_assistant_id
  if (vapiAssistantId && process.env.VAPI_API_KEY) {
    try {
      const [callsRes, assistantRes] = await Promise.all([
        fetch(`https://api.vapi.ai/call?assistantId=${vapiAssistantId}&limit=5`, {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        }),
        fetch(`https://api.vapi.ai/assistant/${vapiAssistantId}`, {
          headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
        }),
      ])
      if (callsRes.ok) {
        const arr = (await callsRes.json()) as Array<Record<string, unknown>>
        vapiCalls = arr.slice(0, 5).map((c) => ({
          id: c.id,
          createdAt: c.createdAt,
          endedAt: c.endedAt,
          endedReason: c.endedReason,
          phoneNumber: (c.phoneNumber as { number?: string } | undefined)?.number,
          customer: (c.customer as { number?: string } | undefined)?.number,
          cost: c.cost,
          summary: (c.summary as string | undefined)?.slice(0, 200),
          messages_count: Array.isArray(c.messages) ? c.messages.length : null,
          tool_call_count: Array.isArray(c.messages)
            ? c.messages.filter((m) =>
                (m as { toolCalls?: unknown[]; role?: string }).toolCalls ||
                (m as { role?: string }).role === 'tool_calls',
              ).length
            : null,
          assistantOverrides_metadata: (c.assistantOverrides as { metadata?: unknown } | undefined)?.metadata,
        }))
      } else {
        vapiCalls = { error: `Vapi /call HTTP ${callsRes.status}`, body: (await callsRes.text()).slice(0, 200) }
      }
      if (assistantRes.ok) {
        const a = (await assistantRes.json()) as Record<string, unknown>
        vapiAssistantConfig = {
          id: a.id,
          name: a.name,
          metadata: a.metadata,
          firstMessage_preview: (a.firstMessage as string | undefined)?.slice(0, 100),
          tool_names: ((a.model as { tools?: Array<{ function?: { name?: string } }> } | undefined)?.tools ?? [])
            .map((t) => t.function?.name),
          serverUrl: a.serverUrl,
          serverMessages: a.serverMessages,
          has_server_secret: !!(a.serverUrlSecret || (a.server as { secret?: string } | undefined)?.secret),
        }
      } else {
        vapiAssistantConfig = { error: `Vapi /assistant HTTP ${assistantRes.status}` }
      }
    } catch (e) {
      vapiCalls = { threw: (e as Error).message }
    }
  }

  return NextResponse.json({
    profile: {
      user_id: profile.user_id,
      business_name: profile.business_name,
      owner_first_name: (profile as { owner_first_name?: string | null }).owner_first_name,
      owner_phone: profile.owner_phone,
      backup_owner_phone: (profile as { backup_owner_phone?: string | null }).backup_owner_phone,
      twilio_number: profile.twilio_number,
      plan_tier: profile.plan_tier,
      is_active: profile.is_active,
      vapi_assistant_id: (profile as { vapi_assistant_id?: string | null }).vapi_assistant_id,
      vapi_phone_number_id: (profile as { vapi_phone_number_id?: string | null }).vapi_phone_number_id,
      first_call_at: (profile as { first_call_at?: string | null }).first_call_at,
      forwarding_verified_at: (profile as { forwarding_verified_at?: string | null }).forwarding_verified_at,
    },
    clerk_primary_email: clerkEmail,
    last_call: c
      ? {
          created_at: c.created_at,
          job_created: c.job_created,
          booking_completed: c.booking_completed,
          take_message_fired: messageCaptured,
          summary_preview: c.summary?.slice(0, 300),
          transcript_preview: c.transcript?.slice(0, 500),
        }
      : null,
    last_job: lastJob,
    env_snapshot: {
      RESEND_API_KEY_set: resendKeyPresent,
      FALLBACK_OWNER_PHONE: fallbackOwnerPhone ?? '(not set)',
      FALLBACK_OWNER_EMAIL: fallbackOwnerEmail,
      TWILIO_DEMO_NUMBER: twilioDemoNumber,
    },
    would_have_fired: wouldHaveFired,
    vapi_truth_source: {
      assistant: vapiAssistantConfig,
      recent_calls: vapiCalls,
    },
  })
}
