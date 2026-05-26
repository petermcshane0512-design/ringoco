'use client'

import { useEffect, useState } from 'react'

/**
 * AppointmentModal — create / edit / cancel a single calendar entry.
 *
 * Opens in two modes:
 *   - create: { mode: 'create', initialStart }     → new appointment at this time
 *   - edit:   { mode: 'edit',   appointmentId }    → load existing + allow PATCH/DELETE
 *
 * Calls /api/calendar/appointments + /api/calendar/appointments/[id] under
 * the hood. Returns nothing on close; caller refreshes the calendar list.
 */

export type BlockType = 'job' | 'block' | 'lunch' | 'vacation' | 'personal'

export type AppointmentModalProps = {
  mode: 'create' | 'edit'
  /** create mode: ISO timestamp the user clicked on the grid */
  initialStart?: string
  /** edit mode: appointment id to load */
  appointmentId?: string
  /** business timezone for the contractor (for date math + display) */
  timezone?: string
  /** called when modal closes (saved or cancelled). Pass true if data changed so caller refreshes. */
  onClose: (changed: boolean) => void
}

type FormState = {
  scheduledAt: string         // local datetime-input value (yyyy-MM-ddTHH:mm)
  durationMin: number
  blockType: BlockType
  customerName: string
  customerPhone: string
  jobType: string
  address: string
  notesInternal: string
  amountEstimated: string
}

type SyncState = {
  provider: 'google' | 'microsoft' | null
  eventId: string | null
}

const DURATION_PRESETS = [30, 60, 90, 120, 180, 240]
const JOB_TYPE_PRESETS = [
  'AC repair',
  'AC install',
  'Furnace repair',
  'Furnace install',
  'Plumbing — leak',
  'Plumbing — drain clog',
  'Water heater',
  'Electrical — outlet',
  'Maintenance tune-up',
  'Estimate / quote',
  'Diagnostic visit',
]

