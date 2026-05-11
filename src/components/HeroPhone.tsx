'use client'
import { useEffect, useState } from 'react'

type Phase =
  | 'ringing'
  | 'connecting'
  | 'transcript_1' | 'transcript_2' | 'transcript_3' | 'transcript_4'
  | 'booked'
  | 'sms_greet' | 'sms_confirm' | 'sms_yes' | 'sms_invoice'
  | 'pause'

const SCRIPT: { phase: Phase; ms: number }[] = [
  { phase: 'ringing', ms: 1500 },
  { phase: 'connecting', ms: 1100 },
  { phase: 'transcript_1', ms: 2200 },
  { phase: 'transcript_2', ms: 2100 },
  { phase: 'transcript_3', ms: 2300 },
  { phase: 'transcript_4', ms: 1700 },
  { phase: 'booked', ms: 2200 },
  { phase: 'sms_greet', ms: 2400 },
  { phase: 'sms_confirm', ms: 2200 },
  { phase: 'sms_yes', ms: 1900 },
  { phase: 'sms_invoice', ms: 4500 },
  { phase: 'pause', ms: 1800 },
]

const TRANSCRIPT = [
  { speaker: 'ai' as const, text: 'BellAveGo for Mike’s HVAC — how can I help?' },
  { speaker: 'caller' as const, text: 'Hey, my AC stopped cooling.' },
  { speaker: 'ai' as const, text: 'Got it. Earliest slot is tomorrow 10 AM — work?' },
  { speaker: 'caller' as const, text: 'Yes, please.' },
]

