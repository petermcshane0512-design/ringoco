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

      {/* Slim header — calendar is the primary content, header should not
          steal real estate. Title + Add button on one row. (2026-06-07) */}
      <header style={{
        marginTop: 14,
        marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', margin: 0, color: '#0B1F3A' }}>
            Calendar
          </h1>
          <div style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 2 }}>
            {events.length} upcoming · {connections.filter(c => c.enabled && c.provider === 'google').length > 0 ? 'Synced to Google' : 'BellAveGo only'}
          </div>
        </div>
        <button
          onClick={() => openCreateModal()}
          style={{
            padding: '10px 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
            color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add appointment
        </button>
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

      {/* Mode selector moved BELOW the calendar grid 2026-06-01 per Peter.
          The hero "Add appointment" + the calendar itself land first — the
          mode-fork sits between calendar and sync providers. */}

      {/* Anchor for the "Book appointments" mode card. Calendar grid below
          is THE workspace for the booking flow. */}
      <div id="calendar-grid" />
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
            position: 'relative',
          }}>
            {/* Always render the calendar grid — FullCalendar shows the
                month view even with 0 events. Loading + empty states get
                a small overlay/badge so the user sees the calendar layout
                immediately, not a wall of empty-state copy. */}
            <CalendarGrid
              events={events}
              onRefresh={loadEvents}
              onEventClick={(id) => openEditModal(id)}
              onSlotClick={(startIso) => openCreateModal(startIso)}
              onEventDrop={handleDragReschedule}
              onEventResize={handleDragReschedule}
            />
            {eventsLoading && events.length === 0 && (
              <div style={{
                position: 'absolute', top: 14, right: 18,
                fontSize: 11, color: '#7AAAB2', fontWeight: 700,
              }}>
                Loading…
              </div>
            )}
            {!eventsLoading && events.length === 0 && (
              <div style={{
                position: 'absolute', bottom: 18, left: 18, right: 18,
                padding: '10px 14px',
                background: 'rgba(10,168,159,0.06)',
                border: '1px solid rgba(10,168,159,0.18)',
                borderRadius: 10,
                fontSize: 12, color: '#4A6670',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <span>No appointments yet. AI bookings from incoming calls will land here automatically.</span>
                <button
                  onClick={() => openCreateModal()}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
                  }}
                >
                  + Add manually
                </button>
              </div>
            )}
          </div>
        </section>

      {/* 2026-06-07 — Mode selector ("Book vs Summarize") removed from
          this page entirely. It was confusing for daily users (one-time
          decision, not a daily-use surface). Moved to /dashboard/settings
          when needed. The AI's default behavior is "auto-book if calendar
          connected, else take a message" — sensible without configuration. */}

      {/* SYNC TO PHONE — secondary surface explaining how BellAveGo mirrors to
          the contractor's phone calendars. Hierarchy:
            BellAveGo Calendar (above)  →  THE calendar
            Google + Outlook (below)    →  optional outbound mirror
          Each provider has its own card showing connected/disconnected state. */}
      {/* Sync row — slim. BellAveGo Calendar IS the calendar. Google Calendar
          is one optional mirror to your phone. Microsoft Outlook removed
          2026-06-07 (negligible contractor usage + ongoing publisher
          verification issues). The /api/calendar/microsoft/* backend
          routes still exist but no UI surfaces them. */}
      <section style={{ marginTop: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 14, flexWrap: 'wrap',
          padding: '14px 18px',
          background: '#fff',
          border: '1px solid rgba(10,168,159,0.16)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0B1F3A' }}>
                Mirror to Google Calendar
              </div>
              <div style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 2 }}>
                {googleConnection
                  ? `Connected · ${googleConnection.email || 'synced'}${googleConnection.lastSyncedAt ? ` · last sync ${new Date(googleConnection.lastSyncedAt).toLocaleString()}` : ''}`
                  : 'Optional. Every BellAveGo appointment pushes to your Google Calendar app on your phone.'}
              </div>
            </div>
          </div>
          {googleConnection ? (
            <button
              onClick={() => disconnectProvider('google')}
              disabled={disconnecting}
              style={{
                padding: '7px 14px', borderRadius: 8,
                border: '1px solid rgba(10,168,159,0.30)',
                background: '#fff', color: '#4A6670',
                fontSize: 12, fontWeight: 700, cursor: disconnecting ? 'wait' : 'pointer',
              }}
            >
              Disconnect
            </button>
          ) : (
            <Link
              href="/api/calendar/google/connect"
              style={{
                padding: '8px 16px', borderRadius: 8,
                background: 'linear-gradient(135deg, #0AA89F, #06776F)',
                color: '#fff', textDecoration: 'none',
                fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap',
              }}
            >
              Connect Google
            </Link>
          )}
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
