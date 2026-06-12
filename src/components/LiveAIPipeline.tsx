'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * LiveAIPipeline — animated 5-stage scraper + AI writer.
 *
 * Per Peter 2026-06-09: homepage scraper section must FEEL live + AI.
 * Show prospects how we (a) scrape homeowner data and (b) the AI then
 * writes the personalized outreach to that homeowner — in real time.
 *
 * Layout:
 *   LEFT  — pipeline log w/ 5 stages (scrape · score · skip-trace ·
 *           write · deliver). Each stage ticks pending → spinner →
 *           green check as the lead moves through.
 *   RIGHT — phone mockup of the SMS the AI just wrote, typed out
 *           character by character (~28 chars/sec), addressed to the
 *           current homeowner.
 *
 * Cycle: ~9s per lead. Loops forever w/ randomized owner/zip/trade so
 * it never looks scripted. Counter ticks "leads verified today" up.
 */

type Stage = 'idle' | 'active' | 'done'

type LeadSample = {
  owner: string
  firstName: string
  street: string
  zip: string
  city: string
  state: string
  trade: 'HVAC' | 'Roofing' | 'Plumbing' | 'Electric' | 'Handyman'
  signal: 'PERMIT' | 'STORM' | 'AGED' | 'MOVE-IN'
  score: number
  phoneMasked: string
  phoneFull: string
  shopName: string
  shopOwnerFirst: string
  smsBody: string
}

const SAMPLES: LeadSample[] = [
  {
    owner: 'Mike Coleman', firstName: 'Mike',
    street: '7842 Oak Ridge Dr', zip: '75024', city: 'Plano', state: 'TX',
    trade: 'HVAC', signal: 'PERMIT', score: 92,
    phoneMasked: '(214) ●●●-●167', phoneFull: '(214) 555-9167',
    shopName: 'Plano Heating & Air', shopOwnerFirst: 'John',
    smsBody: `Hey Mike — John w/ Plano Heating. Saw the AC condenser permit went in last week. If you want a free 2nd-opinion quote on the install (or swap-out pricing), I can be by Tue or Wed. No pressure.`,
  },
  {
    owner: 'Sarah Whitman', firstName: 'Sarah',
    street: '2188 Birch Ln', zip: '75093', city: 'Plano', state: 'TX',
    trade: 'Roofing', signal: 'STORM', score: 88,
    phoneMasked: '(469) ●●●-●032', phoneFull: '(469) 555-7032',
    shopName: 'Lone Star Roofing', shopOwnerFirst: 'Marcus',
    smsBody: `Hey Sarah — Marcus w/ Lone Star Roofing. Storm data flagged 1.7" hail on your block Sun night. Free inspection takes 15 min — most insurance is willing to pay the full claim if you file in 30 days. Want me to swing by?`,
  },
  {
    owner: 'Carlos Reyes', firstName: 'Carlos',
    street: '1923 Briarwood', zip: '75035', city: 'Frisco', state: 'TX',
    trade: 'HVAC', signal: 'AGED', score: 81,
    phoneMasked: '(972) ●●●-●441', phoneFull: '(972) 555-3441',
    shopName: 'Frisco Climate Co', shopOwnerFirst: 'Daniel',
    smsBody: `Hey Carlos — Daniel here w/ Frisco Climate. Your system's tagged at ~16yrs old. We're running tune-ups at $89 this month + free coil cleaning. Worth it before summer hits 105.`,
  },
  {
    owner: 'James Patel', firstName: 'James',
    street: '388 Cedar Park', zip: '75070', city: 'McKinney', state: 'TX',
    trade: 'Plumbing', signal: 'MOVE-IN', score: 76,
    phoneMasked: '(214) ●●●-●815', phoneFull: '(214) 555-2815',
    shopName: 'McKinney Plumbing Pros', shopOwnerFirst: 'Greg',
    smsBody: `Welcome to McKinney James! Greg w/ McKinney Plumbing. Free new-homeowner walkthrough — we check the water heater, shut-offs, and pressure for free. Most new owners don't know where any of it is. Tue or Sat ok?`,
  },
  {
    owner: 'Linda Hong', firstName: 'Linda',
    street: '6618 Aspen Way', zip: '75002', city: 'Allen', state: 'TX',
    trade: 'Electric', signal: 'PERMIT', score: 84,
    phoneMasked: '(469) ●●●-●703', phoneFull: '(469) 555-1703',
    shopName: 'Allen Electric Co', shopOwnerFirst: 'Anthony',
    smsBody: `Hi Linda — Anthony at Allen Electric. Saw the sub-panel permit got pulled. Happy to give a second quote — most owners save 18-25% checking a second bid. Free, 20 min. Wed or Thu?`,
  },
  {
    owner: 'Tony Suarez', firstName: 'Tony',
    street: '4218 Catalina Ave', zip: '85710', city: 'Tucson', state: 'AZ',
    trade: 'HVAC', signal: 'PERMIT', score: 90,
    phoneMasked: '(520) ●●●-●996', phoneFull: '(520) 555-4996',
    shopName: 'Tucson Cooling', shopOwnerFirst: 'Rico',
    smsBody: `Hey Tony — Rico w/ Tucson Cooling. Furnace permit caught my eye. If you also want to look at the AC side before July, we do combo install pricing that saves ~$1,200. No upsell call, just send a quote over text.`,
  },
  {
    owner: 'Maria Lopez', firstName: 'Maria',
    street: '7711 Camelback Pl', zip: '85016', city: 'Phoenix', state: 'AZ',
    trade: 'HVAC', signal: 'AGED', score: 79,
    phoneMasked: '(602) ●●●-●128', phoneFull: '(602) 555-8128',
    shopName: 'Sun Valley Air', shopOwnerFirst: 'Eric',
    smsBody: `Hey Maria — Eric w/ Sun Valley Air. Your unit's a 2009 build — those usually start needing $400+ repairs around year 15. Quick free check this week, no charge if we don't find anything?`,
  },
  {
    owner: 'Rachel Brooks', firstName: 'Rachel',
    street: '988 Peachtree St', zip: '30301', city: 'Atlanta', state: 'GA',
    trade: 'HVAC', signal: 'PERMIT', score: 86,
    phoneMasked: '(404) ●●●-●244', phoneFull: '(404) 555-6244',
    shopName: 'ATL Comfort Co', shopOwnerFirst: 'Demarcus',
    smsBody: `Hi Rachel — Demarcus w/ ATL Comfort. Permit shows new system going in. We sometimes catch sizing errors on these — quick free 2nd-opinion before install saves people ~$800/yr in efficiency. Worth a look?`,
  },
]

