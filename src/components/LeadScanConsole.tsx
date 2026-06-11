'use client'

import Link from 'next/link'
import { LEADS_PER_WEEK } from '@/lib/offer'

/**
 * LeadScanConsole — the "agents are scanning your neighborhood" empty state
 * for /dashboard/leads, shown between signup and the first lead drop.
 *
 * 2026-06-10 per Peter: replace the white dashed-border queue card with a
 * mission-control console — dark radar sweep, streaming agent log, live
 * counters. Has to FEEL like 24 systems working the customer's exact
 * address, because that is literally what is happening (find-real-leads →
 * BatchData → skip-trace → scoring fires on the Stripe webhook + the
 * page's own check-and-drop kick).
 *
 * Honesty contract: every log line maps to a real pipeline stage. The
 * scanCount ticker is presentation (parent animates it), but the stages,
 * recipes, and radii described are the actual engine behavior.
 *
 * Parent owns the timers (pipelineStep cycles 0-5, scanCount ticks) so
 * this stays a pure render of that state.
 */

const LOG_SCRIPT = [
  { t: 'geocode', line: 'business address anchored → lat/lng locked' },
  { t: 'ring-scan', line: 'sweeping 1-mile ring · owner-occupied parcels only' },
  { t: 'recipe', line: 'trade + climate filter applied to every parcel' },
  { t: 'scoring', line: 'intent scoring 0–100 · sale recency · system age' },
  { t: 'skip-trace', line: 'verifying owner phone numbers (top matches)' },
  { t: 'permits', line: 'cross-ref: building permits filed last 14 days' },
  { t: 'storms', line: 'cross-ref: verified hail + wind events' },
  { t: 'assembling', line: `final cut: ${LEADS_PER_WEEK} highest-intent → your dashboard` },
]

const STEPS = [
  { icon: '🏠', label: 'Address-anchored pull', sub: 'every owner-occupied home, starting 1 mile out' },
  { icon: '🧬', label: 'Trade + climate recipe', sub: 'HVAC hot-state 2008-15 · plumbing pre-1995 · roofing 01-11' },
  { icon: '📞', label: 'Skip-trace verification', sub: 'owner phones verified before they reach you' },
  { icon: '🏗️', label: 'Permit + storm overlay', sub: 'active-project + insurance-window signals on top' },
  { icon: '🎯', label: 'Drop assembly', sub: `${LEADS_PER_WEEK} highest-intent land here · ${LEADS_PER_WEEK} more every 7 days` },
]

