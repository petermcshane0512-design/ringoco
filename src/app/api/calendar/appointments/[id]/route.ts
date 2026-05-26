import { NextRequest, NextResponse } from 'next/server'
import { effectiveAuth } from '@/lib/effectiveAuth'
import {
  getAppointment,
  updateAppointment,
  cancelAppointment,
  type AppointmentInput,
} from '@/lib/calendar/appointments'
import {
  updateExternalForAppointment,
  deleteExternalForAppointment,
} from '@/lib/calendar/syncOut'

/**
 * GET /api/calendar/appointments/[id]
 *   Return a single appointment for editing.
 *
 * PATCH /api/calendar/appointments/[id]
 *   Update fields (reschedule, change customer info, etc.).
 *
 * DELETE /api/calendar/appointments/[id]
 *   Soft-cancel (sets status='cancelled' — never hard-delete so consulting
 *   reports + audit trail stay intact).
 *
 * All three are tenant-scoped via effectiveAuth + WHERE user_id clauses
 * inside the lib functions.
 */
type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const row = await getAppointment(userId, id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ appointment: row })
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as Partial<AppointmentInput> & {
    scheduled_at?: string
    scheduled_end_at?: string
    status?: string
  }

  const updated = await updateAppointment({ userId, id, patch: body })
  if (!updated) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  // Best-effort sync to external calendar (Google/Outlook). Falls back
  // to a fresh push if the appointment was never synced before.
  try {
    await updateExternalForAppointment(updated)
  } catch (e) {
    console.warn('[appointments PATCH] sync-out threw:', (e as Error).message)
  }

  return NextResponse.json({ appointment: updated })
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // Load the row BEFORE cancelling so we still have external_event_id to
  // delete in the mirror calendar.
  const existing = await getAppointment(userId, id)

  const ok = await cancelAppointment(userId, id)
  if (!ok) return NextResponse.json({ error: 'Cancel failed' }, { status: 500 })

  if (existing) {
    try {
      await deleteExternalForAppointment(existing)
    } catch (e) {
      console.warn('[appointments DELETE] sync-out threw:', (e as Error).message)
    }
  }

  return NextResponse.json({ ok: true })
}
