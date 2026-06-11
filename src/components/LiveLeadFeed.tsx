'use client'

import { useEffect, useState } from 'react'

/**
 * LiveLeadFeed — horizontal marquee of REAL lead-discovery events from
 * /api/live-feed (the `leads` table, ZIP-level, zero PII).
 *
 * This is the honest replacement for the fake LiveActivityMarquee deleted
 * 2026-06-10. Per the rule recorded in page.tsx: a ticker may exist ONLY
 * if it renders from a real events table and hides while that table is
 * empty. Component returns null when < 6 real events come back.
 */

type FeedEvent = {
  zip: string
  label: string
  trade: string | null
  at: string
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

const TRADE_COLOR: Record<string, string> = {
  hvac: '#E8742B',
  plumbing: '#0E7490',
  roofing: '#7C3AED',
  electrical: '#CA8A04',
  handyman: '#16803F',
}

export default function LiveLeadFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/live-feed')
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok && Array.isArray(j.events)) setEvents(j.events)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (events.length < 6) return null

  // Duplicate the list so the CSS translateX(-50%) loop is seamless.
  const loop = [...events, ...events]

  return (
    <section aria-label="Live lead discovery feed" style={{
      background: '#0B1F3A',
      borderTop: '1px solid rgba(232,116,43,0.25)',
      borderBottom: '1px solid rgba(232,116,43,0.25)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
      }}>
        {/* LIVE badge — sticky left */}
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          background: '#0B1F3A',
          zIndex: 2,
          boxShadow: '8px 0 16px rgba(11,31,58,0.9)',
        }}>
          <span style={{ position: 'relative', width: 9, height: 9, flexShrink: 0 }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: '#22C55E',
            }} />
            <span style={{
              position: 'absolute', inset: -3, borderRadius: '50%',
              border: '2px solid rgba(34,197,94,0.6)',
              animation: 'bavgLivePing 1.6s cubic-bezier(0,0,0.2,1) infinite',
            }} />
          </span>
          <span style={{
            fontSize: 10.5, fontWeight: 900, color: '#22C55E',
            letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>Live · AI scanning</span>
        </div>

        {/* Marquee */}
        <div style={{ overflow: 'hidden', flex: 1, position: 'relative' }} className="bavg-feed-mask">
          <div className="bavg-feed-track" style={{
            display: 'flex', gap: 28, alignItems: 'center',
            width: 'max-content',
            padding: '10px 0',
          }}>
            {loop.map((e, i) => {
              const tradeKey = (e.trade || '').toLowerCase()
              const dot = TRADE_COLOR[tradeKey] || '#FF9D5A'
              return (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontSize: 12.5, color: 'rgba(255,248,240,0.88)',
                  whiteSpace: 'nowrap', fontWeight: 600,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  <span style={{ color: '#FFC58A', fontWeight: 800 }}>ZIP {e.zip}</span>
                  <span>{e.label}</span>
                  <span style={{ color: 'rgba(122,170,178,0.9)', fontSize: 11 }}>{relTime(e.at)}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes bavgLivePing {
          0%   { transform: scale(0.8); opacity: 1; }
          80%  { transform: scale(2.1); opacity: 0; }
          100% { transform: scale(2.1); opacity: 0; }
        }
        @keyframes bavgFeedScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .bavg-feed-track {
          animation: bavgFeedScroll 55s linear infinite;
        }
        .bavg-feed-mask:hover .bavg-feed-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .bavg-feed-track { animation: none; }
        }
      `}</style>
    </section>
  )
}
