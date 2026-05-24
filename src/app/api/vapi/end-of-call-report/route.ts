import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import { OFFICE_MGR_TIERS, callCapForTier } from '@/lib/pricing'
import { verifyVapiSignature } from '@/lib/vapi'
import { switchToCapacityMode } from '@/lib/provisionNumber'
import { sendEmail, renderLeadAlertEmail, renderContractorLeadEmail, renderFirstCallCelebrationEmail } from '@/lib/email'
import { lookupOwnerEmail } from '@/lib/notify'
import { estimateJobTicket } from '@/lib/consultingMetrics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)
const anthropic = new Anthropic()

/**
 * Vapi post-call webhook. Receives two event types we care about:
 *   - tool-calls       → AI called book_appointment. Run the booking flow.
 *   - end-of-call-report → conversation finished. Log transcript + finalize.
 *
 * The booking flow mirrors the legacy /api/twilio/voice path:
 *   1. Upsert customer (by phone)
 *   2. Insert job (status 'pending_approval')
 *   3. Office Mgr+: Claude smart-insight tip
 *   4. SMS contractor with YES/NO buttons + insight
 *   5. SMS homeowner with "owner will confirm" message
 *   6. Upsert call_logs (also enables the Receptionist tier cap counter)
 *
 * Tenant context comes from assistantOverrides.metadata (set in
 * /api/vapi/assistant-request). Falls back to looking up by called number if
 * metadata is missing (e.g. for legacy assistants without metadata wired).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!(await verifyVapiSignature(raw, req.headers))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: VapiServerMessage
  try {
    payload = JSON.parse(raw) as VapiServerMessage
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = payload.message
  if (!message) return NextResponse.json({ ok: true })

  try {
    if (message.type === 'tool-calls') {
      return await handleToolCalls(message)
    }
    if (message.type === 'end-of-call-report') {
      return await handleEndOfCallReport(message)
    }
    // Any other event — acknowledge so Vapi doesn't retry
    return NextResponse.json({ ok: true, ignored: message.type })
  } catch (e) {
    console.error('vapi webhook handler threw:', e)
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    )
  }
}

// ── tool-calls (take_message) ───────────────────────────────────
async function handleToolCalls(message: VapiServerMessage['message']) {
  if (!message) return NextResponse.json({ ok: true })

  const calls = message.toolCalls ?? message.toolCallList ?? []
  const results: Array<{ toolCallId: string; result: string }> = []

  for (const tc of calls) {
    if (tc.function?.name !== 'take_message') {
      results.push({
        toolCallId: tc.id,
        result: 'Unknown tool — ignored.',
      })
      continue
    }
    const args = parseToolArgs(tc.function.arguments)
    const tenant = extractTenant(message)
    const callSid = message.call?.id ?? cryptoRandom()
    const callerPhone =
      message.call?.customer?.number ?? args.customer_phone ?? null

    // Fallback tenant lookup. Vapi has been observed to drop
    // assistantOverrides.metadata in webhook payloads (see comments in
    // extractTenant). When that happens for a real tenant call, we'd
    // otherwise lose the lead with "couldn't locate the business account."
    // Recover by querying profiles by the called number — same lookup
    // assistant-request did when the call was first set up.
    if (!tenant.is_demo && !tenant.user_id) {
      const calledNumber =
        message.call?.phoneNumber?.number ?? tenant.twilio_number ?? null
      if (calledNumber) {
        try {
          const { data: recovered } = await supabase
            .from('profiles')
            .select('user_id, business_name, owner_phone, backup_owner_phone, owner_first_name, plan_tier, twilio_number')
            .eq('twilio_number', calledNumber)
            .maybeSingle()
          if (recovered?.user_id) {
            console.warn(
              `handleToolCalls: recovered tenant ${recovered.user_id} via twilio_number lookup (Vapi metadata was missing)`,
            )
            tenant.user_id = recovered.user_id
            tenant.business_name = recovered.business_name ?? tenant.business_name
            tenant.owner_phone = recovered.owner_phone ?? tenant.owner_phone
            tenant.backup_owner_phone =
              (recovered as { backup_owner_phone?: string | null }).backup_owner_phone ?? tenant.backup_owner_phone
            ;(tenant as { owner_first_name?: string | null }).owner_first_name =
              (recovered as { owner_first_name?: string | null }).owner_first_name ?? null
            tenant.plan_tier = recovered.plan_tier ?? tenant.plan_tier
            tenant.twilio_number = recovered.twilio_number ?? tenant.twilio_number
          }
        } catch (e) {
          console.error('handleToolCalls fallback tenant lookup failed:', e)
        }
      }
    }

    // Lazy self-heal: assistant metadata may include user_id but be MISSING
    // owner_phone (assistants created before commit "fix missing owner_phone
    // in per-tenant Vapi metadata" don't have it baked in). Without this
    // fallback the lead SMS would route to FALLBACK_OWNER_PHONE (Peter's
    // cell) instead of the actual contractor. Fetching one row from profiles
    // is cheap (~10ms) and only fires when we genuinely need it.
    if (!tenant.is_demo && tenant.user_id && !tenant.owner_phone) {
      try {
        const { data: filled } = await supabase
          .from('profiles')
          .select('owner_phone, backup_owner_phone, owner_first_name, twilio_number, business_name, plan_tier')
          .eq('user_id', tenant.user_id)
          .maybeSingle()
        if (filled) {
          tenant.owner_phone = filled.owner_phone ?? tenant.owner_phone
          tenant.backup_owner_phone =
            (filled as { backup_owner_phone?: string | null }).backup_owner_phone ?? tenant.backup_owner_phone
          ;(tenant as { owner_first_name?: string | null }).owner_first_name =
            (filled as { owner_first_name?: string | null }).owner_first_name ?? null
          tenant.twilio_number = filled.twilio_number ?? tenant.twilio_number
          tenant.business_name = filled.business_name ?? tenant.business_name
          tenant.plan_tier = filled.plan_tier ?? tenant.plan_tier
          console.log(
            `handleToolCalls: lazy-healed missing owner_phone for tenant ${tenant.user_id} (assistant metadata is stale — repatch on next /api/profile save)`,
          )
        }
      } catch (e) {
        console.error('handleToolCalls lazy-heal lookup failed:', e)
      }
    }

    // Demo number — Emma (BellAveGo's AI sales receptionist) just captured a
    // prospect lead. Two SMS sends: (1) friendly confirmation to the caller,
    // (2) hot-lead alert to Peter so he can close them inside the 1-hr window.
    if (tenant.is_demo) {
      const callerNumber = args.customer_phone || callerPhone
      const fromNumber =
        tenant.twilio_number || process.env.TWILIO_DEMO_NUMBER || process.env.TWILIO_PHONE_NUMBER!

      if (callerNumber) {
        try {
          await twilioClient.messages.create({
            // TCPA posture: demo caller called OUR own line about OUR
            // product, so we have stronger express-consent standing
            // (inbound-inquiry exception). Body is strictly
            // transactional confirmation language + visible STOP
            // opt-out per CTIA best practices.
            body: `Hi ${args.customer_name} — confirming Peter from BellAveGo will call you back in the next 1-2 hours at this number. Reply STOP to opt out.`,
            from: fromNumber,
            to: callerNumber,
          })
        } catch (e) {
          logTwilioSmsError('demo caller SMS', e)
        }
      }

      // Hot-lead alert to Peter — warm prospect just demo'd the product
      const peterPhone = process.env.FALLBACK_OWNER_PHONE
      if (peterPhone) {
        try {
          const urgencyEmoji =
            args.urgency === 'emergency' ? '🚨' : args.urgency === 'soon' ? '🎯' : '💡'
          await twilioClient.messages.create({
            body:
              `${urgencyEmoji} BellAveGo DEMO LEAD — prospect just called\n\n` +
              `👤 ${args.customer_name}\n` +
              `📞 ${callerNumber || 'no phone captured'}\n` +
              `💬 ${args.reason}\n\n` +
              (callerNumber ? `📲 Tap to call back: ${callerNumber}\n\n` : '') +
              `Warm lead — call back within 30 min for best conversion.`,
            from: fromNumber,
            to: peterPhone,
          })
        } catch (e) {
          logTwilioSmsError('demo lead alert to Peter', e)
        }
      }

      // Demo lead email to Peter — reliable iPhone alert while SMS is
      // carrier-blocked during A2P registration.
      const peterAlertEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
      if (peterAlertEmail) {
        try {
          const appUrl =
            (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
              ? process.env.NEXT_PUBLIC_APP_URL
              : 'https://www.bellavego.com'
          const { subject, html, text } = renderLeadAlertEmail({
            toEmail: peterAlertEmail,
            contractorBusinessName: 'BellAveGo Demo (prospect)',
            contractorOwnerName: 'Peter (you)',
            contractorPhone: peterPhone || '',
            callerName: args.customer_name,
            callerPhone: callerNumber,
            callerAddress: args.customer_address ?? null,
            callerMessage: args.reason,
            urgency: args.urgency,
            twilioNumberCalled: process.env.TWILIO_DEMO_NUMBER ?? null,
            callTimeISO: new Date().toISOString(),
            forwardPageUrl: `${appUrl}/admin/forward`,
          })
          await sendEmail({ to: peterAlertEmail, subject: `🎯 DEMO LEAD — ${args.customer_name}`, html, text })
        } catch (e) {
          console.error('demo lead email to Peter failed:', e)
        }
      }

      results.push({
        toolCallId: tc.id,
        result: "Got it — our team will call back in the next hour or two.",
      })
      continue
    }

    if (!tenant.user_id) {
      console.error('handleToolCalls: no tenant.user_id after fallback lookup — lead LOST', {
        callSid,
        calledNumber: message.call?.phoneNumber?.number,
        callerPhone,
      })
      results.push({
        toolCallId: tc.id,
        result:
          "I'm having trouble reaching this business's system right now — could you try calling back in a few minutes? Sorry about that.",
      })
      continue
    }

    const r = await takeMessage({
      tenant,
      args,
      callSid,
      callerPhone,
      calledNumber: tenant.twilio_number ?? message.call?.phoneNumber?.number ?? null,
    })

    results.push({
      toolCallId: tc.id,
      result: r.success
        ? "Message captured. The owner will call you back in the next hour or two."
        : "I'm having trouble saving that on my end — could you also text the owner directly so it doesn't get lost? Sorry about that.",
    })
  }

  return NextResponse.json({ results })
}

async function takeMessage(opts: {
  tenant: TenantMeta
  args: TakeMessageArgs
  callSid: string
  callerPhone: string | null
  calledNumber: string | null
}): Promise<{ success: boolean; error?: string }> {
  const { tenant, args, callSid, callerPhone, calledNumber } = opts
  const phone = args.customer_phone || callerPhone
  const urgencyEmoji = args.urgency === 'emergency' ? '🚨' : args.urgency === 'soon' ? '⚡' : '🕓'

  // 1. Upsert customer — TWO-STEP insert so a missing `address` column
  // doesn't bring down the entire lead-capture flow (Postgres bails the
  // whole insert if any column is unknown). Step A: minimum-viable row
  // we know the schema accepts. Step B: best-effort UPDATE for address.
  let customerId: string | undefined
  if (phone) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .eq('user_id', tenant.user_id)
      .maybeSingle()
    if (existing) {
      customerId = existing.id
    } else {
      const { data: created, error: custErr } = await supabase
        .from('customers')
        .insert({
          user_id: tenant.user_id,
          name: args.customer_name,
          phone,
        })
        .select('id')
        .single()
      if (custErr) {
        console.error('vapi take_message: customer insert failed', custErr)
      }
      customerId = created?.id
      // Best-effort address update — non-fatal if column missing.
      if (customerId && args.customer_address) {
        try {
          const { error: addrErr } = await supabase
            .from('customers')
            .update({ address: args.customer_address })
            .eq('id', customerId)
          if (addrErr) {
            console.warn('customers.address update skipped (column may not exist):', addrErr.message)
          }
        } catch (e) {
          console.warn('customers.address update threw:', (e as Error).message)
        }
      }
    }
  }

  // 2. Insert job (status 'pending_approval' kept for dashboard backward compat —
  // semantically this is "needs callback" not "needs scheduling confirmation").
  //
  // Pre-fill amount_estimated with a trade-average ticket so consulting reports
  // ALWAYS show real-looking revenue, even before the contractor reports actual
  // amounts. Revenue-followup cron asks for the real number 5+ days post-job;
  // when contractor texts back, amount + revenue_source='reported' replace this.
  // We need the contractor's business_type to pick the right estimate.
  let estimatedAmount: number | null = null
  try {
    const { data: profileForEstimate } = await supabase
      .from('profiles')
      .select('business_type')
      .eq('user_id', tenant.user_id)
      .maybeSingle()
    estimatedAmount = estimateJobTicket(
      (profileForEstimate as { business_type?: string | null } | null)?.business_type,
      args.reason,
    )
  } catch (e) {
    console.error('amount_estimated lookup failed:', e)
  }

  // jobs insert — TWO-STEP defense. ONLY include columns guaranteed to exist
  // in the base schema. Any column added by a later migration (address,
  // amount_estimated, revenue_source, etc.) is applied via a best-effort
  // follow-up UPDATE so a missing/unapplied migration can NEVER kill lead
  // capture again (this was the bug May 24 2026 — migration 018 wasn't
  // applied to prod, so every take_message returned "I couldn't save that").
  const { data: jobRow, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      user_id: tenant.user_id,
      customer_id: customerId,
      customer_name: args.customer_name,
      customer_phone: phone,
      job_type: args.reason,
      scheduled_time: 'callback requested',
      title: `Callback: ${args.customer_name} — ${args.reason}`,
      status: 'pending_approval',
    })
    .select('id')
    .single()

  if (jobErr) {
    console.error('vapi take_message: job insert failed', jobErr)
    return { success: false, error: 'database write failed' }
  }

  // Best-effort follow-up updates for columns added by later migrations.
  // Each wrapped independently so one missing column can't skip the rest.
  if (jobRow?.id && args.customer_address) {
    try {
      const { error: addrErr } = await supabase
        .from('jobs')
        .update({ address: args.customer_address })
        .eq('id', jobRow.id)
      if (addrErr) {
        console.warn('jobs.address update skipped (column may not exist):', addrErr.message)
      }
    } catch (e) {
      console.warn('jobs.address update threw:', (e as Error).message)
    }
  }

  if (jobRow?.id && estimatedAmount != null) {
    try {
      const { error: revErr } = await supabase
        .from('jobs')
        .update({ amount_estimated: estimatedAmount, revenue_source: 'estimated' })
        .eq('id', jobRow.id)
      if (revErr) {
        console.warn('jobs.amount_estimated update skipped (migration 018 may not be applied):', revErr.message)
      }
    } catch (e) {
      console.warn('jobs.amount_estimated update threw:', (e as Error).message)
    }
  }

  // 2b. Seed quote_followups so Quote Hunter chases the lead if the contractor
  // doesn't make the callback within 2 days. Office Mgr/Concierge only.
  try {
    const twoDaysOut = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('quote_followups').insert({
      user_id: tenant.user_id,
      customer_name: args.customer_name,
      customer_phone: phone,
      quote_description: args.reason,
      source: 'ai_call',
      status: 'pending',
      next_followup_at: twoDaysOut,
    })
  } catch (e) {
    console.error('quote_followups seed (vapi) failed:', e)
  }

  // 3. Smart insight (Office Mgr+) — quick sales tip from the captured reason.
  // Wrapped in a 4s timeout: missing insight is fine, but a hanging Anthropic
  // call would stall the whole tool-call webhook and Vapi may time out the
  // exchange. 4s leaves >15s of headroom against Vapi's typical tool-call
  // budget.
  let smartInsight = ''
  if (OFFICE_MGR_TIERS.has(tenant.plan_tier ?? '')) {
    try {
      const insightPromise = anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system:
          'Read a one-sentence callback request a homeowner left with an AI receptionist. Output ONE short sales/ops tip the contractor should know BEFORE calling them back. ' +
          '≤25 words. Concrete. Format: "💡 [tip]". If nothing useful, output "💡 Standard callback — no extra notes."',
        messages: [
          {
            role: 'user',
            content: `Callback request: ${args.customer_name} (${phone}) said: "${args.reason}". Urgency: ${args.urgency}.`,
          },
        ],
      })
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))
      const r = await Promise.race([insightPromise, timeoutPromise])
      if (r === null) {
        console.warn('smart-insight timed out after 4s — proceeding without it')
      } else {
        smartInsight = r.content[0].type === 'text' ? r.content[0].text.trim() : ''
      }
    } catch (e) {
      console.error('smart-insight failed:', e)
    }
  }

  // 4. SMS contractor — tap-to-call link, no YES/NO
  //
  // FROM-NUMBER STRATEGY (May 2026, A2P transition window):
  //   Sends FROM the centralized BellAveGo demo number, NOT the
  //   contractor's own BellAveGo number. The demo line has historical
  //   carrier acceptance and SMS reliably delivers; the contractor's
  //   own number is in A2P 10DLC review and gets ~30% carrier-blocked
  //   (error 30034) until their brand approves.
  //
  //   Trade-off: Mike sees +16514677829 in his contacts instead of his
  //   own number. We mitigate by prefixing the body with "🤖 BellAveGo
  //   for [Mike's HVAC]" so he knows which business this lead is for.
  //
  //   The caller-confirmation SMS (Sarah's "we'll call you back") still
  //   sends FROM the contractor's number — that's by design, since Mike
  //   wants Sarah to see his business's phone number on her end. Some
  //   of those caller SMSes will be filtered until A2P clears, but the
  //   contractor still gets the lead via email + this SMS, which is the
  //   mission-critical path.
  //
  //   When a contractor's a2p_brand_status === 'approved', we can flip
  //   their `from` back to tenant.twilio_number for personalization.
  //   Not added yet — current customers are all pre-A2P.
  const ownerPhone = tenant.owner_phone ?? process.env.FALLBACK_OWNER_PHONE
  const calledTenantNumber = calledNumber || tenant.twilio_number || process.env.TWILIO_PHONE_NUMBER!
  const contractorAlertFrom =
    process.env.TWILIO_DEMO_NUMBER || '+16514677829'
  if (ownerPhone) {
    try {
      const insightLine = smartInsight ? `\n\n${smartInsight}` : ''
      const telLink = phone ? `\n\n📲 Tap to call: ${phone}` : ''
      const addressLine = args.customer_address ? `\n📍 ${args.customer_address}` : ''
      const businessLine = tenant.business_name
        ? `🤖 BellAveGo for ${tenant.business_name}\n`
        : `🤖 BellAveGo lead\n`
      await twilioClient.messages.create({
        body: `${businessLine}${urgencyEmoji} New callback\n\n👤 ${args.customer_name}\n📞 ${phone}${addressLine}\n💬 ${args.reason}\n⚡ Urgency: ${args.urgency}${insightLine}${telLink}\n\nView at bellavego.com/dashboard`,
        from: contractorAlertFrom,
        to: ownerPhone,
      })
    } catch (e) {
      logTwilioSmsError('contractor SMS', e)
    }
  }

  // Original from-number kept as `fromNumber` for downstream blocks
  // (emergency outbound voice call, caller-confirmation SMS) that
  // legitimately use the tenant's own BellAveGo number.
  const fromNumber = calledTenantNumber

  // 4c. EMAIL ALERT TO PETER — during A2P registration period, SMS to
  // contractor is often blocked by carriers (error 30034). Email-to-Peter
  // gives him a reliable, real-time notification on his iPhone so he can
  // open /admin/forward and manually iMessage the contractor in 5 seconds.
  // Also stays useful post-A2P as a permanent searchable record.
  const peterAlertEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
  if (peterAlertEmail && ownerPhone) {
    try {
      const appUrl =
        (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
          ? process.env.NEXT_PUBLIC_APP_URL
          : 'https://www.bellavego.com'
      const { subject, html, text } = renderLeadAlertEmail({
        toEmail: peterAlertEmail,
        contractorBusinessName: tenant.business_name || 'a BellAveGo customer',
        contractorOwnerName: (tenant as { owner_first_name?: string }).owner_first_name || 'the owner',
        contractorPhone: ownerPhone,
        callerName: args.customer_name,
        callerPhone: phone,
        callerAddress: args.customer_address ?? null,
        callerMessage: args.reason,
        urgency: args.urgency,
        twilioNumberCalled: calledNumber,
        callTimeISO: new Date().toISOString(),
        forwardPageUrl: `${appUrl}/admin/forward`,
      })
      await sendEmail({ to: peterAlertEmail, subject, html, text })
    } catch (e) {
      console.error('peter alert email failed:', e)
    }
  }

  // 4d. EMAIL ALERT TO CONTRACTOR (BellAveGo customer) — direct replacement
  // for SMS-to-contractor while A2P 10DLC is registering. Goes to the email
  // on their Clerk account so they get the lead instantly in their inbox and
  // can tap-to-call back. Best-effort; failure does not block the call flow.
  try {
    const contractorEmail = await lookupOwnerEmail(tenant.user_id)
    if (contractorEmail) {
      const appUrl =
        (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
          ? process.env.NEXT_PUBLIC_APP_URL
          : 'https://www.bellavego.com'
      // Look up the contractor's timezone so the call-time renders in
      // their wall clock — a Phoenix shop should see "1:30 PM" not "3:30 PM".
      // profile.timezone is authoritative; backfilled to America/Chicago by
      // sql/2026-05-22-timezone-default.sql so this lookup never returns null.
      const { data: tzRow } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('user_id', tenant.user_id)
        .maybeSingle()
      const contractorTz = (tzRow as { timezone?: string | null } | null)?.timezone ?? null
      const { subject, html, text } = renderContractorLeadEmail({
        toEmail: contractorEmail,
        contractorBusinessName: tenant.business_name || 'your business',
        callerName: args.customer_name,
        callerPhone: phone,
        callerAddress: args.customer_address ?? null,
        callerMessage: args.reason,
        urgency: args.urgency,
        callTimeISO: new Date().toISOString(),
        smartInsight: smartInsight || null,
        dashboardUrl: `${appUrl}/dashboard`,
        contractorTimezone: contractorTz,
      })
      await sendEmail({ to: contractorEmail, subject, html, text })
    } else {
      console.warn('contractor lead email skipped — no Clerk email for', tenant.user_id)
    }
  } catch (e) {
    console.error('contractor lead email failed:', e)
  }

  // 4e. FIRST-CALL CELEBRATION — fires exactly once per contractor.
  //
  // The atomic UPDATE ... WHERE first_call_at IS NULL pattern means
  // only the first concurrent call wins the claim (no race conditions).
  // Subsequent calls find first_call_at already set and the update
  // matches zero rows, so firstClaim is null and the block is skipped.
  //
  // Goal: emotional anchor + retention signal. Contractor sees the AI
  // working for the very first time, gets a personalized "your first
  // one just came in" email + SMS. Free dopamine; saves week-1 churn.
  try {
    const { data: firstClaim } = await supabase
      .from('profiles')
      .update({ first_call_at: new Date().toISOString() })
      .eq('user_id', tenant.user_id)
      .is('first_call_at', null)
      .select('user_id')
      .maybeSingle()

    if (firstClaim) {
      const appUrl =
        (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
          ? process.env.NEXT_PUBLIC_APP_URL
          : 'https://www.bellavego.com'
      const ownerFirst = (tenant as { owner_first_name?: string | null }).owner_first_name || 'there'

      // Celebration SMS — separate from the regular contractor alert so the
      // contractor's phone lights up with both: "you have a lead" + "🎉 it's
      // your first one." During A2P registration this SMS may be carrier-
      // blocked (error 30034); the email below is the reliable channel.
      if (ownerPhone) {
        try {
          await twilioClient.messages.create({
            body:
              `🎉 ${ownerFirst} — that was your FIRST BellAveGo call!\n\n` +
              `${args.customer_name} just called your business line and Emma captured the lead. ` +
              `From now on, every missed call gets answered, captured, and texted to you in 20 seconds. ` +
              `Welcome to receptionist-on-autopilot.\n\n— Peter, BellAveGo`,
            // Use the centralized BellAveGo demo number — same A2P
            // workaround as the regular contractor lead SMS above. The
            // celebration SMS is too important to lose to carrier filtering.
            from: contractorAlertFrom,
            to: ownerPhone,
          })
        } catch (e) {
          logTwilioSmsError('first-call celebration SMS', e)
        }
      }

      // Celebration email — high-impact visual, always delivered (Resend
      // domain verified). Lands alongside the regular lead email.
      try {
        const contractorEmail = await lookupOwnerEmail(tenant.user_id)
        if (contractorEmail) {
          const { subject, html, text } = renderFirstCallCelebrationEmail({
            toEmail: contractorEmail,
            contractorBusinessName: tenant.business_name || 'your business',
            ownerFirstName: ownerFirst,
            callerName: args.customer_name,
            callerPhone: phone,
            callerMessage: args.reason,
            dashboardUrl: `${appUrl}/dashboard`,
          })
          await sendEmail({ to: contractorEmail, subject, html, text })
        }
      } catch (e) {
        console.error('first-call celebration email failed:', e)
      }
    }
  } catch (e) {
    // Non-fatal — if the first_call_at claim throws (e.g. column doesn't
    // exist because migration hasn't run yet) we just skip the celebration.
    // Regular lead notifications above still fire. Log so we can see if
    // the migration ever lags behind a deploy.
    console.error('first-call celebration block threw:', e)
  }

  // 4b. EMERGENCY ESCALATION — for urgency=emergency, also place an outbound
  // call to the contractor with a TwiML voice alert. If they don't pick up in
  // 60s, fallback SMS to backup_owner_phone (or FALLBACK_OWNER_PHONE = Peter).
  if (args.urgency === 'emergency' && ownerPhone) {
    try {
      const appUrl =
        (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
          ? process.env.NEXT_PUBLIC_APP_URL
          : 'https://www.bellavego.com'
      const businessName = tenant.business_name || 'your business'
      const safeName = args.customer_name.replace(/[<>&"]/g, '')
      const safeReason = args.reason.replace(/[<>&"]/g, '')
      const phoneSpoken = (phone || 'no phone provided').replace(/[<>&"]/g, '')
      const twimlBody =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<Response>` +
        `<Say voice="Polly.Joanna-Neural">BellAveGo emergency call for ${businessName}. ` +
        `${safeName} just called and needs help right now. They said: ${safeReason}. ` +
        `Please call them back at ${phoneSpoken}. I'll repeat: ${phoneSpoken}.</Say>` +
        `<Pause length="1"/>` +
        `<Say voice="Polly.Joanna-Neural">Press 1 to hear this again, or hang up to call them now.</Say>` +
        `<Gather numDigits="1" timeout="3"><Say voice="Polly.Joanna-Neural">${safeName} at ${phoneSpoken}. ${safeReason}.</Say></Gather>` +
        `</Response>`

      const escalationCall = await twilioClient.calls.create({
        from: fromNumber,
        to: ownerPhone,
        twiml: twimlBody,
        timeout: 30,
        statusCallback: `${appUrl}/api/twilio/emergency-status?job_id=${jobRow?.id ?? ''}&user_id=${encodeURIComponent(tenant.user_id)}&from=${encodeURIComponent(fromNumber)}`,
        statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
        statusCallbackMethod: 'POST',
      })

      // Mark the job so we know an emergency call fired
      if (jobRow?.id) {
        await supabase
          .from('jobs')
          .update({
            emergency_escalated_at: new Date().toISOString(),
            emergency_call_sid: escalationCall.sid,
          })
          .eq('id', jobRow.id)
      }
    } catch (e) {
      console.error('emergency outbound call failed:', e)
      // Fallback: at least SMS the backup immediately if the call failed to dial
      try {
        const backupPhone =
          (tenant as { backup_owner_phone?: string }).backup_owner_phone ?? process.env.FALLBACK_OWNER_PHONE
        if (backupPhone && backupPhone !== ownerPhone) {
          await twilioClient.messages.create({
            body: `🚨 EMERGENCY (contractor unreachable) — ${args.customer_name} (${phone}) needs help: ${args.reason}. Please reach out.`,
            from: fromNumber,
            to: backupPhone,
          })
        }
      } catch {}
    }
  }

  // 5. ❌ Caller-facing "we'll call you back" SMS — REMOVED 2026-05-22.
  //
  // TCPA: the inbound caller (e.g. Sarah calling Mike's HVAC) has not
  // given explicit opt-in consent to receive automated SMS from us.
  // Inbound voice does NOT imply SMS consent — TCPA requires "prior
  // express written consent" for marketing or "prior express consent"
  // (verbal or written) for transactional/informational. Without a
  // verbal opt-in step on the call, this SMS exposed every contractor
  // to TCPA liability ($500–$1,500 per violation).
  //
  // Caller now learns Mike will call back via Emma's verbal close on
  // the line: "Mike will call you back in the next hour or two."
  // That's the caller-facing confirmation. Mike still gets the lead
  // alert SMS + email so the callback actually happens.
  //
  // To re-enable later: add a verbal opt-in step to take_message
  // ("Is it okay if we text you a confirmation?") + capture the
  // explicit yes/no on the call_log row. Only send SMS if consent=true.

  // 6. Upsert call_logs (powers Receptionist tier monthly call cap counter)
  try {
    await supabase.from('call_logs').upsert(
      {
        user_id: tenant.user_id,
        profile_id: tenant.user_id,
        call_sid: callSid,
        caller_phone: callerPhone,
        job_type: args.reason,
        job_created: true,
        booking_completed: true,
        job_id: jobRow?.id,
      },
      { onConflict: 'call_sid' },
    )
  } catch (e) {
    console.error('call_logs upsert failed:', e)
  }

  // 7. Cap check — if this call crossed the tenant's monthly cap, swap
  // their Vapi assistant into capacity mode so call N+1 hears a polite
  // "we've hit capacity" hangup instead of a full receptionist flow.
  // Fire-and-forget — must not block returning to Vapi.
  enforceCapIfCrossed(tenant.user_id, tenant.plan_tier).catch((e) =>
    console.error(`enforceCapIfCrossed (toolCalls path) for ${tenant.user_id}:`, e),
  )

  return { success: true }
}

// ── end-of-call-report (analytics + cap counter for non-booked calls) ──
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function handleEndOfCallReport(message: VapiServerMessage['message']) {
  if (!message) return NextResponse.json({ ok: true })
  const tenant = extractTenant(message)
  const callSid = message.call?.id ?? cryptoRandom()
  const callerPhone = message.call?.customer?.number ?? null
  const transcript = message.transcript ?? message.artifact?.transcript ?? null
  const summary = message.summary ?? message.analysis?.summary ?? null
  const messageCaptured = (message.toolCallList ?? message.toolCalls ?? []).some(
    (tc) => tc.function?.name === 'take_message',
  )

  // Demo calls don't write to DB — but we DO email Peter a summary of
  // every demo call regardless of whether take_message fired. Otherwise
  // when Emma roleplays a Sunset Air call and never reaches the bridge-
  // back-to-sales close (caller hung up, mode-switch mid-call, etc.),
  // Peter has zero visibility into what was discussed. He needs to see
  // every prospect interaction so he can follow up manually.
  if (tenant.is_demo) {
    // If take_message DID fire, the handleToolCalls path already emailed
    // Peter with the structured lead. Skip the summary email here to
    // avoid duplicate notifications for the same call.
    if (messageCaptured) {
      return NextResponse.json({ ok: true, demo: true, already_emailed_via_tool_call: true })
    }

    const peterAlertEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
    const transcriptText =
      typeof transcript === 'string' ? transcript : transcript ? JSON.stringify(transcript) : '(no transcript)'
    // Vapi's end-of-call-report message includes timestamps + endedReason
    // that aren't in our typed VapiServerMessage shape. Cast locally.
    const m = message as unknown as { startedAt?: string; endedAt?: string; endedReason?: string }
    const durationSec =
      m.endedAt && m.startedAt
        ? Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 1000)
        : null
    const endedReason = m.endedReason ?? null

    try {
      const subject = `📞 Demo call summary — no lead captured${durationSec ? ` (${durationSec}s)` : ''}`
      const html =
        `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">` +
        `<h2 style="color:#0B1F3A;margin:0 0 8px;">📞 Demo call ended without take_message</h2>` +
        `<p style="color:#4A6670;margin:0 0 16px;font-size:14px;">A prospect just called the demo line. Emma didn't capture a structured lead (call ended early, mode switch, or caller hung up mid-flow). Full transcript + AI summary below so you can follow up manually if there's anything actionable.</p>` +
        `<table style="font-size:13px;color:#0B1F3A;margin-bottom:16px;border-collapse:collapse;">` +
        `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Caller</td><td>${callerPhone ?? '(unknown)'}</td></tr>` +
        (durationSec ? `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Duration</td><td>${durationSec}s</td></tr>` : '') +
        (endedReason ? `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Ended reason</td><td>${endedReason}</td></tr>` : '') +
        `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Call ID</td><td style="font-family:monospace;font-size:11px;">${callSid}</td></tr>` +
        `</table>` +
        (summary
          ? `<h3 style="color:#0B1F3A;margin:16px 0 6px;font-size:14px;">AI summary</h3><p style="background:#F5F1EA;padding:12px;border-radius:8px;font-size:13px;color:#0B1F3A;margin:0 0 16px;">${escapeHtml(summary)}</p>`
          : '') +
        `<h3 style="color:#0B1F3A;margin:16px 0 6px;font-size:14px;">Full transcript</h3>` +
        `<pre style="background:#F5F1EA;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;color:#0B1F3A;margin:0;">${escapeHtml(transcriptText)}</pre>` +
        `</div>`
      const text =
        `Demo call ended without take_message\n\n` +
        `Caller: ${callerPhone ?? '(unknown)'}\n` +
        (durationSec ? `Duration: ${durationSec}s\n` : '') +
        (endedReason ? `Ended reason: ${endedReason}\n` : '') +
        `Call ID: ${callSid}\n\n` +
        (summary ? `AI summary:\n${summary}\n\n` : '') +
        `Transcript:\n${transcriptText}\n`
      await sendEmail({ to: peterAlertEmail, subject, html, text })
    } catch (e) {
      console.error('demo call summary email failed:', e)
    }
    return NextResponse.json({ ok: true, demo: true, summary_emailed: true })
  }

  if (!tenant.user_id) {
    return NextResponse.json({ ok: true, note: 'no tenant metadata' })
  }

  // Check if handleToolCalls already finalized this call (job_created=true
  // from the earlier tool-calls event). If so, end-of-call should ONLY merge
  // transcript + summary + cost — must NOT clobber job_created/booking_completed
  // back to false. Vapi's tool-calls event arrives first; end-of-call comes
  // ~1-2s later.
  let priorJobCreated = false
  try {
    const { data: priorRow } = await supabase
      .from('call_logs')
      .select('job_created, booking_completed')
      .eq('call_sid', callSid)
      .maybeSingle()
    priorJobCreated = !!(priorRow as { job_created?: boolean } | null)?.job_created
  } catch (e) {
    console.warn('end-of-call call_logs prior-row lookup failed:', e)
  }
  const effectiveMessageCaptured = messageCaptured || priorJobCreated

  try {
    await supabase.from('call_logs').upsert(
      {
        user_id: tenant.user_id,
        profile_id: tenant.user_id,
        call_sid: callSid,
        caller_phone: callerPhone,
        transcript: typeof transcript === 'string' ? transcript : transcript ? JSON.stringify(transcript) : null,
        summary,
        job_created: effectiveMessageCaptured,
        booking_completed: effectiveMessageCaptured,
        // Vapi reports actual COGS per call in message.cost — capture it so
        // the founder dashboard can show real-time spend instead of an
        // estimate. Column added in sql/2026-05-24-call-logs-cost.sql.
        cost_usd: (message as unknown as { cost?: number })?.cost ?? null,
      },
      { onConflict: 'call_sid' },
    )
  } catch (e) {
    console.error('end-of-call call_logs upsert failed:', e)
  }

  // Silent-failure safety net: if take_message DIDN'T fire on a tenant
  // call (caller hung up early, Emma chatted but never captured, tool
  // arguments failed JSON-parse, etc.), the contractor would get ZERO
  // notification of what happened. They paid for a receptionist; even a
  // "missed half-conversation" deserves an alert. Mirror the demo branch.
  //
  // Skipped when EITHER messageCaptured (this event) OR priorJobCreated
  // (handleToolCalls already finalized in the earlier tool-calls event)
  // — second email would be a duplicate AND incorrectly tell the
  // contractor "no message captured" when one actually was.
  if (!effectiveMessageCaptured) {
    try {
      // Fetch contractor email + identifying info. Cheap (~10ms).
      const { data: prof } = await supabase
        .from('profiles')
        .select('business_name, owner_first_name, owner_phone, timezone')
        .eq('user_id', tenant.user_id)
        .maybeSingle()
      const contractorEmail = await lookupOwnerEmail(tenant.user_id)
      // Also email Peter so he sees the gap during the early-customer phase.
      const peterAlertEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'

      const businessName = (prof as { business_name?: string | null } | null)?.business_name || 'your business'
      const m = message as unknown as { startedAt?: string; endedAt?: string; endedReason?: string }
      const durationSec =
        m.endedAt && m.startedAt
          ? Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 1000)
          : null
      const endedReason = m.endedReason ?? null
      const transcriptText =
        typeof transcript === 'string'
          ? transcript
          : transcript
          ? JSON.stringify(transcript)
          : '(no transcript)'

      const subject = `📞 Missed-info call to ${businessName}${durationSec ? ` (${durationSec}s)` : ''}`
      const html =
        `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">` +
        `<h2 style="color:#0B1F3A;margin:0 0 8px;">📞 Call answered but no message captured</h2>` +
        `<p style="color:#4A6670;margin:0 0 16px;font-size:14px;">A caller reached your BellAveGo receptionist but Emma didn't capture a structured lead — they probably hung up early, didn't share enough to act on, or Emma got cut off. Transcript + summary below so you can follow up if it's actionable.</p>` +
        `<table style="font-size:13px;color:#0B1F3A;margin-bottom:16px;border-collapse:collapse;">` +
        `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Caller</td><td>${callerPhone ?? '(unknown)'}</td></tr>` +
        (durationSec ? `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Duration</td><td>${durationSec}s</td></tr>` : '') +
        (endedReason ? `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Ended reason</td><td>${endedReason}</td></tr>` : '') +
        `<tr><td style="padding:4px 8px 4px 0;color:#4A6670;">Call ID</td><td style="font-family:monospace;font-size:11px;">${callSid}</td></tr>` +
        `</table>` +
        (summary
          ? `<h3 style="color:#0B1F3A;margin:16px 0 6px;font-size:14px;">AI summary</h3><p style="background:#F5F1EA;padding:12px;border-radius:8px;font-size:13px;color:#0B1F3A;margin:0 0 16px;">${escapeHtml(summary)}</p>`
          : '') +
        `<h3 style="color:#0B1F3A;margin:16px 0 6px;font-size:14px;">Transcript</h3>` +
        `<pre style="background:#F5F1EA;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;color:#0B1F3A;margin:0;">${escapeHtml(transcriptText)}</pre>` +
        (callerPhone ? `<p style="margin:20px 0 0;"><a href="tel:${callerPhone}" style="display:inline-block;padding:12px 20px;background:#0AA89F;color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px;">📲 Call back ${callerPhone}</a></p>` : '') +
        `</div>`
      const text =
        `Call answered but no message captured\n\n` +
        `Caller: ${callerPhone ?? '(unknown)'}\n` +
        (durationSec ? `Duration: ${durationSec}s\n` : '') +
        (endedReason ? `Ended reason: ${endedReason}\n` : '') +
        `Call ID: ${callSid}\n\n` +
        (summary ? `AI summary:\n${summary}\n\n` : '') +
        `Transcript:\n${transcriptText}\n`

      // Send to contractor (their Clerk primary email) AND to Peter so he
      // sees the silent-failure shape during early-customer phase.
      const recipients: string[] = []
      if (contractorEmail) recipients.push(contractorEmail)
      if (peterAlertEmail && peterAlertEmail !== contractorEmail) recipients.push(peterAlertEmail)
      if (recipients.length > 0) {
        await sendEmail({ to: recipients, subject, html, text })
      } else {
        console.warn('end-of-call: no recipients for missed-info email (tenant', tenant.user_id, ')')
      }
    } catch (e) {
      console.error('tenant missed-info email failed:', e)
    }
  }

  // Cap check — same fire-and-forget pattern as the toolCalls path so
  // a hangup-only call (no take_message) still counts toward the cap.
  // Without this, a caller who hits then hangs up wouldn't trigger
  // the capacity-mode swap even though the call already cost us money.
  enforceCapIfCrossed(tenant.user_id, tenant.plan_tier).catch((e) =>
    console.error(`enforceCapIfCrossed (endOfCall path) for ${tenant.user_id}:`, e),
  )

  return NextResponse.json({ ok: true })
}

// ── Cap enforcement ─────────────────────────────────────────────
/**
 * After a call ends, count this tenant's month-to-date inbound calls.
 * If they've crossed their plan_tier cap AND aren't already in capacity
 * mode, PATCH their Vapi assistant to "capacity mode" so the NEXT call
 * hears a polite hangup instead of running the full receptionist flow.
 *
 * Idempotent — short-circuits if already in capacity mode (no double-PATCH).
 *
 * Cost note: there's a small race window where calls N+1, N+2 might
 * land within ~2 seconds of N triggering the swap. Those still hear the
 * normal Emma. Acceptable — worst case is ~$1 in extra calls before the
 * swap propagates.
 */
