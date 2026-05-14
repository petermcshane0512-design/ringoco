'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'

/**
 * Meet the Founder — venture-backed vertical-AI feel.
 *
 * Right rail is the live AI call demo (animated waveform, transcript playback,
 * glowing call state) — replaces the old "Coming soon" video that hurt
 * credibility. Left rail is concise emotional copy + premium founder card.
 */

const TRANSCRIPT: { who: 'ai' | 'caller'; line: string; pause?: number }[] = [
  { who: 'ai',     line: 'Thanks for calling Smith HVAC. What can we help you with today?' },
  { who: 'caller', line: 'Hi, my AC stopped cooling overnight. Kids are home, it’s really hot.' },
  { who: 'ai',     line: 'Ugh, no good. Can I grab your name and best callback number?' },
  { who: 'caller', line: 'Sarah Chen — six-one-two, five-five-five, oh-one-four-eight.' },
  { who: 'ai',     line: 'Got it. What’s the address we’d come out to?' },
  { who: 'caller', line: '4218 Cedar Lake Road, St. Louis Park.' },
  { who: 'ai',     line: 'Perfect. Best window today? Morning or afternoon?' },
  { who: 'caller', line: 'Anytime between 2 and 6 would be amazing.' },
  { who: 'ai',     line: 'Done — Mike will text you in the next few minutes to confirm. Hang tight.' },
]

