import { NextRequest, NextResponse } from 'next/server'
import { effectiveAuth } from '@/lib/effectiveAuth'
import {
  createAppointment,
  listAppointments,
  type AppointmentInput,
  type BlockType,
} from '@/lib/calendar/appointments'

/**
 * GET /api/calendar/appointments?from=ISO&to=ISO
 *
 * List the tenant's appointments inside [from, to). Defaults to a 60-day
 * window starting now if from/to not given.
 */
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

  const rows = await listAppointments({ userId, windowStart, windowEnd })
  return NextResponse.json({
    appointments: rows,
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
    durationMin:    body.durationMin ?? 90,
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
  return NextResponse.json({ appointment: created }, { status: 201 })
}
