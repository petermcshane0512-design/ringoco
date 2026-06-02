'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'

/**
 * Free public missed-call calculator.
 *
 * SEO target: "missed call cost calculator HVAC" + variants. Drives
 * organic search traffic to a tool that estimates how much revenue the
 * contractor is losing to unanswered phones. The result anchors them
 * on a number, then the CTA leads straight to the trial signup.
 *
 * Inputs (3): missed calls per week, average job revenue, close rate.
 * Output: monthly + yearly opportunity cost.
 *
 * No auth, no email capture (yet) — friction kills tool conversions.
 * Add an "Email me this report" capture in v2.
 */

const TRADES = [
  { label: 'HVAC',         avgTicket: 620, defaultClose: 0.45, defaultMissed: 12 },
  { label: 'Plumbing',     avgTicket: 420, defaultClose: 0.55, defaultMissed: 10 },
  { label: 'Electrical',   avgTicket: 380, defaultClose: 0.40, defaultMissed: 8 },
  { label: 'Roofing',      avgTicket: 1100, defaultClose: 0.30, defaultMissed: 6 },
  { label: 'Cleaning',     avgTicket: 240, defaultClose: 0.50, defaultMissed: 8 },
  { label: 'Landscaping',  avgTicket: 480, defaultClose: 0.40, defaultMissed: 10 },
  { label: 'Other',        avgTicket: 500, defaultClose: 0.40, defaultMissed: 10 },
] as const

export default function Page() {
  const [tradeIdx, setTradeIdx] = useState(0)
  const trade = TRADES[tradeIdx]
  const [missedPerWeek, setMissedPerWeek] = useState<number>(trade.defaultMissed)
  const [avgTicket, setAvgTicket] = useState<number>(trade.avgTicket)
  const [closeRate, setCloseRate] = useState<number>(trade.defaultClose)

  function pickTrade(i: number) {
    setTradeIdx(i)
    const t = TRADES[i]
    setMissedPerWeek(t.defaultMissed)
    setAvgTicket(t.avgTicket)
    setCloseRate(t.defaultClose)
  }

  const result = useMemo(() => {
    const monthly = missedPerWeek * 4.33 * closeRate * avgTicket
    const yearly = monthly * 12
    const bellaveSaves = monthly - 147 // assuming Emma recovers ALL missed
    return { monthly, yearly, bellaveSaves }
  }, [missedPerWeek, closeRate, avgTicket])

  function usd(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  }

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#0B1F3A', background: '#F5FDFB', minHeight: '100vh' }}>
      <section style={{
        background: 'linear-gradient(160deg, #0B1F3A 0%, #163356 55%, #0D8F87 110%)',
        color: '#fff',
        padding: '52px 24px 36px',
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 10 }}>
            Free tool · 60-second answer
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 44px)', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 12px' }}>
            How much revenue are you losing to missed calls?
          </h1>
          <p style={{ fontSize: 'clamp(15px, 1.6vw, 17px)', lineHeight: 1.55, maxWidth: 640, color: 'rgba(255,255,255,0.86)', margin: 0 }}>
            Most home-service shops underestimate this by 5×. Plug in 3 numbers — we&apos;ll show you the real monthly + yearly cost.
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 24px', maxWidth: 880, margin: '0 auto' }}>
        <div style={{
          background: '#fff',
          border: '1px solid rgba(10,168,159,0.18)',
          borderRadius: 16,
          padding: '24px 24px 28px',
          boxShadow: '0 8px 28px rgba(7,27,58,0.08)',
        }}>
          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              1. What trade are you in?
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6 }}>
              {TRADES.map((t, i) => (
                <button
                  key={t.label}
                  onClick={() => pickTrade(i)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 10,
                    border: tradeIdx === i ? '2px solid #0AA89F' : '1.5px solid rgba(10,168,159,0.2)',
                    background: tradeIdx === i ? 'rgba(10,168,159,0.08)' : '#F5FDFB',
                    color: tradeIdx === i ? '#0AA89F' : '#0B1F3A',
                    fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Slider
            label="2. Missed calls per week"
            help="Calls that hit voicemail, busy signal, or just ring out."
            min={1} max={50} value={missedPerWeek} setValue={setMissedPerWeek}
            display={`${missedPerWeek} / week`}
          />

          <Slider
            label="3. Average job revenue"
            help={`We seeded ${usd(trade.avgTicket)} (industry avg for ${trade.label.toLowerCase()}). Adjust if your average is different.`}
            min={100} max={3000} step={20} value={avgTicket} setValue={setAvgTicket}
            display={usd(avgTicket)}
          />

          <Slider
            label="4. Of the leads you DO talk to, what % become a job?"
            help={`Industry default for ${trade.label.toLowerCase()}: ${Math.round(trade.defaultClose * 100)}%.`}
            min={0.1} max={0.9} step={0.05} value={closeRate} setValue={setCloseRate}
            display={`${Math.round(closeRate * 100)}%`}
          />
        </div>

        <div style={{
          marginTop: 22,
          background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
          color: '#fff',
          borderRadius: 18,
          padding: '28px 26px 26px',
          boxShadow: '0 12px 32px rgba(7,27,58,0.22)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 8 }}>
            Your missed-call cost
          </div>
          <div style={{ fontSize: 'clamp(40px, 7vw, 64px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>
            {usd(result.monthly)} <span style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>/month</span>
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', marginBottom: 20 }}>
            {usd(result.yearly)} per year. That&apos;s {usd(result.monthly / 30)} per day in lost revenue.
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1.5px solid rgba(255,255,255,0.22)',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 18,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#FFD9A8', marginBottom: 6 }}>
              With BellAveGo
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.4 }}>
              Emma answers every missed call · captures every lead · costs <strong style={{ color: '#5EEAD4' }}>$147/mo</strong>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 8 }}>
              Net win: <strong style={{ color: '#5EEAD4' }}>{usd(result.bellaveSaves)} / month</strong> back in your pocket.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/pricing?tier=receptionist&interval=monthly&autocheckout=1&utm_source=calculator&utm_medium=tool&utm_campaign=missed-call"
              style={{
                padding: '16px 28px',
                background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 12,
                fontSize: 16, fontWeight: 900,
                boxShadow: '0 8px 24px rgba(232,116,43,0.42)',
              }}
            >
              Start 7-day free trial →
            </Link>
            <a
              href="tel:+16514677829"
              style={{
                padding: '15px 22px',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 12,
                fontSize: 14, fontWeight: 800,
                border: '1.5px solid rgba(255,255,255,0.18)',
              }}
            >
              📞 Hear Emma live · (651) 467-7829
            </a>
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 12, color: '#7AAAB2', lineHeight: 1.6 }}>
          Numbers are estimates based on industry averages from the National Association of Home Builders and ServiceTitan benchmarks. Your actual revenue recovery depends on your specific market + close rate.
        </div>
      </section>
    </main>
  )
}

function Slider({ label, help, min, max, step = 1, value, setValue, display }: {
  label: string
  help: string
  min: number
  max: number
  step?: number
  value: number
  setValue: (n: number) => void
  display: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 800, color: '#0B1F3A' }}>{label}</label>
        <span style={{ fontSize: 18, fontWeight: 900, color: '#E8742B', letterSpacing: '-0.02em' }}>{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#0AA89F' }}
      />
      <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 4, lineHeight: 1.4 }}>{help}</div>
    </div>
  )
}