export default function AppointmentModal(props: AppointmentModalProps) {
  const [form, setForm] = useState<FormState>(() => ({
    scheduledAt: toLocalDateTimeInput(props.initialStart ?? new Date().toISOString()),
    durationMin: 90,
    blockType: 'job',
    customerName: '',
    customerPhone: '',
    jobType: '',
    address: '',
    notesInternal: '',
    amountEstimated: '',
  }))
  const [loading, setLoading] = useState(props.mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sync, setSync] = useState<SyncState>({ provider: null, eventId: null })

  // Edit mode — load existing appointment
  useEffect(() => {
    if (props.mode !== 'edit' || !props.appointmentId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/calendar/appointments/${props.appointmentId}`)
        if (!res.ok) {
          setError('Could not load appointment')
          setLoading(false)
          return
        }
        const j = await res.json() as { appointment: Record<string, unknown> }
        const a = j.appointment
        if (cancelled) return
        setForm({
          scheduledAt: toLocalDateTimeInput((a.scheduled_at as string) || new Date().toISOString()),
          durationMin: (a.duration_min as number) || 90,
          blockType: (a.block_type as BlockType) || 'job',
          customerName: (a.customer_name as string) || '',
          customerPhone: (a.customer_phone as string) || '',
          jobType: (a.job_type as string) || '',
          address: (a.address as string) || '',
          notesInternal: (a.notes_internal as string) || '',
          amountEstimated: a.amount_estimated != null ? String(a.amount_estimated) : '',
        })
        setSync({
          provider: (a.external_provider as 'google' | 'microsoft' | null) ?? null,
          eventId:  (a.external_event_id as string | null) ?? null,
        })
        setLoading(false)
      } catch (e) {
        setError((e as Error).message)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [props.mode, props.appointmentId])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const startDate = fromLocalDateTimeInput(form.scheduledAt)
      if (isNaN(startDate.getTime())) {
        setError('Pick a valid start time')
        setSaving(false)
        return
      }
      if (form.blockType === 'job' && !form.customerName.trim()) {
        setError('Customer name is required for jobs')
        setSaving(false)
        return
      }
      const body = {
        scheduledAt: startDate.toISOString(),
        durationMin: form.durationMin,
        blockType: form.blockType,
        customerName: form.blockType === 'job' ? form.customerName.trim() : undefined,
        customerPhone: form.blockType === 'job' ? form.customerPhone.trim() || undefined : undefined,
        jobType: form.blockType === 'job' ? form.jobType.trim() || undefined : undefined,
        address: form.address.trim() || undefined,
        notesInternal: form.notesInternal.trim() || undefined,
        amountEstimated: form.amountEstimated ? parseFloat(form.amountEstimated) : undefined,
      }
      const url = props.mode === 'edit'
        ? `/api/calendar/appointments/${props.appointmentId}`
        : '/api/calendar/appointments'
      const method = props.mode === 'edit' ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || `Save failed (HTTP ${res.status})`)
        setSaving(false)
        return
      }
      props.onClose(true)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  async function remove() {
    if (!props.appointmentId) return
    if (!confirm('Cancel this appointment? The customer will not be notified — text them manually if needed.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/appointments/${props.appointmentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Cancel failed')
        setDeleting(false)
        return
      }
      props.onClose(true)
    } catch (e) {
      setError((e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <div
      onClick={() => props.onClose(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(7,27,58,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: '#fff', borderRadius: 18,
          boxShadow: '0 24px 60px rgba(7,27,58,0.32)',
          maxHeight: '90vh', overflowY: 'auto',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Header — branded */}
        <div style={{
          padding: '20px 26px',
          borderBottom: '1px solid rgba(10,168,159,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#0AA89F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
              BellAveGo Calendar
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.02em' }}>
              {props.mode === 'edit' ? 'Edit appointment' : 'New appointment'}
            </h2>
          </div>
          <button
            onClick={() => props.onClose(false)}
            style={{
              border: 'none', background: 'transparent',
              fontSize: 24, color: '#7AAAB2', cursor: 'pointer', padding: 4,
              fontFamily: 'inherit',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#7AAAB2' }}>Loading…</div>
        ) : (
          <div style={{ padding: '20px 26px' }}>
            {/* Sync status pill (edit mode only) */}
            {props.mode === 'edit' && (
              <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                {sync.provider ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 99,
                    background: '#ECFDF5', border: '1px solid #A7F3D0',
                    fontSize: 11, fontWeight: 800, color: '#065F46',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                    Mirrored to {sync.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 11px', borderRadius: 99,
                    background: '#F1F5F9', border: '1px solid #CBD5E1',
                    fontSize: 11, fontWeight: 800, color: '#475569',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8' }} />
                    BellAveGo only · not mirrored
                  </span>
                )}
              </div>
            )}

            {/* Block-type chips */}
            <div style={{ marginBottom: 18 }}>
              <Label>Type</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6 }}>
                {([
                  { v: 'job',      l: '🔧 Job' },
                  { v: 'block',    l: '⛔ Block' },
                  { v: 'lunch',    l: '🍴 Lunch' },
                  { v: 'vacation', l: '🏖️ Vacation' },
                  { v: 'personal', l: '👤 Personal' },
                ] as Array<{ v: BlockType; l: string }>).map((opt) => {
                  const active = form.blockType === opt.v
                  return (
                    <button
                      key={opt.v}
                      onClick={() => update('blockType', opt.v)}
                      style={chipStyle(active)}
                    >
                      {opt.l}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Customer fields — only show for 'job' */}
            {form.blockType === 'job' && (
              <>
                <Row>
                  <Field label="Customer name *">
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={(e) => update('customerName', e.target.value)}
                      placeholder="Sarah Johnson"
                      style={inputStyle}
                      autoFocus
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(e) => update('customerPhone', e.target.value)}
                      placeholder="(555) 123-4567"
                      style={inputStyle}
                    />
                  </Field>
                </Row>

                <Field label="Service type">
                  <input
                    type="text"
                    value={form.jobType}
                    onChange={(e) => update('jobType', e.target.value)}
                    placeholder="AC repair"
                    list="apt-job-types"
                    style={inputStyle}
                  />
                  <datalist id="apt-job-types">
                    {JOB_TYPE_PRESETS.map((j) => <option key={j} value={j} />)}
                  </datalist>
                </Field>
              </>
            )}

            {/* Time + duration */}
            <Row>
              <Field label="When">
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => update('scheduledAt', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Duration">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {DURATION_PRESETS.map((m) => {
                    const active = form.durationMin === m
                    return (
                      <button
                        key={m}
                        onClick={() => update('durationMin', m)}
                        style={{
                          ...chipStyle(active),
                          padding: '6px 10px',
                          fontSize: 12,
                          flex: '0 0 auto',
                        }}
                      >
                        {m >= 60 ? `${m / 60}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </Row>

            {/* Address — useful for jobs */}
            {form.blockType === 'job' && (
              <Field label="Address (optional)">
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                  placeholder="1234 Maple Ave, Anytown ST"
                  style={inputStyle}
                />
              </Field>
            )}

            {/* Estimated $ — only for jobs */}
            {form.blockType === 'job' && (
              <Field label="Estimated value (optional)">
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#7AAAB2', fontSize: 14, pointerEvents: 'none' }}>$</span>
                  <input
                    type="number"
                    value={form.amountEstimated}
                    onChange={(e) => update('amountEstimated', e.target.value)}
                    placeholder="350"
                    style={{ ...inputStyle, paddingLeft: 28 }}
                    min="0"
                    step="10"
                  />
                </div>
              </Field>
            )}

            {/* Notes */}
            <Field label="Notes (private — not sent to customer)">
              <textarea
                value={form.notesInternal}
                onChange={(e) => update('notesInternal', e.target.value)}
                placeholder="Bring extra capacitors. Gate code 4823."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', minHeight: 60 }}
              />
            </Field>

            {error && (
              <div style={{
                marginTop: 12, padding: '10px 14px',
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 10, color: '#991B1B', fontSize: 13, fontWeight: 600,
              }}>
                {error}
              </div>
            )}

            {/* Footer buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center' }}>
              {props.mode === 'edit' && (
                <button
                  onClick={remove}
                  disabled={deleting}
                  style={{
                    padding: '11px 18px', borderRadius: 10,
                    background: '#FEF2F2', color: '#991B1B',
                    border: '1px solid #FECACA',
                    fontSize: 13, fontWeight: 800, cursor: deleting ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {deleting ? 'Cancelling…' : 'Cancel appointment'}
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => props.onClose(false)}
                style={{
                  padding: '11px 18px', borderRadius: 10,
                  background: 'transparent', color: '#4A6670',
                  border: '1px solid rgba(10,168,159,0.18)',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: '11px 24px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                  color: '#0B1F3A',
                  border: 'none',
                  fontSize: 13, fontWeight: 900, cursor: saving ? 'wait' : 'pointer',
                  boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
                  fontFamily: 'inherit',
                }}
              >
                {saving ? 'Saving…' : props.mode === 'edit' ? 'Update' : 'Save appointment'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── helpers + sub-components ─────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 900, color: '#4A7A80', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 9,
  border: '1.5px solid rgba(10,168,159,0.22)',
  background: '#F5FDFB',
  fontSize: 14,
  color: '#0B1F3A',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 10px',
    borderRadius: 9,
    border: active ? '2px solid #E8742B' : '1.5px solid rgba(232,116,43,0.20)',
    background: active ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : '#FFF7EE',
    color: active ? '#fff' : '#0B1F3A',
    fontSize: 12, fontWeight: 800,
    cursor: 'pointer', fontFamily: 'inherit',
    textAlign: 'center',
  }
}

/** Convert ISO timestamp → "YYYY-MM-DDTHH:MM" in LOCAL time (for datetime-local input). */
function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert "YYYY-MM-DDTHH:MM" local input back to a Date (in browser's local TZ). */
function fromLocalDateTimeInput(s: string): Date {
  return new Date(s)
}
