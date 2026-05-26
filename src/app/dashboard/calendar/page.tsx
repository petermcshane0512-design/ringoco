'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import CalendarGrid from '@/components/CalendarGrid'

type Connection = {
  provider: string
  email: string | null
  name: string | null
  enabled: boolean
  connectedAt: string
  lastSyncedAt: string | null
  lastError: string | null
}

type CalendarEvent = {
  id: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay: boolean
  status?: string
  isBellaveGo: boolean
}

function CalendarPageInner() {
  const params = useSearchParams()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  // Appointment settings — saved on profile (migration 021). Used by the AI
  // when booking via the calendar to (a) know how long to block each job
  // and (b) leave travel buffer before/after every existing event.
  const [durationMin, setDurationMin] = useState<number>(90)
  const [bufferMin, setBufferMin] = useState<number>(30)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then((p) => {
      if (p && !p.error) {
        if (typeof p.default_job_duration_min === 'number') setDurationMin(p.default_job_duration_min)
        if (typeof p.travel_buffer_min === 'number') setBufferMin(p.travel_buffer_min)
      }
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [])

  async function saveAppointmentSettings() {
    setSavingSettings(true)
    setSavedTick(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_job_duration_min: durationMin,
          travel_buffer_min: bufferMin,
          appointment_settings_at: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        setSavedTick(true)
        setTimeout(() => setSavedTick(false), 2400)
      }
    } finally {
      setSavingSettings(false)
    }
  }
  const flashStatus = params.get('calendar')
  const flashReason = params.get('reason')
  const flashAccount = params.get('account')
  const flashUnderlying = params.get('underlying')

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/status')
      const j = await res.json()
      setConnections(j.connections || [])
      // Auto-load events if connected
      if ((j.connections || []).some((c: Connection) => c.enabled)) {
        loadEvents()
      }
    } catch { setConnections([]) }
    finally { setLoading(false) }
  }

  async function loadEvents() {
    setEventsLoading(true)
    try {
      // 60-day window so the month-grid view has data when user navigates
      // forward without an extra round trip.
      const res = await fetch('/api/calendar/events?days=60')
      const j = await res.json()
      setEvents(j.events || [])
    } catch { setEvents([]) }
    finally { setEventsLoading(false) }
  }

  // Direct integration (Cronofy retired 2026-05-26). Pick the first enabled
  // Google or Microsoft connection — contractors typically connect one, but
  // if both are present we prefer Google (most common ICP).
  const calendarConnection = connections.find(
    (c) => c.enabled && (c.provider === 'google' || c.provider === 'microsoft'),
  )

  async function disconnect() {
    if (!calendarConnection) return
    if (!confirm('Disconnect your calendar? The AI will stop offering specific time slots from your calendar.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: calendarConnection.provider }),
      })
      await refresh()
    } finally { setDisconnecting(false) }
  }

  // Pretty name for the underlying provider on the success banner / connection chip
  const prettyProvider = (raw: string | null | undefined): string => {
    const p = (raw || '').toLowerCase()
    if (p === 'google'    || p.includes('google'))                   return 'Google Calendar'
    if (p === 'microsoft' || p.includes('outlook') || p.includes('office')) return 'Microsoft Outlook'
    if (p.includes('exchange'))                                       return 'Microsoft Exchange'
    if (p)                                                             return raw as string
    return 'your calendar'
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>
        ← Back to dashboard
      </Link>

      <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.04em', marginTop: 14, marginBottom: 8 }}>
        Connect your calendar.
      </h1>
      <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.55, maxWidth: 680, marginBottom: 24 }}>
        Give the AI receptionist access to your real-time availability and it&apos;ll <strong>offer specific time slots</strong> during the call — &quot;Mike has Tuesday at 2 PM or Wednesday at 9 AM, which works?&quot; — instead of just taking a message. Auto-booking ships in Phase 2 (Q3 2026).
      </p>

      {/* Flash banners from OAuth callback */}
      {flashStatus === 'connected' && (
        <FlashBanner kind="success">
          ✅ Connected to {prettyProvider(flashUnderlying)}{flashAccount ? ` (${flashAccount})` : ''}. The AI will start offering specific slots on the next inbound call.
        </FlashBanner>
      )}
      {flashStatus === 'error' && (
        <FlashBanner kind="error">
          Couldn&apos;t connect calendar. {flashReason ? <em>Reason: {flashReason}</em> : null} Try again, or text our team at 773-710-9565.
        </FlashBanner>
      )}

      {/* ── APPOINTMENT SETTINGS — the rules the AI follows when booking.
            Two sliders. Plain English. Saved to profile (migration 021)
            so the AI applies these to EVERY booking attempt. ── */}
      <div style={{
        background: '#fff',
        border: '1.5px solid #FF9D5A',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 18,
        boxShadow: '0 6px 22px rgba(232,116,43,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 900, color: '#fff',
            background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
            padding: '3px 10px', borderRadius: 99,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            Required first
          </span>
          <span style={{ fontSize: 11, color: '#7AAAB2', fontWeight: 600 }}>30 seconds</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em', margin: 0, marginBottom: 6 }}>
          Set your appointment rules.
        </h2>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, margin: 0, marginBottom: 22 }}>
          The AI uses these two numbers EVERY time it books a job for you. Set them once. Change anytime.
        </p>

        {/* Slider 1 — typical job duration */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A' }}>
              🕐 How long is a typical job?
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#E8742B', letterSpacing: '-0.02em' }}>
              {durationMin >= 60 ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? ` ${durationMin % 60}m` : ''}` : `${durationMin} min`}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {[30, 60, 90, 120, 180].map((min) => {
              const active = durationMin === min
              return (
                <button
                  key={min}
                  onClick={() => setDurationMin(min)}
                  style={{
                    padding: '12px 6px',
                    borderRadius: 10,
                    border: active ? '2px solid #E8742B' : '1.5px solid rgba(232,116,43,0.20)',
                    background: active ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : '#FFF7EE',
                    color: active ? '#fff' : '#0B1F3A',
                    fontSize: 13, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {min >= 60 ? `${min / 60}h${min % 60 ? `${min % 60}m` : ''}` : `${min}m`}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 8, lineHeight: 1.5 }}>
            The AI blocks this much time for every booked job. If a caller says &quot;just a quick fix&quot; or &quot;big install&quot;, the AI will adjust — but this is the default.
          </div>
        </div>

        {/* Slider 2 — travel buffer */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A' }}>
              🚗 Travel time between jobs?
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#0AA89F', letterSpacing: '-0.02em' }}>
              {bufferMin === 0 ? 'None' : `${bufferMin} min`}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {[0, 15, 30, 45, 60].map((min) => {
              const active = bufferMin === min
              return (
                <button
                  key={min}
                  onClick={() => setBufferMin(min)}
                  style={{
                    padding: '12px 6px',
                    borderRadius: 10,
                    border: active ? '2px solid #0AA89F' : '1.5px solid rgba(10,168,159,0.20)',
                    background: active ? 'linear-gradient(135deg, #0AA89F, #088A82)' : '#F0FBF8',
                    color: active ? '#fff' : '#0B1F3A',
                    fontSize: 13, fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {min === 0 ? 'None' : `${min}m`}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 8, lineHeight: 1.5 }}>
            We&apos;ll leave this much space BEFORE and AFTER every existing event on your calendar. So a 30-min buffer means we won&apos;t book any job that ends less than 30 min before your next appointment.
          </div>
        </div>

        {/* Live example so contractor sees the math */}
        <div style={{
          background: '#F5F1EA',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 18,
          fontSize: 12.5,
          color: '#0B1F3A',
          lineHeight: 1.55,
        }}>
          <strong style={{ color: '#E8742B' }}>Example:</strong> If you have an appointment at 11:00 AM, the AI won&apos;t book anything ending after {(() => {
            const start = 11 * 60
            const earliest = start - bufferMin
            const h = Math.floor(earliest / 60), m = earliest % 60
            return `${h % 12 || 12}:${String(m).padStart(2, '0')} AM`
          })()} OR starting before {(() => {
            const endOfPrev = 12 * 60 + bufferMin  // assume 11 AM job ends at noon, then add buffer
            const h = Math.floor(endOfPrev / 60), m = endOfPrev % 60
            return `${h % 12 || 12}:${String(m).padStart(2, '0')} PM`
          })()}. Every booked job is {durationMin >= 60 ? `${Math.floor(durationMin / 60)}h${durationMin % 60 ? ` ${durationMin % 60}m` : ''}` : `${durationMin} min`} long with {bufferMin === 0 ? 'no' : `${bufferMin} min`} buffer on each side.
        </div>

        <button
          onClick={saveAppointmentSettings}
          disabled={!settingsLoaded || savingSettings}
          style={{
            width: '100%',
            padding: '13px 18px',
            borderRadius: 12,
            border: 'none',
            background: savedTick
              ? 'linear-gradient(135deg, #22C55E, #16A34A)'
              : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
            color: '#fff',
            fontSize: 14, fontWeight: 900,
            cursor: savingSettings ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
            transition: 'background 0.18s ease',
          }}
        >
          {savingSettings ? 'Saving…' : savedTick ? '✓ Saved — AI will use these rules' : 'Save these rules →'}
        </button>
      </div>

      {/* Single Connect-a-Calendar card — Cronofy handles the provider picker */}
      {calendarConnection ? (
        // CONNECTED state
        <div style={{
          background: '#fff',
          border: '1.5px solid #22C55E',
          borderRadius: 16,
          padding: '24px 28px',
          boxShadow: '0 4px 20px rgba(7,27,58,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #22C55E, #16A34A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(34,197,94,0.32)',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: '#16A34A', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                Calendar connected
              </div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>
                {calendarConnection.name || prettyProvider(calendarConnection.provider)}
              </div>
              {calendarConnection.email && (
                <div style={{ fontSize: 13, color: '#7AAAB2', marginTop: 2 }}>{calendarConnection.email}</div>
              )}
            </div>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              style={{
                padding: '10px 18px', borderRadius: 9,
                background: '#FEF2F2', color: '#991B1B',
                border: '1px solid #FECACA',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
          <div style={{ padding: '12px 14px', background: '#F0FAF7', borderRadius: 10, fontSize: 13, color: '#0D8F87' }}>
            ✓ The AI now checks your real-time availability before offering appointment times on every call.
          </div>
        </div>
      ) : (
        // NOT-CONNECTED state — two provider buttons (Google + Outlook).
        // Direct OAuth integrations (Cronofy retired 2026-05-26). Each
        // button goes straight to its provider's consent screen — Google
        // and Microsoft both show their own standard "BellAveGo wants to
        // access your calendar" dialog with no third-party warning.
        <div style={{
          background: 'linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)',
          border: '1.5px solid rgba(232,116,43,0.32)',
          borderRadius: 16,
          padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(232,116,43,0.10)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 900, color: '#C84B26',
              background: 'rgba(232,116,43,0.12)', padding: '3px 9px', borderRadius: 99,
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              Recommended · 60 seconds
            </span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Let the AI offer real appointment times
          </h2>
          <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, margin: '0 0 22px' }}>
            Connect <strong>Google Calendar</strong> or <strong>Microsoft Outlook</strong> and the AI checks your real availability before offering specific slots to callers. We never read event details — only your free/busy windows.
          </p>

          {/* Two provider buttons — direct OAuth, no middleman */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <a
              href="/api/calendar/google/connect"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '15px 22px', borderRadius: 11,
                background: '#fff',
                border: '1.5px solid #DADCE0',
                color: '#1F1F1F', fontSize: 14, fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
                transition: 'box-shadow 0.18s ease, transform 0.18s ease',
              }}
            >
              {/* Google G logo — official multi-color */}
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Connect Google Calendar
            </a>

            <a
              href="/api/calendar/microsoft/connect"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '15px 22px', borderRadius: 11,
                background: '#fff',
                border: '1.5px solid #DADCE0',
                color: '#1F1F1F', fontSize: 14, fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
                transition: 'box-shadow 0.18s ease, transform 0.18s ease',
              }}
            >
              {/* Microsoft 4-square logo */}
              <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden="true">
                <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
                <rect x="12" y="1"  width="10" height="10" fill="#7FBA00"/>
                <rect x="1"  y="12" width="10" height="10" fill="#00A4EF"/>
                <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
              </svg>
              Connect Microsoft Outlook
            </a>
          </div>

          {/* Trust footer */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(232,116,43,0.18)', fontSize: 12, color: '#7AAAB2', lineHeight: 1.6 }}>
            Works with personal Gmail, Google Workspace, Outlook.com, Microsoft 365, and Exchange Online. <strong style={{ color: '#0B1F3A' }}>Read-only free/busy + write access</strong> to create AI-booked appointments. Disconnect anytime.
          </div>
        </div>
      )}

      {/* CALENDAR GRID — real month/week/day view of contractor's actual events.
          Events the AI booked (event_id starts with bellavego_) render in
          sunset-orange so they pop. Click any event for full details. */}
      {calendarConnection && (
        <section style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em', margin: 0 }}>
              Your calendar
            </h2>
            <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#7AAAB2', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: '#0B1F3A' }} /> Your events
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: 'linear-gradient(135deg, #FF9D5A, #E8742B)' }} /> AI Booked
              </span>
            </div>
          </div>

          <div style={{
            background: '#fff', borderRadius: 14, padding: '14px 16px 18px',
            border: '1px solid rgba(10,168,159,0.14)',
            boxShadow: '0 4px 20px rgba(7,27,58,0.04)',
          }}>
            {eventsLoading && events.length === 0 ? (
              <div style={{ padding: 80, textAlign: 'center', color: '#7AAAB2', fontSize: 13 }}>
                Loading your calendar…
              </div>
            ) : (
              <CalendarGrid events={events} onRefresh={loadEvents} />
            )}
          </div>
        </section>
      )}

      {/* How it works */}
      <div style={{ marginTop: 32, padding: '22px 26px', background: '#F0FAF7', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: '#0B1F3A', marginTop: 0, marginBottom: 10 }}>
          How calendar-aware booking works
        </h3>
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#4A6670', lineHeight: 1.7 }}>
          <li>Click <strong>Connect Google Calendar</strong> or <strong>Connect Microsoft Outlook</strong> → grant access (30 seconds total)</li>
          <li>Caller asks to schedule. The AI checks your calendar in real time</li>
          <li>AI offers 3 actual open slots — &quot;Tuesday 2 PM, Wednesday 9 AM, or Thursday 11 AM&quot;</li>
          <li>Caller picks one. You get an SMS — &quot;Sarah picked Tuesday 2 PM. Reply YES to confirm.&quot;</li>
          <li>You confirm via YES — auto-create event in your calendar arrives in Phase 2 (Q3 2026)</li>
        </ol>
        <p style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 12, marginBottom: 0, fontStyle: 'italic' }}>
          Privacy: we only read free/busy windows — never event titles, attendees, or notes. Disconnect anytime. Direct integration with Google Calendar API and Microsoft Graph — no third-party middleware.
        </p>
      </div>
    </main>
  )
}

function FlashBanner({ kind, children }: { kind: 'success' | 'error'; children: React.ReactNode }) {
  const isSuccess = kind === 'success'
  return (
    <div style={{
      marginBottom: 20,
      padding: '14px 18px',
      borderRadius: 12,
      fontSize: 13,
      background: isSuccess ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${isSuccess ? '#86EFAC' : '#FECACA'}`,
      color: isSuccess ? '#166534' : '#991B1B',
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}