async function enforceCapIfCrossed(userId: string, planTier: string | null | undefined) {
  if (!userId) return
  const cap = callCapForTier(planTier)
  if (cap >= 999999) return  // unlimited tier — never swap

  // Count month-to-date calls
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', monthStart.toISOString())
  const calls = count ?? 0

  if (calls < cap) return  // under cap — nothing to do

  // Already in capacity mode? Short-circuit.
  const { data: profile } = await supabase
    .from('profiles')
    .select('capacity_mode_at')
    .eq('user_id', userId)
    .maybeSingle()
  const alreadyCapped = !!(profile as unknown as { capacity_mode_at?: string | null })?.capacity_mode_at
  if (alreadyCapped) return

  console.log(`[cap-enforce] ${userId} hit cap (${calls}/${cap}) — switching to capacity mode`)
  await switchToCapacityMode(userId)
}

// ── helpers ─────────────────────────────────────────────────────

type TenantMeta = {
  user_id: string
  business_name?: string | null
  owner_phone?: string | null
  backup_owner_phone?: string | null
  owner_first_name?: string | null
  plan_tier?: string | null
  twilio_number?: string | null
  is_demo?: boolean
}

function extractTenant(message: VapiServerMessage['message']): TenantMeta {
  const md = (message?.assistant?.metadata ?? message?.call?.assistantOverrides?.metadata ?? {}) as Record<string, unknown>

  // Demo detection: prefer metadata flag, fall back to checking the called
  // number against TWILIO_DEMO_NUMBER env var. Vapi has been observed to
  // drop assistantOverrides.metadata in webhook payloads, so we can't rely
  // on the flag alone — without this fallback, demo calls leak into tenant
  // tables and skip the Peter hot-lead SMS.
  const calledNumber =
    (message?.call as { phoneNumber?: { number?: string }; customer?: { number?: string } })?.phoneNumber?.number ??
    null
  // Demo number fallback — env var preferred but a missing env should
  // never block the lead-capture pipeline on the demo line. After we
  // baked the sales prompt directly into the Vapi assistant (skipping
  // the override path), assistantOverrides.metadata.is_demo is never
  // set per-call → the env-or-literal match is the ONLY way demo
  // detection works at this point.
  const DEMO_NUMBER_FALLBACK = '+16514677829'
  const demoEnv = process.env.TWILIO_DEMO_NUMBER || DEMO_NUMBER_FALLBACK
  const isDemoByNumber = !!(calledNumber && calledNumber === demoEnv)
  const isDemo = md.is_demo === true || isDemoByNumber

  // Surface in logs whenever the fallback rescues us so we can spot the
  // metadata round-trip getting flaky in production.
  if (isDemoByNumber && md.is_demo !== true) {
    console.warn('extractTenant: demo detected by called-number fallback (metadata.is_demo missing)')
  }

  return {
    user_id: (md.user_id as string) ?? (isDemo ? 'demo' : ''),
    business_name: (md.business_name as string) ?? (isDemo ? 'BellAveGo (sales)' : null),
    plan_tier: (md.plan_tier as string) ?? (isDemo ? 'demo' : null),
    twilio_number: (md.twilio_number as string) ?? calledNumber ?? null,
    owner_phone: (md.owner_phone as string) ?? null,
    backup_owner_phone: (md.backup_owner_phone as string) ?? null,
    owner_first_name: (md.owner_first_name as string) ?? null,
    is_demo: isDemo,
  }
}

