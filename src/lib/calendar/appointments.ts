/**
 * Native BellAveGo calendar — appointments layer.
 *
 * Source of truth for every scheduled item:
 *   - AI-booked appointments (created via /api/calendar/book)
 *   - Manually entered by contractor (drag-on-calendar / +Add)
 *   - Block time (lunch, vacation, personal)
 *
 * Schema lives on the `jobs` table (migration 024). We treat that table
 * as our calendar event store. The legacy `scheduled_time` text column
 * is preserved for human-readable display; native code reads/writes
 * `scheduled_at` + `scheduled_end_at` TIMESTAMPTZ.
 *
 * Google / Microsoft external calendars are OPTIONAL sync targets — the
 * AI does NOT depend on them for booking. After we insert an appointment
 * here, an outbound sync pushes a copy to whichever external calendar
 * the contractor connected (best-effort; failures don't block the booking).
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type BlockType = 'job' | 'block' | 'lunch' | 'vacation' | 'personal'
export type CreatedVia = 'ai' | 'manual' | 'recurring' | 'sync_in'

export type AppointmentInput = {
  userId: string
  scheduledAt: string           // ISO timestamp
  scheduledEndAt?: string       // ISO; if omitted we derive from durationMin
  durationMin?: number          // defaults to 90
  customerName?: string
  customerPhone?: string | null
  customerId?: string | null
  jobType?: string              // 'HVAC tune-up', 'Drain clog', etc.
  address?: string | null
  amountEstimated?: number | null
  notesInternal?: string | null
  blockType?: BlockType         // defaults to 'job'
  createdVia?: CreatedVia       // defaults to 'manual'
  colorTag?: string | null
  status?: string               // defaults to 'scheduled'
}

export type AppointmentRow = {
  id: string
  user_id: string
  scheduled_at: string | null
  scheduled_end_at: string | null
  duration_min: number | null
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  job_type: string | null
  address: string | null
  amount_estimated: number | null
  notes_internal: string | null
  block_type: BlockType
  created_via: CreatedVia
  color_tag: string | null
  status: string
  title: string | null
  scheduled_time: string | null        // legacy human label
  external_event_id: string | null
  external_provider: 'google' | 'microsoft' | null
  google_event_id: string | null       // legacy
  created_at: string
}

/**
 * Pretty human-readable title for an appointment. Used in confirmations,
 * dashboard agenda, and as the title field. Format:
 *   "<jobType> — <customerName>"   (job)
 *   "Lunch"                         (block_type=lunch)
 *   "Vacation"                      (block_type=vacation)
 */
export function buildAppointmentTitle(a: {
  blockType?: BlockType
  jobType?: string
  customerName?: string
}): string {
  const bt = a.blockType ?? 'job'
  if (bt === 'lunch')    return 'Lunch'
  if (bt === 'vacation') return 'Vacation'
  if (bt === 'personal') return 'Personal time'
  if (bt === 'block')    return 'Blocked'
  const svc = a.jobType?.trim() || 'Appointment'
  const name = a.customerName?.trim()
  return name ? `${svc} — ${name}` : svc
}

/**
 * Create a new appointment. Returns the inserted row.
 *
 * Tenant scoping: caller is responsible for passing a userId that belongs
 * to the authenticated principal. API routes go through effectiveAuth.
 */
export async function createAppointment(input: AppointmentInput): Promise<AppointmentRow | null> {
  const durationMin = input.durationMin ?? 90
  const start = new Date(input.scheduledAt)
  const end = input.scheduledEndAt
    ? new Date(input.scheduledEndAt)
    : new Date(start.getTime() + durationMin * 60 * 1000)

  const blockType   = input.blockType   ?? 'job'
  const createdVia  = input.createdVia  ?? 'manual'
  const title       = buildAppointmentTitle({
    blockType,
    jobType: input.jobType,
    customerName: input.customerName,
  })

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      user_id: input.userId,
      scheduled_at: start.toISOString(),
      scheduled_end_at: end.toISOString(),
      duration_min: durationMin,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName ?? null,
      customer_phone: input.customerPhone ?? null,
      job_type: input.jobType ?? null,
      address: input.address ?? null,
      amount_estimated: input.amountEstimated ?? null,
      notes_internal: input.notesInternal ?? null,
      block_type: blockType,
      created_via: createdVia,
      color_tag: input.colorTag ?? null,
      status: input.status ?? 'scheduled',
      title,
    })
    .select('*')
    .single()

  if (error) {
    console.error('createAppointment failed:', error.message)
    return null
  }
  return data as AppointmentRow
}

/**
 * List appointments for a tenant inside a window.
 * Used by /dashboard/calendar to render the month/week/day view.
 */