export default function FounderPage() {
  const { isSignedIn } = useAuth()

  // Cycle through transcript lines for the live demo card
  const [activeIdx, setActiveIdx] = useState(0)
  useEffect(() => {
    let cancelled = false
    function tick(idx: number) {
      if (cancelled) return
      setActiveIdx(idx)
      const next = (idx + 1) % TRANSCRIPT.length
      const delay = TRANSCRIPT[idx].who === 'ai' ? 2400 : 2000
      setTimeout(() => tick(next), delay)
    }
    tick(0)
    return () => { cancelled = true }
  }, [])

  return (
    <main className="mc-page" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: 'rgba(11,31,58,0.65)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(94,234,212,0.10)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ objectFit: 'contain', marginTop: 10, filter: 'drop-shadow(0 4px 18px rgba(94,234,212,0.32))' }} />
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn && <Link href="/dashboard" className="nav-cta">Dashboard</Link>}
          <Link href="/founder" className="why-pulse">Why BellAveGo?</Link>
          <Link href="/pricing" className="price-pulse">Pricing</Link>
          {!isSignedIn && <Link href="/sign-up" className="nav-cta">Sign in / Create Account</Link>}
        </div>
      </nav>

      {/* HERO — emotional headline + live AI demo card */}
      <section style={{ position: 'relative', padding: '72px 32px 80px', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 600, height: 600, top: '-20%', right: '-10%', opacity: 0.65 }} />
        <div className="mc-glow-teal" style={{ width: 700, height: 700, bottom: '-40%', left: '-12%' }} />

        <div className="founder-grid" style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1.1fr)', gap: 56, alignItems: 'center' }}>
          <style>{`@media (max-width:920px){.founder-grid{grid-template-columns:1fr!important;gap:36px!important}}`}</style>

          {/* Left: copy */}
          <div className="mc-slide-up">
            <span className="mc-eyebrow" style={{ color: '#FF9D5A' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg, #FF9D5A, #E8742B)', boxShadow: '0 0 10px rgba(232,116,43,0.7)' }} />
              Built by people who answer their own phones
            </span>
            <h1 style={{ fontSize: 'clamp(34px, 4.4vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 18, color: '#fff' }}>
              Hi, I&apos;m Peter. I built BellAveGo after watching too many contractors lose jobs <span style={{ background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 0 24px rgba(232,116,43,0.4))' }}>to voicemail.</span>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: 'rgba(255,255,255,0.78)', maxWidth: 520, margin: '0 0 18px' }}>
              Most home-service businesses don&apos;t need more software. They need someone making sure the phone gets answered, the lead gets captured, and the customer gets booked.
            </p>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: '#5EEAD4', fontWeight: 700, margin: '0 0 28px' }}>
              BellAveGo was built to do exactly that.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
              <Link href="/pricing" className="mc-btn-orange">
                Try BellAveGo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a href="tel:+16514677829" className="mc-btn-ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Hear the AI live · (651) 467-7829
              </a>
            </div>

            {/* Founder ID card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 20, borderTop: '1px solid rgba(94,234,212,0.14)' }}>
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,116,43,0.55), transparent 70%)', filter: 'blur(10px)' }} />
                <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, boxShadow: '0 8px 20px rgba(232,116,43,0.42)', border: '2px solid rgba(255,217,168,0.4)' }}>P</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>Peter McShane</div>
                <div style={{ fontSize: 12, color: '#5EEAD4', fontWeight: 600, marginTop: 2 }}>Founder &amp; CEO, BellAveGo</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', fontWeight: 500, marginTop: 2 }}>Building AI tools for home-service businesses</div>
              </div>
            </div>
          </div>

          {/* Right: LIVE AI CALL DEMO */}
          <div className="mc-card mc-card-orange" style={{ padding: 0, overflow: 'hidden' }}>
            <style>{`
              @keyframes ringPulseHero {
                0%, 100% { box-shadow: 0 0 0 0 rgba(232,116,43,0.45); }
                70%      { box-shadow: 0 0 0 14px rgba(232,116,43,0); }
              }
              .hero-call-ring { animation: ringPulseHero 2.2s ease-out infinite; }
              @keyframes timeTick {
                0%   { width: 0 }
                100% { width: 100% }
              }
            `}</style>

            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(94,234,212,0.14)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mc-status-pill"><span className="mc-live-dot" /> Live · AI handling call</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontVariantNumeric: 'tabular-nums' }}>
                <div className="mc-wave" style={{ height: 18 }}>
                  <span /><span /><span /><span /><span /><span /><span />
                </div>
                <span>00:24</span>
              </div>
            </div>

            {/* Caller card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid rgba(94,234,212,0.10)' }}>
              <div className="hero-call-ring" style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #163356, #0B1F3A)', border: '1.5px solid rgba(94,234,212,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5EEAD4" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Sarah Chen</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>(612) 555-0148 · St. Louis Park, MN</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(232,116,43,0.18)', color: '#FF9D5A', border: '1px solid rgba(232,116,43,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Urgent</span>
            </div>

            {/* Live transcript */}
            <div style={{ padding: '16px 20px', minHeight: 280, maxHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TRANSCRIPT.slice(Math.max(0, activeIdx - 4), activeIdx + 1).map((line, i, arr) => {
                const isActive = i === arr.length - 1
                return (
                  <div key={`${activeIdx}-${i}`} className="mc-slide-up" style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    opacity: isActive ? 1 : 0.55,
                    transition: 'opacity 0.4s',
                  }}>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '3px 8px', borderRadius: 6, marginTop: 2,
                      background: line.who === 'ai' ? 'rgba(94,234,212,0.14)' : 'rgba(255,255,255,0.06)',
                      color: line.who === 'ai' ? '#5EEAD4' : 'rgba(255,255,255,0.7)',
                      border: line.who === 'ai' ? '1px solid rgba(94,234,212,0.32)' : '1px solid rgba(255,255,255,0.08)',
                    }}>{line.who === 'ai' ? 'AI' : 'Caller'}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.55, color: isActive ? '#fff' : 'rgba(255,255,255,0.78)' }}>
                      {line.line}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Captured fields — fills as the call progresses */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(94,234,212,0.14)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
                Captured this call
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[
                  { k: 'Name',    v: 'Sarah Chen',     ready: activeIdx >= 3 },
                  { k: 'Phone',   v: '(612) 555-0148', ready: activeIdx >= 3 },
                  { k: 'Service', v: 'AC repair',      ready: activeIdx >= 1 },
                  { k: 'Address', v: '4218 Cedar Lake Rd', ready: activeIdx >= 5 },
                  { k: 'Window',  v: 'Today 2–6 PM',   ready: activeIdx >= 7 },
                  { k: 'Status',  v: 'Booking complete', ready: activeIdx >= 8, ok: true },
                ].map(f => (
                  <div key={f.k} style={{
                    padding: '7px 10px', borderRadius: 8,
                    background: f.ready ? (f.ok ? 'rgba(34,197,94,0.10)' : 'rgba(94,234,212,0.06)') : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${f.ready ? (f.ok ? 'rgba(34,197,94,0.32)' : 'rgba(94,234,212,0.18)') : 'rgba(255,255,255,0.04)'}`,
                    transition: 'all 0.4s',
                  }}>
                    <div style={{ fontSize: 8.5, fontWeight: 800, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 1 }}>{f.k}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: f.ready ? (f.ok ? '#4ADE80' : '#fff') : 'rgba(255,255,255,0.25)' }}>
                      {f.ready ? f.v : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY I BUILT IT — three concise quote blocks */}
      <section style={{ position: 'relative', padding: '40px 32px 64px' }}>
        <div className="mc-glow-orange" style={{ width: 500, height: 500, top: '10%', left: '-10%', opacity: 0.4 }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14, textAlign: 'center' }}>Why I built it</p>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', color: '#fff', marginBottom: 36, lineHeight: 1.1 }}>
            We kept seeing the same problem.
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {[
              {
                eyebrow: 'The pain',
                body: 'Good businesses missing valuable jobs because they were on a ladder, driving between calls, or under a sink when the phone rang.',
                accent: 'orange',
              },
              {
                eyebrow: 'The market',
                body: 'Most solutions were either expensive agencies, outdated answering services, or generic AI tools that sounded robotic.',
                accent: 'teal',
              },
              {
                eyebrow: 'The fix',
                body: 'We built BellAveGo to feel like a real front desk for modern home-service teams — answers like a human, books like a pro, costs less than a missed job.',
                accent: 'orange',
              },
            ].map((b, i) => (
              <div key={i} className={`mc-card mc-card-${b.accent}`}>
                <div className="mc-eyebrow" style={{ color: b.accent === 'orange' ? '#FF9D5A' : '#5EEAD4' }}>{b.eyebrow}</div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: 'rgba(255,255,255,0.86)', margin: 0 }}>
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT'S BUILT — proof rows in dark cards */}
      <section style={{ position: 'relative', padding: '40px 32px 64px' }}>
        <div className="mc-glow-teal" style={{ width: 600, height: 600, bottom: '0', right: '-15%', opacity: 0.6 }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14, textAlign: 'center' }}>What&apos;s already built</p>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', color: '#fff', marginBottom: 12, lineHeight: 1.1 }}>
            This isn&apos;t a pitch deck. <span style={{ color: '#5EEAD4' }}>It&apos;s shipping software.</span>
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.62)', textAlign: 'center', maxWidth: 580, margin: '0 auto 36px', lineHeight: 1.6 }}>
            Every feature below works today. Call <a href="tel:+16514677829" style={{ color: '#5EEAD4', fontWeight: 700, textDecoration: 'none' }}>(651) 467-7829</a> to hear it yourself.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { title: 'Multi-tenant Twilio',     desc: 'Every customer auto-provisioned a local AI number on Stripe checkout.' },
              { title: 'Stripe billing',          desc: 'Three-tier subscription, auto-suspend on payment failure.' },
              { title: 'AI receptionist (Vapi)',  desc: 'Real Claude Sonnet voice with sub-second latency. Captures 5 fields in under 60 seconds.' },
              { title: 'Quote Hunter',            desc: 'Auto-follow-up SMS day 2 / 7 / 14 on open quotes.' },
              { title: 'AI Collections',          desc: 'Auto-chases past-due invoices with Stripe pay-by-text links.' },
              { title: 'AI Consulting reports',   desc: 'Pulls your data, ranks revenue opportunities by addressable monthly $.' },
            ].map(x => (
              <div key={x.title} className="mc-card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="mc-live-dot" />
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: '#4ADE80', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Shipped</span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.2px' }}>{x.title}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', margin: 0, lineHeight: 1.55 }}>{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', padding: '64px 32px', textAlign: 'center', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 800, height: 800, top: '-50%', left: '50%', transform: 'translateX(-50%)', opacity: 0.7 }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 40px)', fontWeight: 900, marginBottom: 14, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Try it before you trust it.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 17, margin: '0 auto 32px', lineHeight: 1.55 }}>
            Call the demo. Hear the AI. Then decide. <span style={{ color: '#5EEAD4', fontWeight: 700 }}>30-day money-back if it doesn&apos;t earn its keep.</span>
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="tel:+16514677829" className="mc-btn-orange">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call the AI Demo
            </a>
            <Link href="/pricing" className="mc-btn-ghost">
              See pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 40px', background: 'rgba(5,14,31,0.6)', borderTop: '1px solid rgba(94,234,212,0.10)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          BellAveGo · Built by Peter McShane in Manhattan, NY · <a href="mailto:peter@bellavego.com" style={{ color: '#5EEAD4', textDecoration: 'none' }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
