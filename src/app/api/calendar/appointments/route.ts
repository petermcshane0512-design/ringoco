import { NextRequest, NextResponse } from 'next/server'
import { effectiveAuth } from '@/lib/effectiveAuth'
import {
  createAppointment,
  listAppointments,
  type AppointmentInput,
  type BlockType,
} from '@/lib/calendar/appointments'
import { pushAppointmentOut } from '@/lib/calendar/syncOut'

/**
 * GET /api/calendar/appointments?from=ISO&to=ISO
 *
 * List the tenant's appointments inside [from, to). Defaults to a 60-day
 * window starting now if from/to not given.
 */
// Maximum window the list endpoint will accept. Prevents a runaway
// request from scanning years of history (a contractor with 5 years of
// booked jobs would otherwise return ~10k rows in one shot).
const MAX_WINDOW_DAYS = 365

export async function GET(req: NextRequest) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from')
  const toParam   = url.searchParams.get('to')

  const now = new Date()
  const windowStart = fromParam ? new Date(fromParam) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const windowEnd   = toParam   ? new Date(toParam)   : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  if (isNaN(windowStart.getTime()) || isNaN(windowEnd.getTime())) {
    return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 })
  }
  if (windowEnd.getTime() <= windowStart.getTime()) {
    return NextResponse.json({ error: 'windowEnd must be after windowStart' }, { status: 400 })
  }
  const windowDays = (windowEnd.getTime() - windowStart.getTime()) / (24 * 60 * 60 * 1000)
  if (windowDays > MAX_WINDOW_DAYS) {
    return NextResponse.json({ error: `Window cannot exceed ${MAX_WINDOW_DAYS} days — page through smaller ranges.` }, { status: 400 })
  }

  const rows = await listAppointments({ userId, windowStart, windowEnd })
  return NextResponse.json({
    appointments: rows,
    count: rows.length,
    windowStart: windowStart.toISOString(),
    windowEnd:   windowEnd.toISOString(),
  })
}

/**
 * POST /api/calendar/appointments
 *
 * Body:
 *   {
 *     scheduledAt:   ISO timestamp (required),
 *     durationMin:   90 | 60 | 120 | ...,
 *     customerName?: string,
 *     customerPhone?: string,
 *     jobType?:      "HVAC tune-up",
 *     address?:      string,
 *     notesInternal?: string,
 *     blockType?:    "job" | "lunch" | "vacation" | "personal" | "block",
 *     colorTag?:     string,
 *     amountEstimated?: number,
 *   }
 */
const VALID_BLOCK_TYPES: BlockType[] = ['job', 'block', 'lunch', 'vacation', 'personal']

// Bounds for manually-entered appointments. Caller-supplied values outside
// these ranges are rejected with a 400 — protects against typos (e.g. 1000
// hour appointment from a junk client) and AI/automation accidents.
const MIN_DURATION_MIN = 5
const MAX_DURATION_MIN = 12 * 60   // 12 hours — covers all-day install jobs
const MAX_PAST_DAYS    = 365 * 2   // 2 years — allow backfilling old jobs for reporting
const MAX_FUTURE_DAYS  = 365 * 2   // 2 years — sanity ceiling

export async function POST(req: NextRequest) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<AppointmentInput>

  if (!body.scheduledAt) {
    return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })
  }
  const startDate = new Date(body.scheduledAt)
  if (isNaN(startDate.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 })
  }

  // Sanity-check the time. We allow past times so contractors can backfill
  // jobs they already did (for reporting), but reject obvious garbage.
  const now = Date.now()
  const daysFromNow = (startDate.getTime() - now) / (24 * 60 * 60 * 1000)
  if (daysFromNow < -MAX_PAST_DAYS) {
    return NextResponse.json({ error: 'scheduledAt is unreasonably far in the past' }, { status: 400 })
  }
  if (daysFromNow > MAX_FUTURE_DAYS) {
    return NextResponse.json({ error: 'scheduledAt is unreasonably far in the future' }, { status: 400 })
  }

  // Duration validation. If the caller passes scheduledEndAt instead, we
  // derive duration from it. Either way, must fall inside [5min, 12h].
  let durationMin = body.durationMin ?? 90
  if (body.scheduledEndAt) {
    const endDate = new Date(body.scheduledEndAt)
    if (isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduledEndAt' }, { status: 400 })
    }
    durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000)
  }
  if (!Number.isFinite(durationMin) || durationMin < MIN_DURATION_MIN) {
    return NextResponse.json({ error: `Duration must be at least ${MIN_DURATION_MIN} minutes` }, { status: 400 })
  }
  if (durationMin > MAX_DURATION_MIN) {
    return NextResponse.json({ error: `Duration cannot exceed ${MAX_DURATION_MIN} minutes (12 hours)` }, { status: 400 })
  }

  const blockType: BlockType = body.blockType && VALID_BLOCK_TYPES.includes(body.blockType)
    ? body.blockType
    : 'job'

  // For non-job blocks, customer fields are irrelevant — strip them so the
  // calendar UI doesn't render confusing customer chips on a Lunch block.
  const customerName  = blockType === 'job' ? (body.customerName  ?? null) : null
  const customerPhone = blockType === 'job' ? (body.customerPhone ?? null) : null

  const created = await createAppointment({
    userId,
    scheduledAt:    startDate.toISOString(),
    scheduledEndAt: body.scheduledEndAt,
    durationMin,
    customerName:   customerName ?? undefined,
    customerPhone:  customerPhone ?? undefined,
    customerId:     body.customerId ?? null,
    jobType:        body.jobType,
    address:        body.address ?? null,
    amountEstimated: body.amountEstimated ?? null,
    notesInternal:  body.notesInternal ?? null,
    blockType,
    createdVia:     'manual',
    colorTag:       body.colorTag ?? null,
    status:         'scheduled',
  })

  if (!created) {
    return NextResponse.json({ error: 'Failed to create appointment' }, { status: 500 })
  }

  // Best-effort outbound sync to Google/Outlook. Failure does not block
  // the response — the native row is already saved. Sync errors land in
  // server logs + can be reconciled by a daily cron (TBD).
  //
  // Multi-provider fanout: pushes to every connected provider. Response
  // reports per-provider sync status so the UI can render two pills.
  const syncedTo: { google: boolean; microsoft: boolean } = { google: false, microsoft: false }
  try {
    const r = await pushAppointmentOut(created)
    syncedTo.google    = !!(r.google?.ok    && !r.google.skipped)
    syncedTo.microsoft = !!(r.microsoft?.ok && !r.microsoft.skipped)
  } catch (e) {
    console.warn('[appointments POST] sync-out threw:', (e as Error).message)
  }

  return NextResponse.json({ appointment: created, syncedTo }, { status: 201 })
}
