'use client'

import { useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventInput, DateSelectArg, EventDropArg } from '@fullcalendar/core'
import type { DateClickArg, EventResizeDoneArg } from '@fullcalendar/interaction'

export type CalendarEventLike = {
  id: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay: boolean
  isBellaveGo: boolean
}

/**
 * Visual calendar grid (month / week / day) that renders the contractor's
 * connected calendar events. Events booked by BellAveGo's AI receptionist
 * (identified by event_id starting with `bellavego_`) are rendered with the
 * sunset-orange brand color so they pop visually against the contractor's
 * regular events (which use the navy brand color).
 *
 * Powered by FullCalendar (MIT-licensed core + plugins). Click on any event
 * to open a detail card with description + location.
 */
export default function CalendarGrid({ events, onRefresh, onEventClick, onSlotClick, onEventDrop, onEventResize }: {
  events: CalendarEventLike[]
  onRefresh?: () => void
  /** When provided, clicking an event calls this with the event id and the
   *  built-in detail popover is suppressed. Use for routing to a full edit
   *  modal (e.g. AppointmentModal). */
  onEventClick?: (eventId: string) => void
  /** When provided, clicking an empty time slot fires with the ISO timestamp
   *  of that slot. Use to open the "create appointment" modal pre-filled. */
  onSlotClick?: (startIso: string) => void
  /** Fires when an event is dragged to a new time. Both start + end already
   *  reflect the new slot. Use to PATCH /api/calendar/appointments/[id]. */
  onEventDrop?: (eventId: string, startIso: string, endIso: string) => void
  /** Fires when an event is resized (changes duration). */
  onEventResize?: (eventId: string, startIso: string, endIso: string) => void
}) {
  const calRef = useRef<FullCalendar | null>(null)
  const [selected, setSelected] = useState<CalendarEventLike | null>(null)

  const fcEvents: EventInput[] = useMemo(
    () =>
      events.map((ev) => ({
        id: ev.id,
        title: ev.summary,
        start: ev.start,
        end: ev.end,
        allDay: ev.allDay,
        backgroundColor: ev.isBellaveGo ? '#E8742B' : '#0B1F3A',
        borderColor:     ev.isBellaveGo ? '#C84B26' : '#0B1F3A',
        textColor:       '#FFFFFF',
        classNames:      ev.isBellaveGo ? ['bavg-ai-event'] : ['bavg-regular-event'],
        extendedProps: {
          isBellaveGo: ev.isBellaveGo,
          description: ev.description,
          location: ev.location,
        },
      })),
    [events],
  )

  function handleEventClick(arg: EventClickArg) {
    // If parent passed a click handler, defer to it (e.g. open AppointmentModal
    // for full edit/reschedule/cancel UX). Otherwise fall back to the built-in
    // detail popover.
    if (onEventClick) {
      onEventClick(arg.event.id)
      return
    }
    const ext = arg.event.extendedProps as { isBellaveGo?: boolean; description?: string; location?: string }
    setSelected({
      id: arg.event.id,
      summary: arg.event.title,
      description: ext.description,
      location: ext.location,
      start: arg.event.startStr,
      end: arg.event.endStr,
      allDay: arg.event.allDay,
      isBellaveGo: !!ext.isBellaveGo,
    })
  }

  function handleDateClick(arg: DateClickArg) {
    // Click on a day cell (month view) or time slot (week/day view) → open
    // create modal with that timestamp prefilled.
    if (onSlotClick) onSlotClick(arg.date.toISOString())
  }
  function handleDateSelect(arg: DateSelectArg) {
    if (onSlotClick) onSlotClick(arg.start.toISOString())
  }

  function handleEventDrop(arg: EventDropArg) {
    if (!onEventDrop) {
      arg.revert()
      return
    }
    const start = arg.event.start
    const end = arg.event.end ?? (start ? new Date(start.getTime() + 90 * 60 * 1000) : null)
    if (!start || !end) {
      arg.revert()
      return
    }
    onEventDrop(arg.event.id, start.toISOString(), end.toISOString())
  }

  function handleEventResize(arg: EventResizeDoneArg) {
    if (!onEventResize) {
      arg.revert()
      return
    }
    const start = arg.event.start
    const end = arg.event.end
    if (!start || !end) {
      arg.revert()
      return
    }
    onEventResize(arg.event.id, start.toISOString(), end.toISOString())
  }

  return (
    <div className="bavg-cal-wrap">
      <style>{`
        /* Brand-style overrides on FullCalendar's default skin. Kept scoped to .bavg-cal-wrap so we don't poison other surfaces. */
        .bavg-cal-wrap .fc { font-family: 'Inter', system-ui, sans-serif; font-size: 12.5px; }
        .bavg-cal-wrap .fc-theme-standard .fc-scrollgrid,
        .bavg-cal-wrap .fc-theme-standard td,
        .bavg-cal-wrap .fc-theme-standard th { border-color: rgba(10,168,159,0.14); }
        .bavg-cal-wrap .fc .fc-toolbar-title { font-size: 18px; font-weight: 800; color: #0B1F3A; letter-spacing: -0.02em; }
        .bavg-cal-wrap .fc .fc-button {
          background: #fff;
          border: 1px solid rgba(10,168,159,0.24);
          color: #0AA89F;
          font-weight: 700;
          font-size: 12px;
          padding: 6px 12px;
          text-transform: capitalize;
          box-shadow: none;
        }
        .bavg-cal-wrap .fc .fc-button:hover { background: rgba(10,168,159,0.06); }
        .bavg-cal-wrap .fc .fc-button-primary:not(:disabled).fc-button-active,
        .bavg-cal-wrap .fc .fc-button-primary:not(:disabled):active {
          background: linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%);
          border-color: #0AA89F;
          color: #fff;
        }
        .bavg-cal-wrap .fc-daygrid-day.fc-day-today { background: rgba(232,116,43,0.06); }
        .bavg-cal-wrap .fc .fc-col-header-cell-cushion,
        .bavg-cal-wrap .fc .fc-daygrid-day-number {
          color: #4A6670; text-decoration: none; font-weight: 600;
        }
        .bavg-cal-wrap .fc-event { cursor: pointer; border-radius: 5px; padding: 1px 4px; }
        .bavg-cal-wrap .bavg-ai-event {
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 40%, #E8742B) !important;
          color: #0B1F3A !important;
          font-weight: 700;
          box-shadow: 0 2px 6px rgba(232,116,43,0.32);
        }
        .bavg-cal-wrap .bavg-ai-event .fc-event-title,
        .bavg-cal-wrap .bavg-ai-event .fc-event-time { color: #0B1F3A !important; }
        .bavg-cal-wrap .bavg-regular-event { opacity: 0.92; }
      `}</style>

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
        events={fcEvents}
        eventClick={handleEventClick}
        dateClick={onSlotClick ? handleDateClick : undefined}
        selectable={!!onSlotClick}
        select={onSlotClick ? handleDateSelect : undefined}
        editable={!!(onEventDrop || onEventResize)}
        eventDurationEditable={!!onEventResize}
        eventStartEditable={!!onEventDrop}
        eventDrop={onEventDrop ? handleEventDrop : undefined}
        eventResize={onEventResize ? handleEventResize : undefined}
        height="auto"
        contentHeight={620}
        dayMaxEventRows={3}
        nowIndicator
        weekends
        eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        slotLabelFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
        /* 2026-06-07 — Restrict week/day timegrid to business hours so the
           view isn't a 24-hour wall of empty 1am-5am slots. Contractors
           book jobs 6am-9pm. Keeps the grid scannable. */
        slotMinTime="06:00:00"
        slotMaxTime="21:00:00"
        scrollTime="08:00:00"
        allDaySlot={false}
        slotDuration="00:30:00"
        expandRows
      />

      {/* Detail card overlay when an event is clicked */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(11,31,58,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480, width: '100%',
              background: '#fff', borderRadius: 18,
              padding: '24px 26px',
              border: selected.isBellaveGo ? '2px solid #E8742B' : '1px solid rgba(10,168,159,0.18)',
              boxShadow: '0 24px 60px rgba(7,27,58,0.20)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              {selected.isBellaveGo && (
                <span style={{
                  padding: '4px 10px', borderRadius: 99,
                  background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)',
                  color: '#0B1F3A', fontSize: 9, fontWeight: 900,
                  letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0,
                }}>
                  AI Booked
                </span>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  marginLeft: 'auto', background: 'transparent',
                  border: 'none', cursor: 'pointer',
                  fontSize: 20, color: '#7AAAB2', lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0B1F3A', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              {selected.summary}
            </h3>

            <div style={{ fontSize: 13, color: '#4A6670', marginBottom: 12 }}>
              🕐 {formatRange(selected.start, selected.end, selected.allDay)}
            </div>

            {selected.location && (
              <div style={{ fontSize: 13, color: '#4A6670', marginBottom: 10 }}>
                📍 {selected.location}
              </div>
            )}

            {selected.description && (
              <div style={{
                fontSize: 12.5, color: '#4A6670', lineHeight: 1.55,
                marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(10,168,159,0.14)',
                whiteSpace: 'pre-wrap',
              }}>
                {selected.description}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtle refresh hint */}
      {onRefresh && (
        <div style={{ marginTop: 10, textAlign: 'right' }}>
          <button
            onClick={onRefresh}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11.5, color: '#0AA89F', fontWeight: 700,
            }}
          >
            ↻ Refresh from calendar
          </button>
        </div>
      )}
    </div>
  )
}

function formatRange(startStr: string, endStr: string, allDay: boolean): string {
  if (!startStr) return ''
  const start = new Date(startStr)
  if (allDay) {
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) + ' · All day'
  }
  const end = endStr ? new Date(endStr) : null
  const day = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const t1 = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const t2 = end ? end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
  return end ? `${day} · ${t1} – ${t2}` : `${day} · ${t1}`
}