export default function LeadScanConsole({ scanCount, pipelineStep }: { scanCount: number; pipelineStep: number }) {
  // Log reveals 2 lines per pipeline step, loops with the step cycle.
  const visibleLines = Math.min(LOG_SCRIPT.length, pipelineStep * 2 + 2)
  const ringMiles = Math.min(5, pipelineStep + 1)

  return (
    <div style={{
      borderRadius: 20,
      overflow: 'hidden',
      background: 'linear-gradient(155deg, #060D18 0%, #0B1F3A 55%, #0A2530 100%)',
      border: '1px solid rgba(94,234,212,0.22)',
      boxShadow: '0 24px 60px rgba(4,12,24,0.55), inset 0 1px 0 rgba(94,234,212,0.10)',
      color: '#E6FFFA',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Console title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(94,234,212,0.14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', gap: 5 }}>
            <i style={dot('#FF5F57')} /><i style={dot('#FEBC2E')} /><i style={dot('#28C840')} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', color: '#5EEAD4', textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>
            BellAveGo Intelligence · neighborhood scan
          </span>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 900, color: '#34D399', letterSpacing: '0.12em', fontFamily: 'ui-monospace, monospace' }}>
          <i style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', display: 'inline-block', animation: 'scanLive 1s ease-in-out infinite' }} />
          LIVE
        </span>
      </div>

      {/* Radar + log grid */}
      <div className="scan-grid" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 22, padding: '22px 22px 8px', alignItems: 'center' }}>
        {/* RADAR */}
        <div style={{ position: 'relative', width: 230, height: 230, margin: '0 auto' }}>
          {/* rings */}
          {[1, 0.72, 0.44].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', inset: `${(1 - s) * 50}%`,
              borderRadius: '50%',
              border: '1px solid rgba(94,234,212,0.22)',
            }} />
          ))}
          {/* crosshairs */}
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(94,234,212,0.12)' }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(94,234,212,0.12)' }} />
          {/* rotating sweep */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(52,211,153,0.45), rgba(52,211,153,0.06) 18%, transparent 30%)',
            animation: 'scanSweep 3.2s linear infinite',
          }} />
          {/* blips */}
          <i style={blip('64%', '30%', '0s')} />
          <i style={blip('28%', '58%', '1.1s')} />
          <i style={blip('70%', '68%', '2.2s')} />
          {/* center pin */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            fontSize: 20, filter: 'drop-shadow(0 0 8px rgba(52,211,153,0.8))',
          }}>📍</div>
          {/* ring label */}
          <div style={{
            position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
            fontSize: 10, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.14em',
            fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap',
          }}>
            RING {ringMiles} MI · WIDENS ON SUPPLY ONLY
          </div>
        </div>

        {/* AGENT LOG */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.02em', color: '#F0FDFA', marginBottom: 2 }}>
            {LEADS_PER_WEEK} leads being pulled around your address right now
          </div>
          <p style={{ fontSize: 12.5, color: 'rgba(230,255,250,0.55)', margin: '0 0 12px', lineHeight: 1.5 }}>
            This screen updates itself — your leads appear here the second the scan completes. Typical first batch: under 2 minutes.
          </p>
          <div style={{
            background: 'rgba(2,8,16,0.72)',
            border: '1px solid rgba(94,234,212,0.14)',
            borderRadius: 12,
            padding: '12px 14px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11.5,
            lineHeight: 1.9,
            minHeight: 150,
          }}>
            {LOG_SCRIPT.slice(0, visibleLines).map((l, i) => {
              const isLast = i === visibleLines - 1
              return (
                <div key={l.t} style={{ display: 'flex', gap: 8, color: isLast ? '#A7F3D0' : 'rgba(167,243,208,0.55)' }}>
                  <span style={{ color: '#34D399', flexShrink: 0 }}>▸</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#5EEAD4' }}>{l.t}</span>: {l.line}
                    {isLast && <span style={{ animation: 'scanCursor 0.9s step-end infinite' }}>▍</span>}
                  </span>
                </div>
              )
            })}
          </div>
          {/* counters strip */}
          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            <Counter label="parcels scanned" value={scanCount.toLocaleString()} />
            <Counter label="scouts active" value="24" />
            <Counter label="drop target" value={`${LEADS_PER_WEEK} leads`} />
          </div>
        </div>
      </div>

      {/* Pipeline steps — compact dark pills */}
      <div style={{ padding: '14px 22px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
          {STEPS.map((s, idx) => {
            const isActive = pipelineStep === idx
            const isDone = pipelineStep > idx
            return (
              <div key={s.label} style={{
                padding: '10px 12px', borderRadius: 10,
                background: isActive ? 'rgba(52,211,153,0.10)' : 'rgba(255,255,255,0.03)',
                border: isActive ? '1px solid rgba(52,211,153,0.45)' : '1px solid rgba(94,234,212,0.10)',
                transition: 'background 240ms ease, border-color 240ms ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: isDone ? '#34D399' : isActive ? '#F0FDFA' : 'rgba(230,255,250,0.45)', letterSpacing: '0.02em' }}>
                    {s.label} {isDone ? '✓' : ''}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(230,255,250,0.40)', lineHeight: 1.45 }}>{s.sub}</div>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 10.5, color: 'rgba(230,255,250,0.35)', margin: '14px 0 0', textAlign: 'center' }}>
          Wrong address or radius? <Link href="/dashboard/settings" style={{ color: '#5EEAD4', fontWeight: 700, textDecoration: 'none' }}>Settings →</Link>
        </p>
      </div>

      <style>{`
        @keyframes scanSweep { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes scanLive { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes scanCursor { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        @keyframes scanBlip { 0% { transform: scale(0.4); opacity: 0 } 30% { opacity: 1 } 100% { transform: scale(1.8); opacity: 0 } }
        @media (max-width: 720px) {
          .scan-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#F0FDFA', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace' }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(94,234,212,0.55)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function dot(c: string): React.CSSProperties {
  return { width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }
}

function blip(top: string, left: string, delay: string): React.CSSProperties {
  return {
    position: 'absolute', top, left,
    width: 7, height: 7, borderRadius: '50%',
    background: '#34D399',
    boxShadow: '0 0 10px rgba(52,211,153,0.9)',
    animation: `scanBlip 2.6s ease-out ${delay} infinite`,
  }
}
