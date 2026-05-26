import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { verifyVapiSignature } from '@/lib/vapi'
import { findAvailableSlots } from '@/lib/calendar/availability'
import { createGoogleEvent, type CalendarConnectionRow } from '@/lib/calendar/google'
import { createMicrosoftEvent } from '@/lib/calendar/microsoft'
import { createAppointment } from '@/lib/calendar/appointments'
import { sendEmail, renderAppointmentBookedEmail, renderLeadAlertEmail, renderBookingAlertEmail } from '@/lib/email'
import { lookupOwnerEmail } from '@/lib/notify'
import { firePushAsync } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!,
)

/**
 * Vapi tool endpoint — `book_appointment`.
 *
 * Called by Emma AFTER the caller picks a slot from check_availability.
 * Race-protected: re-fetches availability inside this handler immediately
 * before writing, so two concurrent callers can't double-book the same slot.
 *
 * Flow:
 *   1. Pull tenant from Vapi metadata
 *   2. Re-check availability for the picked slot → conflict? offer alternatives
 *   3. Load the contractor's Google connection (other providers Phase 2)
 *   4. Create the event in Google Calendar
 *   5. Insert job row for the dashboard
 *   6. SMS caller (confirmation) + contractor (booking alert)
 *   7. Return human-readable confirmation to Vapi → Emma reads it
 *
 * Demo number short-circuit: returns a friendly canned confirmation without
 * touching any real calendar or sending SMS to a fake number.
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

  const calls = message.toolCalls ?? message.toolCallList ?? []
  const results: Array<{ toolCallId: string; result: string }> = []

  const md = (message.assistant?.metadata ?? message.call?.assistantOverrides?.metadata ?? {}) as Record<string, unknown>
  const userId = (md.user_id as string) || ''
  const businessName = (md.business_name as string) || 'the business'
  const ownerPhone = (md.owner_phone as string) || process.env.FALLBACK_OWNER_PHONE || ''
  const tenantTwilioNumber = (md.twilio_number as string) || process.env.TWILIO_PHONE_NUMBER || ''

  // Demo detection — same fallback pattern as end-of-call-report
  const calledNumber = message.call?.phoneNumber?.number ?? null
  const isDemoByNumber = !!(process.env.TWILIO_DEMO_NUMBER && calledNumber === process.env.TWILIO_DEMO_NUMBER)
  const isDemo = md.is_demo === true || isDemoByNumber

  const callerPhone = message.call?.customer?.number ?? null

  for (const tc of calls) {
    if (tc.function?.name !== 'book_appointment') {
      results.push({ toolCallId: tc.id, result: 'Unknown tool — ignored.' })
      continue
    }

    const args = parseToolArgs(tc.function.arguments)

    if (isDemo) {
      results.push({
        toolCallId: tc.id,
        result:
          `Perfect — you're booked. The contractor's calendar has been updated and you'll get a confirmation text shortly. ` +
          `Anything else, ${args.customer_name || 'there'}?`,
      })
      continue
    }

    if (!userId) {
      results.push({ toolCallId: tc.id, result: 'No tenant context — please take a message instead.' })
      continue
    }

    if (!args.start_iso || !args.customer_name) {
      results.push({ toolCallId: tc.id, result: 'Missing slot or name — please ask the caller again and retry.' })
      continue
    }

    const startDate = new Date(args.start_iso)
    if (isNaN(startDate.getTime())) {
      results.push({ toolCallId: tc.id, result: 'Invalid start time — please offer a different slot.' })
      continue
    }
    const durationMin = args.duration_min ?? 90
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)

    // ── Auto-booking policy guard (defense-in-depth) ──
    // The check_availability tool already filters by these values, but we
    // re-enforce here so a misbehaving model that fabricates an out-of-window
    // ISO can't slip past. Source of truth = profiles row, not Vapi metadata.
    const { data: policyRow } = await supabase
      .from('profiles')
      .select('auto_booking_enabled, auto_booking_min_hour, auto_booking_max_hour, timezone')
      .eq('user_id', userId)
      .maybeSingle()
    const policy = (policyRow as {
      auto_booking_enabled?: boolean | null
      auto_booking_min_hour?: number | null
      auto_booking_max_hour?: number | null
      timezone?: string | null
    } | null)
    if (policy?.auto_booking_enabled !== true) {
      results.push({
        toolCallId: tc.id,
        result: 'Auto-booking is off for this contractor — take a message and the owner will call back.',
      })
      continue
    }
    if (policy.auto_booking_min_hour != null || policy.auto_booking_max_hour != null) {
      // Read slot hour in the contractor's local timezone (NOT hardcoded
      // Chicago — a Phoenix or LA contractor's 5pm window must run against
      // their wall clock). profile.timezone is authoritative; backfilled to
      // America/Chicago by sql/2026-05-22-timezone-default.sql.
      const tz = policy.timezone || 'America/Chicago'
      const localHourStr = startDate.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false })
      const localHour = parseInt(localHourStr, 10)
      if (Number.isFinite(localHour)) {
        if (policy.auto_booking_min_hour != null && localHour < policy.auto_booking_min_hour) {
          results.push({
            toolCallId: tc.id,
            result: `That time is outside the booking window for this contractor. Offer a slot at or after ${policy.auto_booking_min_hour}:00 instead, or take a message.`,
          })
          continue
        }
        if (policy.auto_booking_max_hour != null && localHour >= policy.auto_booking_max_hour) {
          results.push({
            toolCallId: tc.id,
            result: `That time is outside the booking window for this contractor. Offer a slot before ${policy.auto_booking_max_hour}:00 instead, or take a message.`,
          })
          continue
        }
      }
    }

    // ── Race protection — re-check availability for this exact slot ──
    const avail = await findAvailableSlots({
      userId,
      daysAhead: Math.max(1, Math.ceil((startDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) + 1),
      durationMin,
      maxSlots: 12,
    })
    if (!avail.connected) {
      results.push({
        toolCallId: tc.id,
        result: 'Calendar is no longer connected — take a message and the owner will call back.',
      })
      continue
    }
    const stillFree = avail.slots.some((s) => {
      const slotStart = new Date(s.start).getTime()
      // tolerate 5-min drift in case rounding diverges
      return Math.abs(slotStart - startDate.getTime()) < 5 * 60 * 1000
    })
    if (!stillFree) {
      const alts = avail.slots.slice(0, 3).map((s) => s.label).join('; ')
      results.push({
        toolCallId: tc.id,
        result:
          alts
            ? `That slot just got booked. Offer these instead: ${alts}.`
            : `That slot just got booked and nothing else opened today. Take a message and let them know the owner will call back to find a time.`,
      })
      continue
    }

    // ── NATIVE-FIRST BOOKING (2026-05-26) ──
    // BellAveGo's own calendar (jobs table) is the source of truth. We
    // insert the appointment row FIRST so the contractor sees it in their
    // dashboard immediately, no external calendar required. After the
    // native row is in place, we OPTIONALLY push a copy to Google /
    // Microsoft if the contractor has connected one of those — that's
    // best-effort, sync-out only, never blocks the booking.
    //
    // Pull profile timezone for human-readable formatting (replaces the
    // old "primary connection.timezone" lookup since native users may not
    // have any external connection).
    const { data: tzProfile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle()
    const bookingTz = (tzProfile as { timezone?: string | null } | null)?.timezone || 'America/Chicago'

    // Upsert customer (lookup-or-create) so the appointment links cleanly.
    let customerId: string | undefined
    if (callerPhone) {
      try {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', callerPhone)
          .eq('user_id', userId)
          .maybeSingle()
        if (existing) {
          customerId = existing.id
        } else {
          const { data: created } = await supabase
            .from('customers')
            .insert({ user_id: userId, name: args.customer_name, phone: callerPhone })
            .select('id')
            .single()
          customerId = created?.id
        }
      } catch (e) {
        console.error('book_appointment: customer upsert failed', e)
      }
    }

    // Native insert via the appointments lib — sets scheduled_at /
    // scheduled_end_at as proper TIMESTAMPTZ + populates the legacy
    // scheduled_time text via a separate update so the dashboard agenda
    // human-readable column stays consistent.
    const native = await createAppointment({
      userId,
      scheduledAt:    startDate.toISOString(),
      scheduledEndAt: endDate.toISOString(),
      durationMin,
      customerId:     customerId ?? null,
      customerName:   args.customer_name,
      customerPhone:  callerPhone,
      jobType:        args.service_summary || 'Appointment',
      blockType:      'job',
      createdVia:     'ai',
      status:         'scheduled',
    })

    if (!native) {
      results.push({
        toolCallId: tc.id,
        result:
          'Could not save the booking to our system. Take a message and the owner will call back to confirm.',
      })
      continue
    }

    const provisionalJobId = native.id

    // Backfill the legacy human-readable scheduled_time column so the
    // dashboard agenda + SMS render the right wall-clock string.
    try {
      await supabase
        .from('jobs')
        .update({ scheduled_time: formatSlotForHumans(startDate, bookingTz) })
        .eq('id', provisionalJobId)
    } catch { /* non-fatal */ }

    // ── OPTIONAL outbound sync (Google + Microsoft) ──
    // Push the event to the contractor's external calendar so it shows
    // up on their phone too. Best-effort: a failure here does NOT undo
    // the native booking — the contractor still sees the appointment in
    // BellAveGo. We log the external id so future edits can sync.
    const { data: connRows } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .in('provider', ['google', 'microsoft'])
      .eq('enabled', true)
    const googleConn    = (connRows ?? []).find((c) => c.provider === 'google')    as CalendarConnectionRow | undefined
    const microsoftConn = (connRows ?? []).find((c) => c.provider === 'microsoft') as CalendarConnectionRow | undefined

    const eventSummary = `BellAveGo · ${args.service_summary || 'Appointment'} — ${args.customer_name}`
    const eventDescription =
      `Customer: ${args.customer_name}\n` +
      `Phone: ${callerPhone || '(captured from caller ID)'}\n` +
      `Service: ${args.service_summary || '(see call summary)'}\n\n` +
      `Booked via BellAveGo AI on ${new Date().toLocaleString('en-US', { timeZone: bookingTz })}.`

    let externalEventId: string | undefined
    let externalProvider: 'google' | 'microsoft' | undefined

    if (googleConn) {
      const r = await createGoogleEvent({
        connection: googleConn,
        event: {
          summary: eventSummary,
          description: eventDescription,
          startISO: startDate.toISOString(),
          endISO: endDate.toISOString(),
          timezone: bookingTz,
          attendeePhone: callerPhone || undefined,
        },
      })
      if (r.ok) {
        externalEventId = r.eventId
        externalProvider = 'google'
      } else {
        console.warn('book_appointment: google sync-out skipped:', r.error)
      }
    } else if (microsoftConn) {
      const r = await createMicrosoftEvent({
        connection: microsoftConn,
        event: {
          summary: eventSummary,
          description: eventDescription,
          startISO: startDate.toISOString(),
          endISO: endDate.toISOString(),
          timezone: bookingTz,
          attendeePhone: callerPhone || undefined,
        },
      })
      if (r.ok) {
        externalEventId = r.eventId
        externalProvider = 'microsoft'
      } else {
        console.warn('book_appointment: microsoft sync-out skipped:', r.error)
      }
    }

    // Stamp the external id on the job row for future bidirectional sync
    // (we'll need it to update / delete the external event when the
    // contractor reschedules or cancels in BellAveGo).
    if (externalEventId && externalProvider) {
      try {
        await supabase
          .from('jobs')
          .update({
            external_event_id: externalEventId,
            external_provider: externalProvider,
            // Keep the legacy google_event_id field populated too so older
            // dashboard code that reads from it doesn't break.
            ...(externalProvider === 'google' ? { google_event_id: externalEventId } : {}),
          })
          .eq('id', provisionalJobId)
      } catch { /* non-fatal */ }
    }

    // ── SMS the caller (confirmation) ──
    //
    // TCPA posture: caller actively scheduled an appointment via Emma
    // on the live call — that's the strongest safe-harbor scenario
    // (transactional confirmation of consumer-initiated action). We
    // still include a visible STOP opt-out per CTIA best practices and
    // for defense-in-depth against any aggressive carrier filter that
    // wants an explicit unsubscribe phrase in the body.
    const slotLabel = formatSlotForHumans(startDate, bookingTz)
    if (callerPhone) {
      try {
        await twilioClient.messages.create({
          body:
            `Hi ${args.customer_name}! Confirmed: ${args.service_summary || 'your appointment'} on ${slotLabel} with ${businessName}. ` +
            `Reply to this text to reschedule. — BellAveGo. Reply STOP to opt out.`,
          from: tenantTwilioNumber,
          to: callerPhone,
        })
      } catch (e) {
        console.error('caller confirmation SMS failed:', e)
      }
    }

    // ── SMS the contractor (booking alert) ──
    if (ownerPhone) {
      try {
        await twilioClient.messages.create({
          body:
            `📅 AI BOOKED · BellAveGo\n\n` +
            `👤 ${args.customer_name}\n` +
            `📞 ${callerPhone || 'no phone captured'}\n` +
            `🔧 ${args.service_summary || 'Appointment'}\n` +
            `🕐 ${slotLabel}\n\n` +
            `Already on your BellAveGo calendar (look for the orange "AI Booked" event). View: https://www.bellavego.com/dashboard/calendar`,
          from: tenantTwilioNumber,
          to: ownerPhone,
        })
      } catch (e) {
        console.error('contractor booking alert SMS failed:', e)
      }
    }

    // ── EMAIL the contractor (booking alert) ──
    // Pairs with the SMS above. During A2P registration the SMS is
    // carrier-blocked (error 30034); the email is the reliable channel.
    // Stays in place post-A2P as a second-channel for important bookings.
    try {
      const contractorEmail = await lookupOwnerEmail(userId)
      if (contractorEmail) {
        const appUrl =
          (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
            ? process.env.NEXT_PUBLIC_APP_URL
            : 'https://www.bellavego.com'
        const { subject, html, text } = renderBookingAlertEmail({
          toEmail: contractorEmail,
          contractorBusinessName: businessName,
          callerName: args.customer_name,
          callerPhone,
          serviceSummary: args.service_summary || 'Appointment',
          slotLabel,
          calendarEventUrl: `${appUrl}/dashboard/calendar`,
          dashboardUrl: `${appUrl}/dashboard`,
        })
        await sendEmail({ to: contractorEmail, subject, html, text })
      } else {
        console.warn('booking alert email skipped — no Clerk email for', userId)
      }
    } catch (e) {
      console.error('booking alert email failed:', e)
    }

    // ── EMAIL the contractor (BellAveGo customer) — booking confirmation ──
    // Resilient channel: SMS to contractor often blocked by carriers during
    // A2P 10DLC registration. Email gives them a permanent searchable record
    // of every AI-booked appointment in their inbox.
    const appUrl =
      (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost'))
        ? process.env.NEXT_PUBLIC_APP_URL
        : 'https://www.bellavego.com'
    try {
      const contractorEmail = await lookupOwnerEmail(userId)
      if (contractorEmail) {
        const { subject, html, text } = renderAppointmentBookedEmail({
          toEmail: contractorEmail,
          contractorBusinessName: businessName,
          callerName: args.customer_name,
          callerPhone,
          serviceSummary: args.service_summary || 'Appointment',
          slotLabel,
          callTimeISO: new Date().toISOString(),
          calendarEventUrl: `${appUrl}/dashboard/calendar`,
          dashboardUrl: `${appUrl}/dashboard`,
          // Render "Booked at" in the contractor's wall clock — policy.timezone
          // comes from the same SELECT used to enforce the booking window above.
          contractorTimezone: policy?.timezone ?? bookingTz,
        })
        await sendEmail({ to: contractorEmail, subject, html, text })
      } else {
        console.warn('book_appointment: no Clerk email for', userId, '— skipped contractor confirmation email')
      }
    } catch (e) {
      console.error('book_appointment: contractor confirmation email failed:', e)
    }

    // ── EMAIL Peter — operational visibility on every booking ──
    // Mirrors the lead-alert pattern from end-of-call-report. Subject uses
    // the BOOKED prefix so Peter's inbox makes it clear what happened.
    const peterAlertEmail = process.env.FALLBACK_OWNER_EMAIL || 'bellavegollc@gmail.com'
    if (peterAlertEmail) {
      try {
        const { html, text } = renderLeadAlertEmail({
          toEmail: peterAlertEmail,
          contractorBusinessName: businessName,
          contractorOwnerName: 'the owner',
          contractorPhone: ownerPhone,
          callerName: args.customer_name,
          callerPhone,
          callerMessage: `BOOKED for ${slotLabel} — ${args.service_summary || 'Appointment'}`,
          urgency: 'soon',
          twilioNumberCalled: tenantTwilioNumber || null,
          callTimeISO: new Date().toISOString(),
          forwardPageUrl: `${appUrl}/admin/forward`,
        })
        await sendEmail({
          to: peterAlertEmail,
          subject: `📅 BOOKED · ${businessName} — ${args.customer_name} · ${slotLabel}`,
          html,
          text,
        })
      } catch (e) {
        console.error('book_appointment: peter alert email failed:', e)
      }
    }

    // ── PUSH NOTIFICATION to contractor's PWA ──
    // Fires alongside SMS + email so PWA-installed contractors get instant
    // banner on their phone. requireInteraction=true keeps the notification
    // visible until tapped (bookings are high-value events worth not missing).
    firePushAsync(userId, {
      title: `📅 AI booked — ${args.customer_name}`,
      body:
        `${args.service_summary || 'Appointment'}\n` +
        `🕐 ${slotLabel}` +
        (callerPhone ? `\n📞 ${callerPhone}` : ''),
      url: `/dashboard?job=${provisionalJobId}`,
      tag: `booking-${provisionalJobId}`,
      urgency: 'soon',
      requireInteraction: true,
      data: { job_id: provisionalJobId, caller_phone: callerPhone, event_url: `/dashboard/calendar` },
    })

    results.push({
      toolCallId: tc.id,
      result:
        `Booked. Tell the caller they're confirmed for ${slotLabel}, they'll get a text confirmation, and thank them by name.`,
    })
  }

  return NextResponse.json({ results })
}

function formatSlotForHumans(d: Date, tz: string): string {
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  })
}

type VapiToolCall = {
  id: string
  function?: { name?: string; arguments?: unknown }
}

type VapiServerMessage = {
  message?: {
    type: 'tool-calls' | string
    call?: {
      id?: string
      phoneNumber?: { number?: string }
      customer?: { number?: string }
      assistantOverrides?: { metadata?: Record<string, unknown> }
    }
    assistant?: { metadata?: Record<string, unknown> }
    toolCalls?: VapiToolCall[]
    toolCallList?: VapiToolCall[]
  }
}

function parseToolArgs(args: unknown): {
  start_iso?: string
  duration_min?: number
  customer_name?: string
  service_summary?: string
} {
  if (typeof args === 'string') {
    try { return JSON.parse(args) } catch { return {} }
  }
  return (args as Record<string, unknown>) ?? {}
}