/**
 * AgendaList — groups events by day, renders each event card.
 * BellAveGo-booked events get the orange gradient + "AI Booked" badge.
 */
function AgendaList({ events }: { events: CalendarEvent[] }) {
  // Group by YYYY-MM-DD
  const byDay = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const key = new Date(ev.start).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
    })
    const arr = byDay.get(key) ?? []
    arr.push(ev)
    byDay.set(key, arr)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {Array.from(byDay.entries()).map(([dayLabel, dayEvents]) => (
        <div key={dayLabel}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: '#7AAAB2',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            {dayLabel}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dayEvents.map((ev) => <EventCard key={ev.id} event={ev} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function EventCard({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start)
  const end = new Date(event.end)
  const timeLabel = event.allDay
    ? 'All day'
    : `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`

  const isAI = event.isBellaveGo

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '110px 4px 1fr auto',
      gap: 14,
      alignItems: 'center',
      padding: '12px 16px',
      background: isAI ? 'linear-gradient(135deg, #FFF6EE 0%, #FFFFFF 70%)' : '#fff',
      border: isAI ? '1.5px solid rgba(232,116,43,0.42)' : '1px solid rgba(10,168,159,0.14)',
      borderRadius: 11,
      boxShadow: isAI ? '0 4px 14px rgba(232,116,43,0.16)' : '0 2px 8px rgba(7,27,58,0.04)',
    }}>
      {/* Time column */}
      <div style={{
        fontSize: 12, fontWeight: 700,
        color: isAI ? '#C84B26' : '#4A6670',
        whiteSpace: 'nowrap',
      }}>
        {timeLabel}
      </div>

      {/* Color bar */}
      <div style={{
        height: '100%', minHeight: 24, borderRadius: 2,
        background: isAI ? 'linear-gradient(180deg, #FF9D5A, #E8742B)' : '#4A6670',
      }} />

      {/* Event details */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: '#0B1F3A',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {event.summary}
        </div>
        {event.location && (
          <div style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 2 }}>
            📍 {event.location}
          </div>
        )}
      </div>

      {/* AI Booked badge — only shown for events created by BellAveGo */}
      {isAI && (
        <span style={{
          padding: '4px 10px', borderRadius: 99,
          background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)',
          color: '#0B1F3A', fontSize: 9, fontWeight: 900,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          AI Booked
        </span>
      )}
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  )
}
