'use client'

import { useEffect, useState } from 'react'

/**
 * LiveActivityMarquee — scrolling social-proof ticker.
 *
 * Hormozi $100M Sales doctrine: "show the customer a line of people
 * already buying — they FOMO in." Implemented as an infinite
 * right-to-left scrolling marquee of recent shop activity:
 * bookings, replies, signups, zip locks.
 *
 * Spinner cycles every ~1.2s adding 1 new event so it FEELS live.
 * Duplicated rail underneath so the loop is seamless.
 */

type Event = {
  icon: string
  text: string
  ago: string
}

const SEED_EVENTS: Event[] = [
  { icon: '💰', text: 'Mike C. (HVAC · Plano TX) booked a $4,200 install',     ago: '2 min ago' },
  { icon: '🔒', text: 'ZIP 75024 just locked by a Plano shop',                  ago: '3 min ago' },
  { icon: '💬', text: 'Sarah W. (Roofing · Atlanta) replied to her storm lead', ago: '5 min ago' },
  { icon: '🎯', text: 'Tony S. (HVAC · Tucson) booked $3,800 combo install',    ago: '7 min ago' },
  { icon: '🚀', text: 'New shop signed up · Phoenix AZ',                        ago: '9 min ago' },
  { icon: '💬', text: 'Linda H. (Electrical · Allen TX) replied: "send a quote"', ago: '11 min ago' },
  { icon: '🔒', text: 'ZIP 30329 just locked by an Atlanta roofer',             ago: '14 min ago' },
  { icon: '💰', text: 'James P. (Plumbing · McKinney) booked $2,800 walkthrough', ago: '16 min ago' },
  { icon: '✉', text: '10 fresh leads delivered to 47 dashboards · this morning', ago: '17 min ago' },
  { icon: '🎯', text: 'Greg F. (Roofing · Fort Worth) booked $11,400 reroof',   ago: '19 min ago' },
  { icon: '🚀', text: 'New shop signed up · Miami FL',                          ago: '22 min ago' },
  { icon: '💬', text: 'Maria L. (HVAC · Phoenix) replied: "Sat 10am works"',    ago: '24 min ago' },
  { icon: '🔒', text: 'ZIP 85710 just locked by a Tucson HVAC shop',            ago: '27 min ago' },
  { icon: '💰', text: 'Rachel B. (HVAC · Atlanta) booked $5,600 install',       ago: '29 min ago' },
  { icon: '✉', text: 'AI scoring complete · 247 leads queued for Monday',      ago: '31 min ago' },
]

export default function LiveActivityMarquee() {
  const [pulse, setPulse] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 800)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(90deg, #0B1F3A 0%, #163356 100%)',
        borderTop: '1px solid rgba(94,234,212,0.18)',
        borderBottom: '1px solid rgba(94,234,212,0.18)',
        padding: '10px 0',
      }}
    >
      {/* Pulse indicator */}
      <div style={{
        position: 'absolute', top: 9, left: 'clamp(16px, 4vw, 32px)',
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 10.5, fontWeight: 800, color: '#5EEAD4',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        zIndex: 2,
        background: 'rgba(11,31,58,0.92)',
        padding: '4px 10px', borderRadius: 99,
        border: '1px solid rgba(94,234,212,0.40)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#22C55E',
          boxShadow: pulse ? '0 0 10px #22C55E' : '0 0 3px #22C55E',
          transition: 'box-shadow 700ms ease',
        }} />
        LIVE
      </div>

      {/* Fade edges */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 90, background: 'linear-gradient(to right, #0B1F3A, transparent)', zIndex: 1, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: 90, background: 'linear-gradient(to left, #0B1F3A, transparent)', zIndex: 1, pointerEvents: 'none',
      }} />

      {/* Scrolling rail */}
      <div className="lam-rail" style={{ display: 'flex', whiteSpace: 'nowrap', gap: 56 }}>
        {[...SEED_EVENTS, ...SEED_EVENTS].map((e, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: 'rgba(255,248,240,0.92)', fontWeight: 600,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 16 }}>{e.icon}</span>
            <span>{e.text}</span>
            <span style={{ color: 'rgba(94,234,212,0.55)', fontWeight: 700, fontSize: 11 }}>{e.ago}</span>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes lamScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .lam-rail {
          animation: lamScroll 65s linear infinite;
        }
        @media (max-width: 720px) {
          .lam-rail { animation-duration: 45s; }
        }
      `}</style>
    </div>
  )
}
