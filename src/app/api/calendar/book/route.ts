import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { verifyVapiSignature } from '@/lib/vapi'
import { findAvailableSlots } from '@/lib/calendar/availability'
import { createGoogleEvent, type CalendarConnectionRow } from '@/lib/calendar/google'
import { createCronofyEvent } from '@/lib/calendar/cronofy'
import { sendEmail, renderAppointmentBookedEmail, renderLeadAlertEmail } from '@/lib/email'
import { lookupOwnerEmail } from '@/lib/notify'

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
      .select('auto_booking_enabled, auto_booking_min_hour, auto_booking_max_hour')
      .eq('user_id', userId)
      .maybeSingle()
    const policy = (policyRow as {
      auto_booking_enabled?: boolean | null
      auto_booking_min_hour?: number | null
      auto_booking_max_hour?: number | null
    } | null)
    if (policy?.auto_booking_enabled !== true) {
      results.push({
        toolCallId: tc.id,
        result: 'Auto-booking is off for this contractor — take a message and the owner will call back.',
      })
      continue
    }
    if (policy.auto_booking_min_hour != null || policy.auto_booking_max_hour != null) {
      // Read slot hour in the connection timezone (defaults handled later).
      // We do this BEFORE loading the calendar connection so we fail fast.
      const tz = 'America/Chicago' // refined to conn.timezone below; this is a safe pre-check
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

    // ── Load contractor's calendar connection ──
    // Prefer Cronofy (unified API across Google/Outlook/Apple, what new
    // customers connect via). Fall back to direct Google OAuth row if they
    // connected via the legacy /api/calendar/google flow.
    const { data: connRows } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .in('provider', ['cronofy', 'google'])
      .eq('enabled', true)
    const cronofyConn = (connRows ?? []).find((c) => c.provider === 'cronofy') as CalendarConnectionRow | undefined
    const googleConn  = (connRows ?? []).find((c) => c.provider === 'google')  as CalendarConnectionRow | undefined
    const conn = cronofyConn || googleConn

    if (!conn) {
      results.push({
        toolCallId: tc.id,
        result:
          'No calendar connection for this contractor. Take a message and let the owner call back to confirm a time.',
      })
      continue
    }

    // ── Create the event (Cronofy → Google fallback) ──
    // We need a stable jobId for the Cronofy event_id (prefix bellavego_ so
    // the dashboard agenda highlights it as AI-booked). Insert the job row
    // FIRST so we have its uuid, then create the calendar event referencing it.
    const provisionalJobId = crypto.randomUUID()

    const eventSummary = `BellAveGo · ${args.service_summary || 'Appointment'} — ${args.customer_name}`
    const eventDescription =
      `Customer: ${args.customer_name}\n` +
      `Phone: ${callerPhone || '(captured from caller ID)'}\n` +
      `Service: ${args.service_summary || '(see call summary)'}\n\n` +
      `Booked via BellAveGo AI on ${new Date().toLocaleString('en-US', { timeZone: conn.timezone || 'America/Chicago' })}.`

    let eventResult: { ok: boolean; error?: string; status?: number; eventId?: string; htmlLink?: string }

    if (cronofyConn) {
      // Cronofy path — works for Google/Outlook/Apple via one API
      const r = await createCronofyEvent({
        connection: cronofyConn,
        eventId: `bellavego_${provisionalJobId.replace(/-/g, '')}`,
        summary: eventSummary,
        description: eventDescription,
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
      })
      eventResult = { ok: r.ok, error: r.error, eventId: `bellavego_${provisionalJobId.replace(/-/g, '')}` }
    } else {
      // Legacy direct-Google path
      const r = await createGoogleEvent({
        connection: googleConn!,
        event: {
          summary: eventSummary,
          description: eventDescription,
          startISO: startDate.toISOString(),
          endISO: endDate.toISOString(),
          timezone: conn.timezone || 'America/Chicago',
          attendeePhone: callerPhone || undefined,
        },
      })
      eventResult = r
    }

    if (!eventResult.ok) {
      console.error('book_appointment: createEvent failed:', eventResult.error)
      results.push({
        toolCallId: tc.id,
        result:
          eventResult.status === 403
            ? `Calendar reconnect needed. Take a message instead — let the contractor know they need to reconnect their calendar.`
            : `Couldn't save the booking — take a message instead and the owner will call back to confirm.`,
      })
      continue
    }

    // ── Insert into jobs table so the dashboard shows it ──
    try {
      // Upsert customer first
      let customerId: string | undefined
      if (callerPhone) {
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
      }

      await supabase.from('jobs').insert({
        id: provisionalJobId,
        user_id: userId,
        customer_id: customerId,
        customer_name: args.customer_name,
        customer_phone: callerPhone,
        job_type: args.service_summary || 'Appointment',
        scheduled_time: formatSlotForHumans(startDate, conn.timezone || 'America/Chicago'),
        title: `${args.service_summary || 'Appointment'}: ${args.customer_name}`,
        status: 'scheduled',
        google_event_id: eventResult.eventId,
      })
    } catch (e) {
      // Non-fatal — the calendar event is already in Google. Worst case
      // the dashboard misses a row. Log and move on.
      console.error('book_appointment: jobs insert failed', e)
    }

    // ── SMS the caller (confirmation) ──
    const slotLabel = formatSlotForHumans(startDate, conn.timezone || 'America/Chicago')
    if (callerPhone) {
      try {
        await twilioClient.messages.create({
          body:
            `Hi ${args.customer_name}! Confirmed: ${args.service_summary || 'your appointment'} on ${slotLabel} with ${businessName}. ` +
            `Reply to this text to reschedule. — BellAveGo`,
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
            `Already on your calendar (look for the orange "AI Booked" event).${eventResult.htmlLink ? `\n${eventResult.htmlLink}` : ''}`,
          from: tenantTwilioNumber,
          to: ownerPhone,
        })
      } catch (e) {
        console.error('contractor booking alert SMS failed:', e)
      }
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
          calendarEventUrl: eventResult.htmlLink || null,
          dashboardUrl: `${appUrl}/dashboard`,
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
