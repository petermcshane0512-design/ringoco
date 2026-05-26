import { NextRequest, NextResponse } from 'next/server'
import { effectiveAuth } from '@/lib/effectiveAuth'
import {
  getAppointment,
  updateAppointment,
  cancelAppointment,
  type AppointmentInput,
} from '@/lib/calendar/appointments'

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
  return NextResponse.json({ appointment: updated })
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { userId } = await effectiveAuth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const ok = await cancelAppointment(userId, id)
  if (!ok) return NextResponse.json({ error: 'Cancel failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