type TakeMessageArgs = {
  customer_name: string
  customer_phone: string
  customer_address?: string
  reason: string
  urgency: 'emergency' | 'soon' | 'whenever' | string
}

function parseToolArgs(args: unknown): TakeMessageArgs {
  const empty: TakeMessageArgs = { customer_name: '', customer_phone: '', reason: '', urgency: 'soon' }
  if (typeof args === 'string') {
    try {
      return { ...empty, ...(JSON.parse(args) as Partial<TakeMessageArgs>) }
    } catch {
      return empty
    }
  }
  return { ...empty, ...((args as Partial<TakeMessageArgs>) ?? {}) }
}

function cryptoRandom(): string {
  return 'vapi_' + Math.random().toString(36).slice(2, 12)
}

/**
 * Log Twilio SMS failures with distinct prefixes so 30034 (A2P unregistered-
 * sender carrier block) can be filtered out from real outages in the logs.
 * The contractor-lead email path is the workaround until A2P is approved —
 * once approved, 30034 should disappear and this stays as a clean error log.
 */
function logTwilioSmsError(context: string, e: unknown): void {
  const code = (e as { code?: number })?.code
  const msg = (e as Error)?.message ?? String(e)
  if (code === 30034) {
    console.warn(`[SMS_CARRIER_BLOCKED] ${context} — Twilio 30034 (A2P unregistered). Email fallback covers it.`)
    return
  }
  if (code === 30003 || code === 30005 || code === 30006) {
    console.warn(`[SMS_UNDELIVERABLE] ${context} — Twilio ${code}: ${msg}`)
    return
  }
  console.error(`[SMS_FAILED] ${context} — Twilio ${code ?? 'unknown'}: ${msg}`)
}

// ── Types (narrow shape of Vapi's server messages) ──────────────
type VapiToolCall = {
  id: string
  function?: { name?: string; arguments?: unknown }
}

type VapiServerMessage = {
  message?: {
    type: 'tool-calls' | 'end-of-call-report' | string
    call?: {
      id?: string
      customer?: { number?: string }
      phoneNumber?: { number?: string }
      assistantOverrides?: { metadata?: Record<string, unknown> }
    }
    assistant?: { metadata?: Record<string, unknown> }
    toolCalls?: VapiToolCall[]
    toolCallList?: VapiToolCall[]
    transcript?: string | unknown
    summary?: string
    analysis?: { summary?: string }
    artifact?: { transcript?: string }
  }
}
