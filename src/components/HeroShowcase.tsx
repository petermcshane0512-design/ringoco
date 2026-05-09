'use client'
import { useEffect, useState } from 'react'

type Phase = 'ringing' | 'connecting' | 'transcribing' | 'booking' | 'booked'

const SCRIPT: { phase: Phase; line?: string; speaker?: 'caller' | 'ai'; ms: number }[] = [
  { phase: 'ringing', ms: 1800 },
  { phase: 'connecting', ms: 900 },
  { phase: 'transcribing', speaker: 'ai', line: 'BellAveGo, this is Ava — how can I help?', ms: 2400 },
  { phase: 'transcribing', speaker: 'caller', line: 'Hi, my AC stopped cooling last night.', ms: 2200 },
  { phase: 'transcribing', speaker: 'ai', line: 'Got it. Want the earliest slot — tomorrow 10 AM?', ms: 2400 },
  { phase: 'transcribing', speaker: 'caller', line: 'Yes, please.', ms: 1500 },
  { phase: 'booking', ms: 1100 },
  { phase: 'booked', ms: 2600 },
]

const RECENT_CALLS = [
  { name: 'Mike R.', type: 'HVAC Repair', time: '2m ago', booked: true },
  { name: 'Sarah L.', type: 'Plumbing Issue', time: '18m ago', booked: true },
  { name: 'James W.', type: 'AC Not Cooling', time: '1h ago', booked: false },
  { name: 'Ana K.', type: 'Electrical Check', time: '2h ago', booked: true },
]