export default function HeroPhone() {
  const [idx, setIdx] = useState(0)
  const phase = SCRIPT[idx].phase

  useEffect(() => {
    const t = setTimeout(() => setIdx(i => (i + 1) % SCRIPT.length), SCRIPT[idx].ms)
    return () => clearTimeout(t)
  }, [idx])

  // Compute display state
  const inCall = phase === 'ringing' || phase === 'connecting'
    || phase.startsWith('transcript_') || phase === 'booked'
  const inSms = phase.startsWith('sms_') || phase === 'pause'
  const transcriptCount =
    phase === 'transcript_1' ? 1
    : phase === 'transcript_2' ? 2
    : phase === 'transcript_3' ? 3
    : phase === 'transcript_4' ? 4
    : phase === 'booked' ? 4
    : 0
  const smsStep =
    phase === 'sms_greet' ? 1
    : phase === 'sms_confirm' ? 2
    : phase === 'sms_yes' ? 3
    : phase === 'sms_invoice' || phase === 'pause' ? 4
    : 0

  const timerSec = idx <= 1 ? 0 : Math.min(38, (idx - 1) * 7)

  return (
    <div className="hp-frame">
      <style>{`
        .hp-frame {
          position: relative;
          width: 220px;
          aspect-ratio: 200/410;
          background: linear-gradient(180deg, #0a0a0a, #1a1a1a);
          border-radius: 38px;
          padding: 7px;
          box-shadow:
            0 40px 90px rgba(0,0,0,0.45),
            0 0 0 1.5px rgba(94,234,212,0.20),
            0 0 70px rgba(94,234,212,0.16),
            inset 0 0 0 1px rgba(255,255,255,0.06);
        }
        .hp-screen {
          width: 100%; height: 100%;
          border-radius: 32px;
          background: #fff;
          overflow: hidden;
          position: relative;
          display: flex; flex-direction: column;
        }
        .hp-notch {
          position: absolute;
          top: 8px; left: 50%;
          transform: translateX(-50%);
          width: 38%; height: 16px;
          background: #0a0a0a;
          border-radius: 0 0 12px 12px;
          z-index: 10;
        }

        /* Call view (dark) */
        .hp-call {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, #0B1F3A 0%, #0A1828 50%, #061224 100%);
          padding: 36px 14px 14px;
          display: flex; flex-direction: column;
          opacity: ${inCall ? 1 : 0};
          pointer-events: ${inCall ? 'auto' : 'none'};
          transition: opacity 0.5s ease;
        }
        .hp-status {
          display: flex; justify-content: space-between;
          font-size: 9px; font-weight: 700;
          color: rgba(255,255,255,0.85);
          padding: 0 4px; margin-top: 4px;
        }
        .hp-brand {
          margin-top: 12px;
          text-align: center;
          font-size: 10px; font-weight: 800;
          letter-spacing: 0.18em;
          color: #5EEAD4;
          text-transform: uppercase;
        }
        .hp-state {
          text-align: center;
          font-size: 16px; font-weight: 800;
          color: #fff;
          margin-top: 4px;
          letter-spacing: -0.3px;
        }
        .hp-timer {
          text-align: center;
          font-variant-numeric: tabular-nums;
          font-size: 11px; color: #5EEAD4;
          margin-top: 2px; font-weight: 600;
        }
        .hp-wave {
          margin: 10px auto 6px;
          display: flex; justify-content: center; align-items: center;
          gap: 3px; height: 26px;
        }
        .hp-wave span {
          display: block; width: 3px;
          background: linear-gradient(180deg, #5EEAD4, #0AA89F);
          border-radius: 3px;
          box-shadow: 0 0 6px rgba(94,234,212,0.5);
          animation: hpWaveBars 1s ease-in-out infinite;
        }
        .hp-wave span:nth-child(1) { animation-delay: 0.0s; }
        .hp-wave span:nth-child(2) { animation-delay: 0.10s; }
        .hp-wave span:nth-child(3) { animation-delay: 0.20s; }
        .hp-wave span:nth-child(4) { animation-delay: 0.30s; }
        .hp-wave span:nth-child(5) { animation-delay: 0.40s; }
        .hp-wave span:nth-child(6) { animation-delay: 0.30s; }
        .hp-wave span:nth-child(7) { animation-delay: 0.20s; }
        .hp-wave span:nth-child(8) { animation-delay: 0.10s; }
        .hp-wave span:nth-child(9) { animation-delay: 0.0s; }
        @keyframes hpWaveBars {
          0%, 100% { height: 6px; }
          50%      { height: 22px; }
        }
        .hp-bubbles {
          flex: 1; min-height: 0;
          display: flex; flex-direction: column; gap: 5px;
          margin-top: 6px;
          overflow: hidden;
        }
        .hp-bubble {
          font-size: 9.5px;
          padding: 6px 9px;
          border-radius: 11px;
          line-height: 1.35;
          max-width: 88%;
          animation: hpBubbleIn 0.32s ease-out;
        }
        .hp-bubble.ai {
          align-self: flex-start;
          background: rgba(94,234,212,0.16);
          border: 1px solid rgba(94,234,212,0.30);
          color: #ECFEFF;
          border-bottom-left-radius: 3px;
        }
        .hp-bubble.caller {
          align-self: flex-end;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          color: #fff;
          border-bottom-right-radius: 3px;
        }
        @keyframes hpBubbleIn {
          0%   { opacity: 0; transform: translateY(6px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .hp-booked {
          margin-top: auto;
          padding: 8px 12px;
          background: linear-gradient(135deg, #22C55E, #15803D);
          border-radius: 10px;
          color: #fff;
          font-size: 10.5px;
          font-weight: 800;
          text-align: center;
          box-shadow: 0 8px 22px rgba(34,197,94,0.45);
          animation: hpBookedIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        @keyframes hpBookedIn {
          0%   { opacity: 0; transform: scale(0.7); }
          100% { opacity: 1; transform: scale(1); }
        }
        .hp-ring-wrap {
          margin: auto;
          text-align: center;
        }
        .hp-ring {
          width: 50px; height: 50px; border-radius: 50%;
          background: linear-gradient(135deg, #0AA89F, #0D8F87);
          display: inline-flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow: 0 0 0 0 rgba(94,234,212,0.55);
          animation: hpRingPulse 1.4s ease-out infinite;
        }
        @keyframes hpRingPulse {
          0%   { box-shadow: 0 0 0 0 rgba(94,234,212,0.55); }
          70%  { box-shadow: 0 0 0 22px rgba(94,234,212,0); }
          100% { box-shadow: 0 0 0 0 rgba(94,234,212,0); }
        }

        /* SMS view (light iOS Messages) */
        .hp-sms {
          position: absolute; inset: 0;
          background: #F2F2F7;
          display: flex; flex-direction: column;
          opacity: ${inSms ? 1 : 0};
          pointer-events: ${inSms ? 'auto' : 'none'};
          transition: opacity 0.5s ease;
        }
        .hp-sms-status {
          padding: 7px 14px 4px;
          display: flex; justify-content: space-between; align-items: center;
          font-size: 9px; font-weight: 700; color: #0a0a0a;
          margin-top: 18px;
        }
        .hp-sms-header {
          background: #F2F2F7;
          padding: 6px 12px 9px;
          display: flex; flex-direction: column; align-items: center;
          border-bottom: 0.5px solid rgba(0,0,0,0.10);
        }
        .hp-sms-avatar {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0AA89F, #0D8F87);
          color: #fff;
          font-size: 11px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 3px;
          box-shadow: 0 2px 6px rgba(10,168,159,0.32);
        }
        .hp-sms-name {
          font-size: 11px; font-weight: 600; color: #0a0a0a;
          display: flex; align-items: center; gap: 3px;
        }
        .hp-sms-name svg { color: #8E8E93; }
        .hp-sms-body {
          flex: 1; min-height: 0;
          padding: 10px 9px 12px;
          display: flex; flex-direction: column; gap: 5px;
          overflow: hidden;
        }
        .hp-sms-day {
          text-align: center;
          font-size: 8px; font-weight: 700;
          color: #8E8E93;
          letter-spacing: 0.04em;
          margin: 2px 0 6px;
        }
        .hp-sms-bubble {
          font-size: 10.5px;
          line-height: 1.3;
          padding: 7px 10px;
          border-radius: 16px;
          max-width: 80%;
          animation: hpBubbleIn 0.35s ease-out;
          word-break: break-word;
        }
        .hp-sms-bubble.in {
          align-self: flex-start;
          background: #E9E9EB;
          color: #0a0a0a;
          border-bottom-left-radius: 4px;
        }
        .hp-sms-bubble.out {
          align-self: flex-end;
          background: linear-gradient(180deg, #34A4FF, #007AFF);
          color: #fff;
          border-bottom-right-radius: 4px;
          box-shadow: 0 1px 2px rgba(0,122,255,0.18);
        }

        /* Invoice card bubble */
        .hp-invoice {
          align-self: flex-start;
          background: #fff;
          border-radius: 14px;
          border: 1px solid rgba(0,0,0,0.08);
          width: 92%;
          padding: 9px 10px 9px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
          display: flex; flex-direction: column; gap: 6px;
          animation: hpBubbleIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
        }
        .hp-invoice-head {
          display: flex; align-items: center; gap: 6px;
          font-size: 9px; font-weight: 800;
          color: #0AA89F;
          letter-spacing: 0.08em; text-transform: uppercase;
        }
        .hp-invoice-head::before {
          content: ''; width: 6px; height: 6px; border-radius: 2px;
          background: linear-gradient(135deg, #0AA89F, #0D8F87);
        }
        .hp-invoice-row {
          display: flex; justify-content: space-between; align-items: baseline;
          font-size: 10px;
          color: #4A6670;
        }
        .hp-invoice-row .lab { font-weight: 600; }
        .hp-invoice-row .val { font-weight: 700; color: #0a0a0a; font-variant-numeric: tabular-nums; }
        .hp-invoice-total {
          display: flex; justify-content: space-between; align-items: baseline;
          padding-top: 5px;
          border-top: 1px dashed rgba(0,0,0,0.10);
          font-size: 10px;
          color: #0a0a0a;
        }
        .hp-invoice-total .grand {
          font-size: 16px; font-weight: 900;
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          letter-spacing: -0.4px;
          line-height: 1;
        }
        .hp-invoice-buttons {
          display: flex; gap: 5px; margin-top: 4px;
        }
        .hp-invoice-btn {
          flex: 1;
          padding: 7px 8px;
          border-radius: 8px;
          font-size: 9.5px; font-weight: 800;
          text-align: center;
          letter-spacing: -0.1px;
        }
        .hp-invoice-btn.primary {
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          color: #fff;
          box-shadow: 0 4px 10px rgba(232,116,43,0.38);
        }
        .hp-invoice-btn.ghost {
          background: #F2F2F7;
          color: #0a0a0a;
          border: 1px solid rgba(0,0,0,0.08);
        }
      `}</style>

      <div className="hp-screen">
        <div className="hp-notch" />

        {/* CALL VIEW */}
        <div className="hp-call">
          <div className="hp-status">
            <span>9:41</span>
            <span>•••</span>
          </div>
          <div className="hp-brand">BellAveGo</div>
          <div className="hp-state">
            {phase === 'ringing' ? 'Incoming call'
              : phase === 'connecting' ? 'Connecting…'
              : phase === 'booked' ? 'Job booked!'
              : 'Active call'}
          </div>
          {phase !== 'ringing' && (
            <div className="hp-timer">0:{String(timerSec).padStart(2, '0')}</div>
          )}

          {phase === 'ringing' ? (
            <div className="hp-ring-wrap">
              <div className="hp-ring">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
            </div>
          ) : (
            <>
              <div className="hp-wave">
                {Array.from({ length: 9 }).map((_, i) => <span key={i} />)}
              </div>
              <div className="hp-bubbles">
                {TRANSCRIPT.slice(0, transcriptCount).map((t, i) => (
                  <div key={i} className={`hp-bubble ${t.speaker}`}>{t.text}</div>
                ))}
              </div>
              {phase === 'booked' && (
                <div className="hp-booked">✓ AC tune-up booked · Tomorrow 10 AM</div>
              )}
            </>
          )}
        </div>

        {/* SMS VIEW */}
        <div className="hp-sms">
          <div className="hp-sms-status">
            <span>9:42</span>
            <span>•••</span>
          </div>
          <div className="hp-sms-header">
            <div className="hp-sms-avatar">B</div>
            <div className="hp-sms-name">
              BellAveGo
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </div>
          <div className="hp-sms-body">
            <div className="hp-sms-day">Today 10:42 AM</div>

            {smsStep >= 1 && (
              <div className="hp-sms-bubble in">
                Hi Marcus — BellAveGo for Mike’s HVAC. Confirming your AC tune-up <b>tomorrow at 10:00 AM</b>.
              </div>
            )}
            {smsStep >= 2 && (
              <div className="hp-sms-bubble in">
                Reply <b>YES</b> to confirm or <b>NEW</b> to pick a different time.
              </div>
            )}
            {smsStep >= 3 && (
              <div className="hp-sms-bubble out">YES</div>
            )}
            {smsStep >= 4 && (
              <div className="hp-invoice">
                <div className="hp-invoice-head">Pre-pay your visit?</div>
                <div className="hp-invoice-row">
                  <span className="lab">AC pre-season tune-up</span>
                  <span className="val">$179</span>
                </div>
                <div className="hp-invoice-row">
                  <span className="lab">Service-call credit</span>
                  <span className="val">−$10</span>
                </div>
                <div className="hp-invoice-total">
                  <span>Total due</span>
                  <span className="grand">$169</span>
                </div>
                <div className="hp-invoice-buttons">
                  <div className="hp-invoice-btn primary">Pay $169</div>
                  <div className="hp-invoice-btn ghost">Pay at visit</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