export async function listAppointments(args: {
  userId: string
  windowStart: Date
  windowEnd: Date
}): Promise<AppointmentRow[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', args.userId)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', args.windowStart.toISOString())
    .lt('scheduled_at',  args.windowEnd.toISOString())
    .neq('status', 'cancelled')
    .order('scheduled_at', { ascending: true })

  if (error) {
    console.error('listAppointments failed:', error.message)
    return []
  }
  return (data ?? []) as AppointmentRow[]
}

/**
 * Fetch one appointment for editing. Verifies tenant ownership.
 */
export async function getAppointment(userId: string, id: string): Promise<AppointmentRow | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('getAppointment failed:', error.message)
    return null
  }
  return (data ?? null) as AppointmentRow | null
}

/**
 * Patch fields on an existing appointment. Tenant-scoped (the UPDATE
 * WHERE clause includes user_id so a malformed request can't touch
 * another tenant's row).
 */
export async function updateAppointment(args: {
  userId: string
  id: string
  patch: Partial<AppointmentInput> & { scheduled_at?: string; scheduled_end_at?: string; status?: string }
}): Promise<AppointmentRow | null> {
  const update: Record<string, unknown> = {}
  const p = args.patch

  // Time updates — accept either the input field names (scheduledAt) or DB
  // names (scheduled_at) to keep the API ergonomic.
  if (p.scheduledAt    !== undefined) update.scheduled_at     = new Date(p.scheduledAt).toISOString()
  if (p.scheduled_at   !== undefined) update.scheduled_at     = new Date(p.scheduled_at).toISOString()
  if (p.scheduledEndAt !== undefined) update.scheduled_end_at = new Date(p.scheduledEndAt).toISOString()
  if (p.scheduled_end_at !== undefined) update.scheduled_end_at = new Date(p.scheduled_end_at).toISOString()
  if (p.durationMin    !== undefined) update.duration_min     = p.durationMin

  if (p.customerName   !== undefined) update.customer_name    = p.customerName
  if (p.customerPhone  !== undefined) update.customer_phone   = p.customerPhone
  if (p.customerId     !== undefined) update.customer_id      = p.customerId
  if (p.jobType        !== undefined) update.job_type         = p.jobType
  if (p.address        !== undefined) update.address          = p.address
  if (p.amountEstimated !== undefined) update.amount_estimated = p.amountEstimated
  if (p.notesInternal  !== undefined) update.notes_internal   = p.notesInternal
  if (p.blockType      !== undefined) update.block_type       = p.blockType
  if (p.colorTag       !== undefined) update.color_tag        = p.colorTag
  if (p.status         !== undefined) update.status           = p.status

  // Refresh derived title if any of its inputs changed
  if (p.customerName !== undefined || p.jobType !== undefined || p.blockType !== undefined) {
    update.title = buildAppointmentTitle({
      blockType:   p.blockType ?? undefined,
      jobType:     p.jobType ?? undefined,
      customerName: p.customerName ?? undefined,
    })
  }

  // If only start changed but not end, AND we know the duration, slide end too.
  if (update.scheduled_at && !update.scheduled_end_at) {
    const existing = await getAppointment(args.userId, args.id)
    if (existing?.duration_min) {
      const newStart = new Date(update.scheduled_at as string)
      update.scheduled_end_at = new Date(newStart.getTime() + existing.duration_min * 60 * 1000).toISOString()
    }
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(update)
    .eq('user_id', args.userId)
    .eq('id', args.id)
    .select('*')
    .single()

  if (error) {
    console.error('updateAppointment failed:', error.message)
    return null
  }
  return data as AppointmentRow
}

/**
 * Soft-cancel an appointment (sets status='cancelled' instead of deleting).
 * Calendar views filter cancelled rows out, but consulting reports and
 * audit log still see them.
 */
export async function cancelAppointment(userId: string, id: string): Promise<boolean> {
  const { error } = await supabase
    .from('jobs')
    .update({ status: 'cancelled' })
    .eq('user_id', userId)
    .eq('id', id)
  if (error) {
    console.error('cancelAppointment failed:', error.message)
    return false
  }
  return true
}

/**
 * BUSY-block computation for the AI's free/busy logic. Every non-cancelled
 * appointment with a scheduled_at + scheduled_end_at is a busy block. The
 * AI never offers a time that overlaps these.
 */
export async function getNativeBusyBlocks(args: {
  userId: string
  windowStart: Date
  windowEnd: Date
}): Promise<Array<{ start: Date; end: Date }>> {
  const rows = await listAppointments(args)
  return rows
    .filter((r) => r.scheduled_at && r.scheduled_end_at)
    .map((r) => ({
      start: new Date(r.scheduled_at as string),
      end:   new Date(r.scheduled_end_at as string),
    }))
}