export default function HeroShowcase() {
  const [calls, setCalls] = useState(38)
  const [jobs, setJobs] = useState(14)
  const [revenue, setRevenue] = useState(12480)
  const [bumped, setBumped] = useState<string | null>(null)

  const [step, setStep] = useState(0)
  const phase = SCRIPT[step].phase
  const transcript = SCRIPT.slice(0, step + 1).filter(s => s.line) as { line: string; speaker: 'caller' | 'ai' }[]

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.random()
      if (r < 0.42) { setCalls(c => c + 1); flash('calls') }
      else if (r < 0.72) { setRevenue(v => v + (Math.floor(Math.random() * 6) + 1) * 50); flash('revenue') }
      else { setJobs(j => j + 1); flash('jobs') }
    }, 3400)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setStep(s => (s + 1) % SCRIPT.length), SCRIPT[step].ms)
    return () => clearTimeout(t)
  }, [step])

  function flash(k: string) {
    setBumped(k)
    setTimeout(() => setBumped(null), 800)
  }

  return (
    <div className="hs-stage">
      <style>{`
        .hs-stage {
          position: relative;
          width: 100%;
          height: 100%;
          perspective: 2000px;
        }

        /* === Browser window === */
        .hs-browser {
          position: absolute;
          top: 6%;
          left: 2%;
          width: 78%;
          height: 84%;
          border-radius: 16px;
          background: #0F2542;
          border: 1px solid rgba(94,234,212,0.18);
          box-shadow:
            0 40px 90px rgba(0,0,0,0.55),
            0 0 0 1px rgba(94,234,212,0.12),
            0 0 80px rgba(10,168,159,0.18);
          overflow: hidden;
          transform: rotateY(-9deg) rotateX(3deg);
          transform-origin: 60% 50%;
          opacity: 0;
          animation: hsBrowserIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.15s forwards;
        }
        @keyframes hsBrowserIn {
          0%   { opacity: 0; transform: rotateY(-14deg) rotateX(6deg) translateY(20px); }
          100% { opacity: 1; transform: rotateY(-9deg) rotateX(3deg) translateY(0); }
        }

        .hs-chrome {
          height: 38px;
          background: linear-gradient(180deg, #14304F, #0F2542);
          border-bottom: 1px solid rgba(94,234,212,0.10);
          display: flex; align-items: center; gap: 14px;
          padding: 0 14px;
        }
        .hs-traffic { display: flex; gap: 6px; }
        .hs-dot { width: 11px; height: 11px; border-radius: 50%; }
        .hs-url {
          flex: 1;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: rgba(7,22,42,0.85);
          height: 22px;
          border-radius: 7px;
          font-size: 11px;
          color: #7AAAB2;
          font-weight: 500;
        }
        .hs-online {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 700; color: #5EEAD4;
          padding: 4px 9px;
          border-radius: 12px;
          background: rgba(94,234,212,0.10);
          border: 1px solid rgba(94,234,212,0.32);
          white-space: nowrap;
        }
        .hs-online::before {
          content: '';
          width: 6px; height: 6px; border-radius: 50%;
          background: #22C55E;
          box-shadow: 0 0 8px rgba(34,197,94,0.7);
          animation: hsBlink 1.6s infinite;
        }

        .hs-body {
          padding: 18px 18px 16px;
          height: calc(100% - 38px);
          display: flex; flex-direction: column; gap: 14px;
          background: linear-gradient(160deg, #0F2542 0%, #0B1F3A 100%);
          position: relative;
        }
        .hs-body::after {
          content: '';
          position: absolute; inset: 0;
          background-image:
            radial-gradient(circle at 80% 20%, rgba(10,168,159,0.18), transparent 50%),
            radial-gradient(circle at 20% 90%, rgba(94,234,212,0.08), transparent 60%);
          pointer-events: none;
        }

        .hs-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
          position: relative; z-index: 1;
        }
        .hs-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(94,234,212,0.16);
          border-radius: 11px;
          padding: 11px 13px;
          position: relative;
          overflow: hidden;
          transition: box-shadow 0.3s, transform 0.3s, border-color 0.3s;
        }
        .hs-stat.bump {
          box-shadow: 0 0 0 2px rgba(94,234,212,0.6), 0 8px 24px rgba(94,234,212,0.25);
          border-color: rgba(94,234,212,0.5);
          transform: translateY(-2px);
        }
        .hs-stat::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
        }
        .hs-stat.s1::before { background: #5EEAD4; }
        .hs-stat.s2::before { background: #22C55E; }
        .hs-stat.s3::before { background: #FBBF24; }
        .hs-stat-label {
          font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
          color: #7AAAB2; text-transform: uppercase; margin-bottom: 5px;
        }
        .hs-stat-value {
          font-size: 22px; font-weight: 900;
          color: #fff; line-height: 1; letter-spacing: -0.5px;
          font-variant-numeric: tabular-nums;
        }
        .hs-bump-anim { animation: hsBounce 0.4s cubic-bezier(0.34,1.56,0.64,1); }
        @keyframes hsBounce {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.14); }
        }

        .hs-list {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(94,234,212,0.14);
          border-radius: 12px;
          padding: 12px 14px;
          flex: 1;
          position: relative; z-index: 1;
          min-height: 0;
        }
        .hs-list-head {
          font-size: 10px; font-weight: 800;
          color: #fff; letter-spacing: -0.2px;
          margin-bottom: 9px;
          display: flex; justify-content: space-between; align-items: center;
        }
        .hs-list-tag {
          font-size: 8px; font-weight: 700;
          color: #5EEAD4; letter-spacing: 0.1em; text-transform: uppercase;
        }
        .hs-call {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 0;
          border-bottom: 1px solid rgba(94,234,212,0.08);
          font-size: 11px;
        }
        .hs-call:last-child { border-bottom: none; }
        .hs-call-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 800;
          flex-shrink: 0;
        }
        .hs-call-name { font-weight: 600; color: #fff; font-size: 11px; }
        .hs-call-meta { font-size: 9px; color: #7AAAB2; margin-top: 1px; }
        .hs-call-pill {
          font-size: 8.5px; font-weight: 800; letter-spacing: 0.04em;
          padding: 2.5px 8px; border-radius: 9px;
          flex-shrink: 0;
        }

        /* === Phone === */
        .hs-phone {
          position: absolute;
          right: -1%;
          bottom: -4%;
          width: 26%;
          aspect-ratio: 200/410;
          background: linear-gradient(180deg, #0a0a0a, #1a1a1a);
          border-radius: 36px;
          padding: 8px;
          box-shadow:
            0 50px 100px rgba(0,0,0,0.6),
            0 0 0 1.5px rgba(94,234,212,0.18),
            0 0 80px rgba(94,234,212,0.18),
            inset 0 0 0 1px rgba(255,255,255,0.06);
          opacity: 0;
          animation:
            hsPhoneIn 0.9s cubic-bezier(0.22,1,0.36,1) 0.5s forwards,
            hsPhoneFloat 6s ease-in-out 1.4s infinite;
          z-index: 2;
        }
        @keyframes hsPhoneIn {
          0%   { opacity: 0; transform: translateY(40px) scale(0.92) rotateZ(8deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotateZ(4deg); }
        }
        @keyframes hsPhoneFloat {
          0%, 100% { transform: translateY(0) rotateZ(4deg); }
          50%      { transform: translateY(-8px) rotateZ(4deg); }
        }
        .hs-phone-screen {
          width: 100%; height: 100%;
          border-radius: 30px;
          background: linear-gradient(180deg, #0B1F3A 0%, #0A1828 50%, #061224 100%);
          padding: 18px 14px 14px;
          display: flex; flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        .hs-notch {
          position: absolute; top: 9px; left: 50%;
          transform: translateX(-50%);
          width: 38%; height: 16px;
          background: #0a0a0a;
          border-radius: 0 0 12px 12px;
        }
        .hs-phone-status {
          display: flex; justify-content: space-between;
          font-size: 9px; font-weight: 700;
          color: rgba(255,255,255,0.85);
          margin-top: 6px; padding: 0 4px;
        }
        .hs-phone-brand {
          margin-top: 18px;
          text-align: center;
          font-size: 10px; font-weight: 800;
          letter-spacing: 0.18em;
          color: #5EEAD4;
          text-transform: uppercase;
        }
        .hs-phone-state {
          text-align: center;
          font-size: 17px; font-weight: 800;
          color: #fff;
          margin-top: 4px;
          letter-spacing: -0.4px;
        }
        .hs-phone-timer {
          text-align: center;
          font-variant-numeric: tabular-nums;
          font-size: 11px; color: #5EEAD4;
          margin-top: 2px; font-weight: 600;
        }
        .hs-wave {
          margin: 14px auto 8px;
          display: flex; justify-content: center; align-items: center;
          gap: 3px; height: 36px;
        }
        .hs-wave span {
          display: block;
          width: 3px;
          background: linear-gradient(180deg, #5EEAD4, #0AA89F);
          border-radius: 3px;
          box-shadow: 0 0 6px rgba(94,234,212,0.5);
          animation: hsWaveBars 1s ease-in-out infinite;
        }
        .hs-wave span:nth-child(1) { animation-delay: 0.0s; }
        .hs-wave span:nth-child(2) { animation-delay: 0.10s; }
        .hs-wave span:nth-child(3) { animation-delay: 0.20s; }
        .hs-wave span:nth-child(4) { animation-delay: 0.30s; }
        .hs-wave span:nth-child(5) { animation-delay: 0.40s; }
        .hs-wave span:nth-child(6) { animation-delay: 0.30s; }
        .hs-wave span:nth-child(7) { animation-delay: 0.20s; }
        .hs-wave span:nth-child(8) { animation-delay: 0.10s; }
        .hs-wave span:nth-child(9) { animation-delay: 0.0s; }
        @keyframes hsWaveBars {
          0%, 100% { height: 8px; }
          50%      { height: 30px; }
        }
        .hs-transcript {
          flex: 1; min-height: 0;
          display: flex; flex-direction: column; gap: 5px;
          margin-top: 6px;
          overflow: hidden;
        }
        .hs-bubble {
          font-size: 9.5px;
          padding: 6px 9px;
          border-radius: 11px;
          line-height: 1.35;
          max-width: 88%;
          animation: hsBubbleIn 0.32s ease-out;
        }
        .hs-bubble.ai {
          align-self: flex-start;
          background: rgba(94,234,212,0.16);
          border: 1px solid rgba(94,234,212,0.3);
          color: #ECFEFF;
          border-bottom-left-radius: 3px;
        }
        .hs-bubble.caller {
          align-self: flex-end;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          color: #fff;
          border-bottom-right-radius: 3px;
        }
        @keyframes hsBubbleIn {
          0%   { opacity: 0; transform: translateY(6px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .hs-booked {
          margin-top: auto;
          padding: 9px 12px;
          background: linear-gradient(135deg, #22C55E, #15803D);
          border-radius: 11px;
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          text-align: center;
          box-shadow: 0 8px 24px rgba(34,197,94,0.45);
          animation: hsBookedIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes hsBookedIn {
          0%   { opacity: 0; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
        .hs-ringing {
          margin-top: auto; margin-bottom: 12px;
          text-align: center;
        }
        .hs-ring-ico {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0AA89F, #0D8F87);
          display: inline-flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow: 0 0 0 0 rgba(94,234,212,0.55);
          animation: hsRingPulse 1.4s ease-out infinite;
        }
        @keyframes hsRingPulse {
          0%   { box-shadow: 0 0 0 0 rgba(94,234,212,0.55); }
          70%  { box-shadow: 0 0 0 22px rgba(94,234,212,0); }
          100% { box-shadow: 0 0 0 0 rgba(94,234,212,0); }
        }

        @keyframes hsBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }

        .hs-floater {
          position: absolute;
          z-index: 3;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(12px);
          border-radius: 12px;
          padding: 10px 12px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.35), 0 0 0 1px rgba(94,234,212,0.25);
          display: flex; align-items: center; gap: 9px;
          font-size: 11px;
          opacity: 0;
        }
        .hs-floater.f1 {
          top: 4%;
          right: 18%;
          animation: hsFloatA 0.7s ease-out 0.9s forwards, hsFloatBob 5s ease-in-out 1.7s infinite;
        }
        .hs-floater.f2 {
          bottom: 14%;
          left: -2%;
          animation: hsFloatA 0.7s ease-out 1.3s forwards, hsFloatBob 5s ease-in-out 2.4s infinite;
        }
        @keyframes hsFloatA {
          0%   { opacity: 0; transform: translateY(20px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes hsFloatBob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        .hs-floater-icon {
          width: 26px; height: 26px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          color: #fff; flex-shrink: 0;
        }
        .hs-floater-title { font-weight: 800; color: #0AA89F; font-size: 11px; line-height: 1.2; }
        .hs-floater-sub { font-size: 9.5px; color: #4A6670; margin-top: 1px; line-height: 1.3; }

        @media (max-width: 900px) {
          .hs-floater { display: none; }
        }
      `}</style>

      {/* === BROWSER WINDOW === */}
      <div className="hs-browser">
        <div className="hs-chrome">
          <div className="hs-traffic">
            <div className="hs-dot" style={{ background: '#FF5F57' }} />
            <div className="hs-dot" style={{ background: '#FEBC2E' }} />
            <div className="hs-dot" style={{ background: '#28C840' }} />
          </div>
          <div className="hs-url">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7AAAB2" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            bellavego.com/dashboard
          </div>
          <div className="hs-online">AI Online · (762) 371‑3351</div>
        </div>

        <div className="hs-body">
          <div className="hs-stats">
            <div className={`hs-stat s1 ${bumped === 'calls' ? 'bump' : ''}`}>
              <div className="hs-stat-label">Calls Today</div>
              <div className={`hs-stat-value ${bumped === 'calls' ? 'hs-bump-anim' : ''}`}>{calls}</div>
            </div>
            <div className={`hs-stat s2 ${bumped === 'jobs' ? 'bump' : ''}`}>
              <div className="hs-stat-label">Jobs Booked</div>
              <div className={`hs-stat-value ${bumped === 'jobs' ? 'hs-bump-anim' : ''}`}>{jobs}</div>
            </div>
            <div className={`hs-stat s3 ${bumped === 'revenue' ? 'bump' : ''}`}>
              <div className="hs-stat-label">Revenue</div>
              <div className={`hs-stat-value ${bumped === 'revenue' ? 'hs-bump-anim' : ''}`}>${revenue.toLocaleString()}</div>
            </div>
          </div>

          <div className="hs-list">
            <div className="hs-list-head">
              <span>Recent Calls</span>
              <span className="hs-list-tag">Live</span>
            </div>
            {RECENT_CALLS.map((c, i) => (
              <div key={i} className="hs-call">
                <div
                  className="hs-call-avatar"
                  style={{
                    background: c.booked ? 'rgba(34,197,94,0.18)' : 'rgba(251,191,36,0.18)',
                    border: c.booked ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(251,191,36,0.4)',
                    color: c.booked ? '#22C55E' : '#FBBF24',
                  }}
                >{c.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hs-call-name">{c.name} · {c.type}</div>
                  <div className="hs-call-meta">{c.time}</div>
                </div>
                <span
                  className="hs-call-pill"
                  style={c.booked
                    ? { background: 'rgba(34,197,94,0.18)', color: '#86EFAC', border: '1px solid rgba(34,197,94,0.4)' }
                    : { background: 'rgba(251,191,36,0.18)', color: '#FCD34D', border: '1px solid rgba(251,191,36,0.4)' }
                  }
                >{c.booked ? 'Booked' : 'Saved'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* === PHONE MOCKUP === */}
      <div className="hs-phone">
        <div className="hs-phone-screen">
          <div className="hs-notch" />
          <div className="hs-phone-status">
            <span>9:41</span>
            <span>•••</span>
          </div>

          <div className="hs-phone-brand">BellAveGo</div>
          <div className="hs-phone-state">
            {phase === 'ringing' ? 'Incoming call' :
             phase === 'connecting' ? 'Connecting…' :
             phase === 'booking' ? 'Booking job…' :
             phase === 'booked' ? 'Job booked!' :
             'Active call'}
          </div>
          {(phase === 'transcribing' || phase === 'booking' || phase === 'booked') && (
            <div className="hs-phone-timer">{formatTimer(step)}</div>
          )}

          {phase === 'ringing' ? (
            <div className="hs-ringing">
              <div className="hs-ring-ico">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
            </div>
          ) : (
            <>
              <div className="hs-wave">
                {Array.from({ length: 9 }).map((_, i) => <span key={i} />)}
              </div>
              <div className="hs-transcript">
                {transcript.slice(-3).map((t, i) => (
                  <div key={`${step}-${i}`} className={`hs-bubble ${t.speaker}`}>{t.line}</div>
                ))}
              </div>
              {phase === 'booked' && (
                <div className="hs-booked">✓ HVAC tune‑up · Tomorrow 10 AM</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* === FLOATING NOTIFICATIONS === */}
      <div className="hs-floater f1">
        <div className="hs-floater-icon" style={{ background: 'linear-gradient(135deg,#22C55E,#15803D)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div>
          <div className="hs-floater-title">+$487 to pipeline</div>
          <div className="hs-floater-sub">Auto‑logged · just now</div>
        </div>
      </div>

      <div className="hs-floater f2">
        <div className="hs-floater-icon" style={{ background: 'linear-gradient(135deg,#0AA89F,#0D8F87)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <div className="hs-floater-title">Customer texted</div>
          <div className="hs-floater-sub">Confirmation sent in 4 sec</div>
        </div>
      </div>
    </div>
  )
}

function formatTimer(step: number) {
  const elapsed = SCRIPT.slice(0, step + 1).reduce((a, b) => a + b.ms, 0)
  const seconds = Math.floor(elapsed / 1000) % 60
  const minutes = Math.floor(elapsed / 60000)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