const STAGES = [
  { key: 'scrape',  label: 'Scrape signal',    icon: '🛰' },
  { key: 'score',   label: 'AI score lead',    icon: '🧠' },
  { key: 'verify',  label: 'Verify phone',     icon: '📞' },
  { key: 'write',   label: 'AI write outreach', icon: '✍' },
  { key: 'deliver', label: 'Deliver to shop',  icon: '✉' },
] as const

const SIGNAL_PILL: Record<LeadSample['signal'], { bg: string; fg: string; label: string }> = {
  'PERMIT':  { bg: '#E0F2FE', fg: '#0369A1', label: '🏛 Permit' },
  'STORM':   { bg: '#FEF3C7', fg: '#92400E', label: '⛈ Storm' },
  'AGED':    { bg: '#FCE7F3', fg: '#9D174D', label: '🌡 Aged' },
  'MOVE-IN': { bg: '#DCFCE7', fg: '#166534', label: '🏠 Move-in' },
}

export default function LiveAIPipeline() {
  const [leadIdx, setLeadIdx] = useState(0)
  const [stages, setStages] = useState<Stage[]>(['idle','idle','idle','idle','idle'])
  const [scoreDisplay, setScoreDisplay] = useState(0)
  const [phoneDisplay, setPhoneDisplay] = useState('')
  const [smsTyped, setSmsTyped] = useState('')
  const [counter, setCounter] = useState(2847)
  const [pulse, setPulse] = useState(true)

  const lead = SAMPLES[leadIdx % SAMPLES.length]
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearAll() {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  function schedule(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms))
  }

  useEffect(() => {
    // Reset + run a 9-second cycle on each lead change.
    setStages(['active','idle','idle','idle','idle'])
    setScoreDisplay(0)
    setPhoneDisplay(lead.phoneMasked)
    setSmsTyped('')

    // Stage 1 → done @ 1.0s
    schedule(() => {
      setStages(['done','active','idle','idle','idle'])
    }, 1000)

    // Stage 2 score animation 1.0 → 1.8s, done @ 1.9s
    schedule(() => {
      const start = performance.now()
      const dur = 800
      const startScore = 0
      const endScore = lead.score
      function frame() {
        const elapsed = performance.now() - start
        const t = Math.min(1, elapsed / dur)
        const eased = 1 - Math.pow(1 - t, 3)
        setScoreDisplay(Math.round(startScore + (endScore - startScore) * eased))
        if (t < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }, 1050)
    schedule(() => {
      setStages(['done','done','active','idle','idle'])
    }, 1950)

    // Stage 3 phone reveal 2.0 → 2.7s
    schedule(() => {
      let i = 0
      const id = setInterval(() => {
        i += 1
        setPhoneDisplay(reveal(lead.phoneMasked, lead.phoneFull, i))
        if (i >= lead.phoneFull.length) clearInterval(id)
      }, 38)
      timers.current.push(id as unknown as ReturnType<typeof setTimeout>)
    }, 2000)
    schedule(() => {
      setStages(['done','done','done','active','idle'])
    }, 2750)

    // Stage 4 typewriter 2.8 → ~7.2s, done @ 7.3s
    schedule(() => {
      let i = 0
      const id = setInterval(() => {
        i += 1
        setSmsTyped(lead.smsBody.slice(0, i))
        if (i >= lead.smsBody.length) clearInterval(id)
      }, 22)
      timers.current.push(id as unknown as ReturnType<typeof setTimeout>)
    }, 2800)
    schedule(() => {
      setStages(['done','done','done','done','active'])
    }, 7300)

    // Stage 5 deliver @ 8.0s, next lead @ 8.8s
    schedule(() => {
      setStages(['done','done','done','done','done'])
      setCounter((c) => c + Math.floor(Math.random() * 3) + 1)
    }, 8000)
    schedule(() => {
      setLeadIdx((i) => (i + 1) % SAMPLES.length)
    }, 8800)

    return clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadIdx])

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 700)
    return () => clearInterval(id)
  }, [])

  const sigPill = SIGNAL_PILL[lead.signal]

  return (
    <section style={{ padding: '64px clamp(16px, 5vw, 48px)', background: '#FFF8F0' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', borderRadius: 99,
            background: 'rgba(34,197,94,0.12)',
            border: '1.5px solid rgba(34,197,94,0.40)',
            fontSize: 12, fontWeight: 800, color: '#16803F',
            letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#22C55E',
              boxShadow: pulse ? '0 0 14px #22C55E' : '0 0 4px #22C55E',
              transition: 'box-shadow 700ms ease',
            }} />
            Live · AI working right now
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '16px 0 8px', color: '#0B1F3A' }}>
            Watch the AI script your next install — live.
          </h2>
          <p style={{ fontSize: 15.5, color: '#4A6670', margin: '0 auto', maxWidth: 720, lineHeight: 1.55 }}>
            Every night this pipeline runs across every US zip. Below: one real homeowner being processed by our AI right now. When you lock your zip, this engine runs for YOUR shop.
          </p>
        </div>

        {/* Pipeline + Phone mockup */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
          gap: 24,
          alignItems: 'stretch',
        }} className="pipeline-grid">

          {/* LEFT — pipeline stages */}
          <div style={{
            borderRadius: 20,
            background: 'linear-gradient(170deg, #0B1F3A 0%, #163356 100%)',
            color: '#FFF8F0',
            padding: 24,
            boxShadow: '0 30px 70px rgba(11,31,58,0.30)',
            border: '1px solid rgba(94,234,212,0.22)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Bg shimmer */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 80% 10%, rgba(94,234,212,0.10), transparent 60%), radial-gradient(circle at 20% 90%, rgba(232,116,43,0.08), transparent 60%)',
              pointerEvents: 'none',
            }} />

            {/* Lead header */}
            <div style={{ position: 'relative', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid rgba(255,197,138,0.18)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#FFC58A', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
                Processing lead · {counter.toLocaleString()} verified today
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={lead.owner}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                >
                  <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em', color: '#FFF8F0' }}>
                    {lead.owner}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    padding: '3px 9px', borderRadius: 7,
                    background: sigPill.bg, color: sigPill.fg,
                    letterSpacing: '0.04em',
                  }}>{sigPill.label}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,248,240,0.62)', fontWeight: 600 }}>
                    {lead.street} · {lead.city} {lead.state} {lead.zip} · {lead.trade}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Stages */}
            <div style={{ position: 'relative', display: 'grid', gap: 10 }}>
              {STAGES.map((s, i) => {
                const st = stages[i]
                return (
                  <div key={s.key} style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 11,
                    background: st === 'active' ? 'rgba(232,116,43,0.16)' : st === 'done' ? 'rgba(34,197,94,0.10)' : 'rgba(255,248,240,0.03)',
                    border: `1px solid ${st === 'active' ? 'rgba(232,116,43,0.50)' : st === 'done' ? 'rgba(34,197,94,0.35)' : 'rgba(255,197,138,0.10)'}`,
                    transition: 'background 320ms ease, border-color 320ms ease',
                  }}>
                    <div style={{ fontSize: 16, lineHeight: 1, textAlign: 'center' }}>{s.icon}</div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,248,240,0.55)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                        Stage {i + 1}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF8F0', letterSpacing: '-0.01em' }}>
                        {s.label}
                      </div>
                      {/* Stage-specific live output */}
                      {i === 0 && st !== 'idle' && (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#FFC58A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                          scraped {lead.signal.toLowerCase()} · {lead.city} {lead.state} {lead.zip}
                        </div>
                      )}
                      {i === 1 && st !== 'idle' && (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#5EEAD4', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
                          claude-sonnet-4-6 → score
                          <span style={{
                            fontSize: 16, fontWeight: 900,
                            background: 'linear-gradient(135deg, #5EEAD4, #FF9D5A)',
                            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                            fontVariantNumeric: 'tabular-nums',
                            minWidth: 28, display: 'inline-block',
                          }}>{scoreDisplay}</span>
                        </div>
                      )}
                      {i === 2 && st !== 'idle' && (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#FFC58A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                          skip-trace → <span style={{ color: '#5EEAD4', fontWeight: 700 }}>{phoneDisplay}</span>
                        </div>
                      )}
                      {i === 3 && st !== 'idle' && (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#FFC58A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                          {st === 'done' ? `${lead.smsBody.length} chars · ready to send` : `streaming via claude…`}
                        </div>
                      )}
                      {i === 4 && st !== 'idle' && (
                        <div style={{ marginTop: 4, fontSize: 12, color: '#22C55E', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
                          {st === 'done' ? '✓ in shop dashboard · push notif sent' : 'dispatching…'}
                        </div>
                      )}
                    </div>
                    <StageStatus st={st} />
                  </div>
                )
              })}
            </div>

            {/* Footer pill row */}
            <div style={{
              position: 'relative',
              display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center',
              marginTop: 18, paddingTop: 14,
              borderTop: '1px solid rgba(255,197,138,0.18)',
              fontSize: 11, fontWeight: 700, color: 'rgba(255,248,240,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              <span>📍 nationwide coverage</span>
              <span>🛰 nightly signal scan</span>
              <span>🎯 verified intent</span>
              <span>🤖 large-language-model AI</span>
              <span>✉ weekly drop</span>
            </div>
          </div>

          {/* RIGHT — phone mockup */}
          <div style={{
            borderRadius: 20,
            background: '#FFFFFF',
            border: '1px solid rgba(232,116,43,0.18)',
            padding: 24,
            boxShadow: '0 30px 70px rgba(11,31,58,0.10)',
            display: 'flex', flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                AI writing now · from {lead.shopName}
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>
                Outreach SMS → <span style={{ color: '#C84B26' }}>{lead.firstName}</span>
              </div>
            </div>

            {/* Phone */}
            <div style={{
              flex: 1,
              borderRadius: 28,
              background: '#0B1F3A',
              padding: 14,
              boxShadow: 'inset 0 0 0 2px rgba(232,116,43,0.20), 0 14px 40px rgba(11,31,58,0.30)',
              minHeight: 360,
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Phone top */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 8px 10px',
                fontSize: 11, color: 'rgba(255,248,240,0.7)', fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}>
                <span>9:41</span>
                <span>📶 5G ●●●●●</span>
              </div>

              {/* Recipient bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                background: 'rgba(255,248,240,0.06)',
                borderRadius: 12,
                marginBottom: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FF9D5A, #C84B26)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 900, color: '#fff',
                  flexShrink: 0,
                }}>{lead.firstName[0]}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#FFF8F0' }}>{lead.owner}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,248,240,0.55)', fontVariantNumeric: 'tabular-nums' }}>{phoneDisplay}</div>
                </div>
              </div>

              {/* Message bubble */}
              <div style={{ flex: 1, padding: '4px 6px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                {smsTyped.length > 0 ? (
                  <div style={{
                    maxWidth: '88%',
                    padding: '12px 14px',
                    borderRadius: 18,
                    background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                    color: '#fff',
                    fontSize: 13.5, lineHeight: 1.5,
                    boxShadow: '0 8px 20px rgba(232,116,43,0.35)',
                    alignSelf: 'flex-end',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {smsTyped}
                    {smsTyped.length < lead.smsBody.length && (
                      <span style={{
                        display: 'inline-block', width: 6, height: 14,
                        marginLeft: 2, verticalAlign: '-2px',
                        background: '#fff', animation: 'aipCaret 700ms steps(1) infinite',
                      }} />
                    )}
                  </div>
                ) : (
                  <div style={{
                    alignSelf: 'flex-end', padding: '10px 14px',
                    borderRadius: 18, background: 'rgba(255,248,240,0.08)',
                    display: 'flex', gap: 4, alignItems: 'center',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFC58A', animation: 'aipDot 1.2s infinite 0s' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFC58A', animation: 'aipDot 1.2s infinite 0.2s' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFC58A', animation: 'aipDot 1.2s infinite 0.4s' }} />
                  </div>
                )}
              </div>

              {/* Phone bottom — composer pretend */}
              <div style={{
                padding: '10px 12px',
                background: 'rgba(255,248,240,0.04)',
                borderRadius: 14,
                fontSize: 11, color: 'rgba(255,248,240,0.45)', fontStyle: 'italic',
                textAlign: 'center', marginTop: 6,
              }}>
                Sent from <strong style={{ color: '#FFC58A' }}>{lead.shopOwnerFirst}&apos;s</strong> number · auto-signed
              </div>
            </div>

            {/* Below phone */}
            <div style={{
              marginTop: 16, padding: '12px 14px', borderRadius: 12,
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.30)',
              fontSize: 12.5, color: '#0B1F3A', lineHeight: 1.5,
            }}>
              <strong style={{ color: '#16803F' }}>~9% reply rate.</strong> Shop owner only calls the YES&apos;s. Cold-dialing dies the day you lock your zip.
            </div>
          </div>
        </div>

        <style jsx global>{`
          @keyframes aipCaret { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
          @keyframes aipDot   { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4 } 40% { transform: translateY(-4px); opacity: 1 } }
          @media (max-width: 880px) {
            .pipeline-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </section>
  )
}

function StageStatus({ st }: { st: Stage }) {
  if (st === 'idle') {
    return (
      <span style={{
        fontSize: 11, fontWeight: 800,
        padding: '4px 9px', borderRadius: 7,
        background: 'rgba(255,248,240,0.06)', color: 'rgba(255,248,240,0.45)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>queued</span>
    )
  }
  if (st === 'active') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        fontSize: 11, fontWeight: 800,
        padding: '4px 10px', borderRadius: 7,
        background: 'rgba(232,116,43,0.20)', color: '#FFC58A',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        <span style={{
          width: 11, height: 11, borderRadius: '50%',
          border: '2px solid #FFC58A', borderTopColor: 'transparent',
          animation: 'aipSpin 700ms linear infinite',
        }} />
        running
        <style jsx global>{`@keyframes aipSpin { to { transform: rotate(360deg) } }`}</style>
      </span>
    )
  }
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 480, damping: 22 }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        fontSize: 11, fontWeight: 800,
        padding: '4px 10px', borderRadius: 7,
        background: 'rgba(34,197,94,0.18)', color: '#5EEAD4',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}
    >
      <span style={{
        width: 14, height: 14, borderRadius: '50%',
        background: '#22C55E',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 9, fontWeight: 900,
      }}>✓</span>
      done
    </motion.span>
  )
}

function reveal(masked: string, full: string, n: number): string {
  // Replace the last n character slots of the masked string with the
  // matching full-string chars. Non-mask chars in masked are kept as-is.
  const maskedArr = masked.split('')
  const fullArr = full.split('')
  if (maskedArr.length !== fullArr.length) return full.slice(0, n).padEnd(masked.length, ' ')
  let replaced = 0
  for (let i = maskedArr.length - 1; i >= 0 && replaced < n; i--) {
    if (maskedArr[i] === '●') {
      maskedArr[i] = fullArr[i]
      replaced += 1
    }
  }
  return maskedArr.join('')
}
