'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

const TIER_COST = 179 // Office Manager / Growth — anchor against the popular tier
const WEEKS_PER_MONTH = 4.33

export default function RoiCalculator() {
  const [missed, setMissed] = useState(8)
  const [ticket, setTicket] = useState(480)
  const [close, setClose] = useState(35)

  const calc = useMemo(() => {
    const monthlyMissedCalls = missed * WEEKS_PER_MONTH
    const bookedJobs = monthlyMissedCalls * (close / 100)
    const recoveredMonthly = Math.round(bookedJobs * ticket)
    const recoveredYearly = recoveredMonthly * 12
    const netMonthly = recoveredMonthly - TIER_COST
    const roi = TIER_COST > 0 ? recoveredMonthly / TIER_COST : 0
    return { recoveredMonthly, recoveredYearly, netMonthly, roi, bookedJobs: Math.round(bookedJobs) }
  }, [missed, ticket, close])

  return (
    <section className="roi-root">
      <style>{`
        .roi-root {
          position: relative;
          padding: 64px 32px 72px;
          background:
            radial-gradient(800px 400px at 12% 12%, rgba(232,116,43,0.20), transparent 60%),
            radial-gradient(900px 500px at 88% 88%, rgba(10,168,159,0.20), transparent 65%),
            linear-gradient(180deg, #0B1F3A 0%, #112C4A 100%);
          color: #fff;
          overflow: hidden;
        }
        .roi-root::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 60% 60% at 50% 40%, black 50%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 60% 60% at 50% 40%, black 50%, transparent 100%);
          pointer-events: none;
        }
        .roi-wrap { position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; }
        .roi-head { text-align: center; margin-bottom: 36px; }
        .roi-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 13px;
          border-radius: 99px;
          background: rgba(232,116,43,0.14);
          border: 1px solid rgba(232,116,43,0.36);
          font-size: 10.5px; font-weight: 800;
          color: #FF9D5A;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }
        .roi-eyebrow::before {
          content: '$'; width: 14px; height: 14px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          color: #fff;
          font-size: 9px; font-weight: 900;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .roi-h2 {
          font-size: clamp(28px, 3.6vw, 44px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.04;
          margin: 0 0 12px;
        }
        .roi-h2 .accent {
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 22px rgba(232,116,43,0.35));
        }
        .roi-sub { font-size: 15px; color: rgba(255,255,255,0.72); margin: 0; max-width: 580px; margin-left: auto; margin-right: auto; line-height: 1.55; }

        .roi-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
          gap: 28px;
          align-items: stretch;
        }
        @media (max-width: 880px) { .roi-grid { grid-template-columns: 1fr; gap: 18px; } }

        /* Inputs panel */
        .roi-inputs {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(94,234,212,0.22);
          border-radius: 18px;
          padding: 26px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        .roi-input {
          margin-bottom: 22px;
        }
        .roi-input:last-child { margin-bottom: 0; }
        .roi-input-head {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 10px;
        }
        .roi-input-label {
          font-size: 12px; font-weight: 700;
          color: rgba(255,255,255,0.86);
          letter-spacing: -0.1px;
        }
        .roi-input-value {
          font-size: 22px; font-weight: 900;
          color: #5EEAD4;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.4px;
        }
        .roi-input-value .unit {
          font-size: 11px; font-weight: 700;
          color: rgba(255,255,255,0.55);
          margin-left: 4px;
          letter-spacing: 0;
        }
        .roi-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 6px;
          border-radius: 99px;
          background: linear-gradient(90deg, rgba(94,234,212,0.45), rgba(232,116,43,0.55));
          outline: none;
          cursor: pointer;
        }
        .roi-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px; height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          border: 2px solid #fff;
          cursor: grab;
          box-shadow: 0 6px 14px rgba(232,116,43,0.5);
          transition: transform 0.12s ease;
        }
        .roi-slider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.12); }
        .roi-slider::-moz-range-thumb {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          border: 2px solid #fff;
          cursor: grab;
          box-shadow: 0 6px 14px rgba(232,116,43,0.5);
        }
        .roi-input-foot {
          display: flex; justify-content: space-between;
          font-size: 10px; font-weight: 600;
          color: rgba(255,255,255,0.45);
          margin-top: 5px;
          font-variant-numeric: tabular-nums;
        }

        /* Result panel */
        .roi-result {
          background:
            radial-gradient(500px 300px at 100% 0%, rgba(232,116,43,0.32), transparent 65%),
            linear-gradient(160deg, #050E1F 0%, #112C4A 100%);
          border: 1px solid rgba(232,116,43,0.36);
          border-radius: 18px;
          padding: 28px;
          box-shadow: 0 30px 70px rgba(0,0,0,0.45);
          display: flex; flex-direction: column;
          position: relative;
          overflow: hidden;
        }
        .roi-result::after {
          content: '';
          position: absolute; left: -8%; right: -8%; bottom: -2px; height: 60px;
          background:
            radial-gradient(ellipse 22% 100% at 18% 60%, rgba(255,255,255,0.32), transparent 70%),
            radial-gradient(ellipse 28% 100% at 52% 50%, rgba(255,255,255,0.22), transparent 70%),
            radial-gradient(ellipse 24% 100% at 86% 60%, rgba(255,255,255,0.34), transparent 70%);
          filter: blur(2px);
          opacity: 0.4;
          mix-blend-mode: screen;
          pointer-events: none;
        }
        .roi-result-tag {
          font-size: 10.5px; font-weight: 800;
          color: #FF9D5A;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .roi-result-headline {
          font-size: clamp(38px, 5.6vw, 64px);
          font-weight: 900;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 75%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          letter-spacing: -2px; line-height: 1;
          font-variant-numeric: tabular-nums;
          filter: drop-shadow(0 4px 22px rgba(232,116,43,0.4));
          transition: all 0.32s cubic-bezier(0.34, 1, 0.64, 1);
        }
        .roi-result-sub {
          font-size: 14px; font-weight: 700;
          color: rgba(255,255,255,0.78);
          margin-top: 8px;
          letter-spacing: -0.1px;
        }
        .roi-result-sub .num { color: #5EEAD4; font-weight: 800; }

        .roi-meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 22px;
          padding-top: 22px;
          border-top: 1px dashed rgba(94,234,212,0.20);
        }
        .roi-meta-tile {
          padding: 11px 13px;
          border-radius: 11px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(94,234,212,0.18);
        }
        .roi-meta-tile .lab {
          font-size: 9.5px; font-weight: 800;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .roi-meta-tile .val {
          font-size: 18px; font-weight: 900;
          color: #fff;
          letter-spacing: -0.5px;
          font-variant-numeric: tabular-nums;
        }
        .roi-meta-tile .val .accent {
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }

        .roi-cta-row {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          margin-top: 22px;
          flex-wrap: wrap;
        }
        .roi-cta {
          display: inline-flex; align-items: center; gap: 9px;
          padding: 14px 26px;
          border-radius: 12px;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%);
          color: #0B1F3A;
          font-weight: 900; font-size: 14px;
          text-decoration: none;
          border: 1px solid rgba(255,217,168,0.55);
          box-shadow: 0 12px 32px rgba(232,116,43,0.45), inset 0 1px 0 rgba(255,255,255,0.55);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease;
        }
        .roi-cta:hover {
          transform: translateY(-2px) scale(1.03);
          filter: brightness(1.05);
        }
        .roi-risk-note {
          font-size: 11.5px; color: rgba(255,255,255,0.55); font-weight: 600;
        }
      `}</style>

      <div className="roi-wrap">
        <div className="roi-head">
          <div className="roi-eyebrow">Free · No signup · Move the sliders</div>
          <h2 className="roi-h2">How much could BellAveGo<br /><span className="accent">recover for you?</span></h2>
          <p className="roi-sub">
            Punch in three numbers about your business. We&apos;ll show you the dollar amount BellAveGo can put back on your books every month — and how fast it pays for itself.
          </p>
        </div>

        <div className="roi-grid">
          {/* Inputs */}
          <div className="roi-inputs">
            <div className="roi-input">
              <div className="roi-input-head">
                <span className="roi-input-label">Calls you miss per week</span>
                <span className="roi-input-value">{missed}<span className="unit">calls</span></span>
              </div>
              <input
                type="range" min={1} max={30} step={1}
                value={missed}
                onChange={e => setMissed(parseInt(e.target.value, 10))}
                className="roi-slider"
                aria-label="Calls missed per week"
              />
              <div className="roi-input-foot"><span>1</span><span>30</span></div>
            </div>

            <div className="roi-input">
              <div className="roi-input-head">
                <span className="roi-input-label">Average job ticket</span>
                <span className="roi-input-value">${ticket}<span className="unit">/ job</span></span>
              </div>
              <input
                type="range" min={150} max={2500} step={10}
                value={ticket}
                onChange={e => setTicket(parseInt(e.target.value, 10))}
                className="roi-slider"
                aria-label="Average job ticket"
              />
              <div className="roi-input-foot"><span>$150</span><span>$2,500</span></div>
            </div>

            <div className="roi-input">
              <div className="roi-input-head">
                <span className="roi-input-label">Your close rate on answered calls</span>
                <span className="roi-input-value">{close}<span className="unit">%</span></span>
              </div>
              <input
                type="range" min={10} max={80} step={1}
                value={close}
                onChange={e => setClose(parseInt(e.target.value, 10))}
                className="roi-slider"
                aria-label="Close rate"
              />
              <div className="roi-input-foot"><span>10%</span><span>80%</span></div>
            </div>
          </div>

          {/* Result */}
          <div className="roi-result">
            <div className="roi-result-tag">Recovered revenue / month</div>
            <div className="roi-result-headline">
              +${calc.recoveredMonthly.toLocaleString()}
            </div>
            <div className="roi-result-sub">
              That&apos;s about <span className="num">{calc.bookedJobs}</span> extra jobs/month — calls that today go to voicemail.
            </div>

            <div className="roi-meta">
              <div className="roi-meta-tile">
                <div className="lab">Per year</div>
                <div className="val"><span className="accent">${calc.recoveredYearly.toLocaleString()}</span></div>
              </div>
              <div className="roi-meta-tile">
                <div className="lab">ROI on BellAveGo</div>
                <div className="val">{Math.round(calc.roi)}×</div>
              </div>
              <div className="roi-meta-tile">
                <div className="lab">Net after $397/mo</div>
                <div className="val">+${calc.netMonthly.toLocaleString()}</div>
              </div>
            </div>

            <div className="roi-cta-row">
              <Link href="/pricing" className="roi-cta">
                Activate plan — start recovering
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
              <span className="roi-risk-note">30-day money-back · No contract</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
