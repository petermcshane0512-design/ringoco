'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import CalendarGrid from '@/components/CalendarGrid'
import AppointmentModal from '@/components/AppointmentModal'

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
  // Appointment modal state — controls the "+ Add appointment" + edit flows.
  // modalMode='create' opens fresh form; 'edit' loads the row by id.
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [modalInitialStart, setModalInitialStart] = useState<string | undefined>(undefined)
  const [modalAppointmentId, setModalAppointmentId] = useState<string | undefined>(undefined)
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
    } catch { setConnections([]) }
    finally { setLoading(false) }
    // Native calendar is always present — load events regardless of any
    // external connection. The events endpoint returns the contractor's
    // BellAveGo appointments + any synced external events on top.
    loadEvents()
  }

  function openCreateModal(start?: string) {
    setModalMode('create')
    setModalInitialStart(start)
    setModalAppointmentId(undefined)
  }
  function openEditModal(id: string) {
    setModalMode('edit')
    setModalAppointmentId(id)
    setModalInitialStart(undefined)
  }
  function closeModal(changed: boolean) {
    setModalMode(null)
    setModalAppointmentId(undefined)
    setModalInitialStart(undefined)
    if (changed) loadEvents()
  }

  /**
   * Drag-to-reschedule: contractor dragged an event on the calendar grid
   * to a new time (or resized to change duration). PATCH the appointment
   * with the new times; the API route also fires the outbound mirror so
   * Google/Outlook update automatically.
   *
   * Optimistic UI: FullCalendar already moved the event visually before
   * this fires. On API failure we toast + refetch to revert.
   */
  async function handleDragReschedule(eventId: string, startIso: string, endIso: string) {
    // Only attempt to PATCH native rows. External events (Google/MS
    // free/busy items merged into the grid) have non-UUID ids and aren't
    // editable from here — silently revert on next refresh.
    try {
      const res = await fetch(`/api/calendar/appointments/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: startIso, scheduledEndAt: endIso }),
      })
      if (!res.ok) {
        // Snap back to truth (the API rejected it) by refetching
        await loadEvents()
        alert('Could not reschedule — refresh + try again. If it keeps failing, text our team at 773-710-9565.')
      } else {
        // Refresh so the agenda + status pills reflect the new time
        await loadEvents()
      }
    } catch {
      await loadEvents()
    }
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

  // Multi-provider mirror — find each enabled provider independently so the
  // contractor can sync to Google AND Outlook simultaneously.
  const googleConnection    = connections.find((c) => c.enabled && c.provider === 'google')
  const microsoftConnection = connections.find((c) => c.enabled && c.provider === 'microsoft')

  async function disconnectProvider(provider: 'google' | 'microsoft') {
    const label = provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'
    if (!confirm(`Stop mirroring BellAveGo jobs to ${label}? Your existing BellAveGo appointments stay — only the phone sync stops.`)) return
    setDisconnecting(true)
    try {
      await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
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
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>
        ← Back to dashboard
      </Link>

      {/* HERO — branded calendar header. This is the contractor's primary
          workspace after "Dashboard" itself. AI books here, manual entries
          land here, jobs flow into the agenda below. */}
      <header style={{
        marginTop: 14,
        marginBottom: 22,
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
        borderRadius: 20,
        color: '#fff',
        boxShadow: '0 14px 40px rgba(7,27,58,0.22)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute',
          top: -60, right: -60,
          width: 220, height: 220, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,157,90,0.35) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <Image
                src="/brand/bellavego-logo.png"
                alt="BellAveGo"
                width={132} height={42}
                style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                priority
              />
              <span style={{
                fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                background: 'rgba(255,255,255,0.12)', color: '#5EEAD4',
                padding: '4px 10px', borderRadius: 99,
              }}>
                Calendar
              </span>
            </div>
            <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0, marginBottom: 8, color: '#fff' }}>
              Your jobs, your schedule.
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, maxWidth: 580, margin: 0 }}>
              Every appointment the AI books shows up here instantly. Add the ones you booked manually, block off lunch and vacation, and the AI will only offer time slots that respect what you have planned.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <button
              onClick={() => openCreateModal()}
              style={{
                padding: '14px 24px', borderRadius: 12,
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                color: '#0B1F3A', border: 'none',
                fontSize: 14, fontWeight: 900,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 10px 28px rgba(232,116,43,0.42)',
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add appointment
            </button>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
              {events.length} upcoming · {connections.filter(c => c.enabled && (c.provider === 'google' || c.provider === 'microsoft')).length > 0 ? 'Synced to your phone' : 'BellAveGo only'}
            </div>
          </div>
        </div>
      </header>

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

{/* SYNC PROVIDERS — small secondary section under the calendar grid below */}

      {/* CALENDAR GRID — primary surface. Renders ALL appointments from the
          native BellAveGo calendar + any synced external events. Events the
          AI booked render in sunset-orange. Click any event to edit, click
          any empty slot to create a new appointment. */}
      <section style={{ marginTop: 8 }}>
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
            ) : events.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 38, marginBottom: 6 }}>📅</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>
                  No appointments yet.
                </div>
                <p style={{ fontSize: 13, color: '#7AAAB2', maxWidth: 380, margin: '0 auto 18px', lineHeight: 1.55 }}>
                  When the AI books a job during a call, it lands here automatically. Or jump-start your calendar by adding any existing appointments you have on the books.
                </p>
                <button
                  onClick={() => openCreateModal()}
                  style={{
                    padding: '11px 22px', borderRadius: 11,
                    background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                    color: '#0B1F3A', border: 'none',
                    fontSize: 13, fontWeight: 900,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 8px 22px rgba(232,116,43,0.32)',
                  }}
                >
                  + Add your first appointment
                </button>
              </div>
            ) : (
              <CalendarGrid
                events={events}
                onRefresh={loadEvents}
                onEventClick={(id) => openEditModal(id)}
                onSlotClick={(startIso) => openCreateModal(startIso)}
                onEventDrop={handleDragReschedule}
                onEventResize={handleDragReschedule}
              />
            )}
          </div>
        </section>

      {/* SYNC TO PHONE — secondary surface explaining how BellAveGo mirrors to
          the contractor's phone calendars. Hierarchy:
            BellAveGo Calendar (above)  →  THE calendar
            Google + Outlook (below)    →  optional outbound mirror
          Each provider has its own card showing connected/disconnected state. */}
      <section style={{ marginTop: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 900, color: '#0AA89F',
            background: 'rgba(10,168,159,0.10)', padding: '3px 10px', borderRadius: 99,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            Optional
          </span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.03em', margin: '0 0 6px' }}>
          Send your jobs to your phone
        </h2>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, margin: '0 0 18px', maxWidth: 720 }}>
          Connect <strong>Google Calendar</strong>, <strong>Microsoft Outlook</strong>, or <strong>both</strong>. Every BellAveGo appointment — AI-booked or manually added — gets mirrored into the calendars you connect, so it shows up in the calendar app on your phone. <strong>BellAveGo stays the boss</strong>: edits and cancellations always flow OUT of here, never back in.
        </p>

        {/* Pre-verification heads-up for Microsoft only (Google is verified now) */}
        {!microsoftConnection && (
          <div style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: '#FFF8EC',
            border: '1.5px solid #FBD38D',
            borderRadius: 12,
            display: 'flex', gap: 10, alignItems: 'flex-start',
            fontSize: 12, color: '#6B4317', lineHeight: 1.55,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>ℹ️</span>
            <div>
              <strong style={{ color: '#78350F' }}>Heads up for Outlook:</strong> Microsoft is still finishing our publisher verification (~1-2 days). You&apos;ll see a one-time &quot;unverified publisher&quot; notice during the consent screen — click <strong>Continue</strong> to proceed. Google Calendar is fully verified and shows no warning.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {/* GOOGLE provider card */}
          <ProviderSyncCard
            providerKey="google"
            label="Google Calendar"
            description="Personal Gmail or Google Workspace"
            badgeBg="#fff"
            badgeBorder="#DADCE0"
            connection={googleConnection}
            disconnecting={disconnecting}
            onConnect="/api/calendar/google/connect"
            onDisconnect={() => disconnectProvider('google')}
            logo={
              <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            }
          />

          {/* MICROSOFT provider card */}
          <ProviderSyncCard
            providerKey="microsoft"
            label="Microsoft Outlook"
            description="Outlook.com, Office 365, Exchange"
            badgeBg="#fff"
            badgeBorder="#DADCE0"
            connection={microsoftConnection}
            disconnecting={disconnecting}
            onConnect="/api/calendar/microsoft/connect"
            onDisconnect={() => disconnectProvider('microsoft')}
            logo={
              <svg width="22" height="22" viewBox="0 0 23 23" aria-hidden="true">
                <rect x="1"  y="1"  width="10" height="10" fill="#F25022"/>
                <rect x="12" y="1"  width="10" height="10" fill="#7FBA00"/>
                <rect x="1"  y="12" width="10" height="10" fill="#00A4EF"/>
                <rect x="12" y="12" width="10" height="10" fill="#FFB900"/>
              </svg>
            }
          />
        </div>

        {/* Privacy + how-it-works summary */}
        <div style={{ marginTop: 18, padding: '14px 18px', background: '#F0FAF7', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <strong style={{ fontSize: 12, color: '#0B1F3A' }}>What we do (and don&apos;t do) with your phone calendar</strong>
          </div>
          <ul style={{ paddingLeft: 22, margin: 0, fontSize: 12, color: '#4A6670', lineHeight: 1.7 }}>
            <li><strong>OUT</strong>: every BellAveGo appointment is pushed to your connected calendars (so your phone shows it).</li>
            <li><strong>IN</strong>: we read your free/busy windows so the AI never offers a slot you&apos;re already booked in.</li>
            <li><strong>NEVER</strong>: we don&apos;t read event titles, attendees, descriptions, or locations from your phone calendar.</li>
            <li><strong>EDITS</strong>: change a job in BellAveGo → your phone calendar updates. Change it in Google → BellAveGo ignores the change. (Source of truth = BellAveGo.)</li>
          </ul>
        </div>
      </section>

      {/* Appointment modal — mounted last so it overlays everything */}
      {modalMode && (
        <AppointmentModal
          mode={modalMode}
          initialStart={modalInitialStart}
          appointmentId={modalAppointmentId}
          onClose={closeModal}
        />
      )}
    </main>
  )
}

/** Single provider sync card — Google or Outlook. Two visual states:
 *  CONNECTED  → green border, account email shown, Disconnect button
 *  DISCONNECTED → neutral border, Connect button
 */
function ProviderSyncCard({
  providerKey, label, description, logo, connection, disconnecting,
  onConnect, onDisconnect, badgeBg, badgeBorder,
}: {
  providerKey: 'google' | 'microsoft'
  label: string
  description: string
  logo: React.ReactNode
  connection: Connection | undefined
  disconnecting: boolean
  onConnect: string
  onDisconnect: () => void
  badgeBg: string
  badgeBorder: string
}) {
  const connected = !!connection
  return (
    <div style={{
      background: connected ? '#fff' : '#fff',
      border: connected ? '1.5px solid #22C55E' : '1.5px solid rgba(10,168,159,0.18)',
      borderRadius: 14,
      padding: '18px 20px',
      boxShadow: connected
        ? '0 6px 22px rgba(34,197,94,0.12)'
        : '0 2px 10px rgba(7,27,58,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Logo + name + status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          flexShrink: 0,
          width: 44, height: 44, borderRadius: 11,
          background: badgeBg, border: `1px solid ${badgeBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {logo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.01em' }}>
            {label}
          </div>
          {connected ? (
            <div style={{ fontSize: 12, color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
              ● Connected{connection?.email ? ` · ${connection.email}` : ''}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 2 }}>
              {description}
            </div>
          )}
        </div>
      </div>

      {/* CTA row */}
      {connected ? (
        <button
          onClick={onDisconnect}
          disabled={disconnecting}
          style={{
            padding: '10px 14px', borderRadius: 9,
            background: '#FEF2F2', color: '#991B1B',
            border: '1px solid #FECACA',
            fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {disconnecting ? 'Disconnecting…' : 'Stop mirroring'}
        </button>
      ) : (
        <a
          href={onConnect}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '11px 16px', borderRadius: 10,
            background: providerKey === 'google' ? '#fff' : '#fff',
            border: '1.5px solid #DADCE0',
            color: '#1F1F1F', fontSize: 13, fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
          }}
        >
          Connect {label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </a>
      )}
    </div>
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
