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
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(232,116,43,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ objectFit: 'contain', marginTop: 10 }} />
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
            <h1 style={{ fontSize: 'clamp(34px, 4.4vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: 18, color: '#0B1F3A' }}>
              Hi, I&apos;m Peter. I built BellAveGo after watching too many contractors lose jobs <span style={{ background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(232,116,43,0.32))' }}>to voicemail.</span>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: '#3D5A62', maxWidth: 520, margin: '0 0 18px' }}>
              Most home-service businesses don&apos;t need more software. They need someone making sure the phone gets answered, the lead gets captured, and the customer gets booked.
            </p>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: '#C84B26', fontWeight: 800, margin: '0 0 28px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 20, borderTop: '1px solid rgba(232,116,43,0.18)' }}>
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,116,43,0.45), transparent 70%)', filter: 'blur(12px)' }} />
                <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, boxShadow: '0 8px 20px rgba(232,116,43,0.42)', border: '2px solid #fff' }}>P</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px' }}>Peter McShane</div>
                <div style={{ fontSize: 12, color: '#C84B26', fontWeight: 700, marginTop: 2 }}>Founder &amp; CEO, BellAveGo</div>
                <div style={{ fontSize: 11.5, color: '#7AAAB2', fontWeight: 500, marginTop: 2 }}>Building AI tools for home-service businesses</div>
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
            `}</style>

            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(232,116,43,0.14)', background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF7EE 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="mc-status-pill"><span className="mc-live-dot" /> Live · AI handling call</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#7AAAB2', fontVariantNumeric: 'tabular-nums' }}>
                <div className="mc-wave" style={{ height: 18 }}>
                  <span /><span /><span /><span /><span /><span /><span />
                </div>
                <span>00:24</span>
              </div>
            </div>

            {/* Caller card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid rgba(232,116,43,0.10)' }}>
              <div className="hero-call-ring" style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 6px 16px rgba(232,116,43,0.32)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0B1F3A' }}>Sarah Chen</div>
                <div style={{ fontSize: 11.5, color: '#4A6670' }}>(612) 555-0148 · St. Louis Park, MN</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: 'rgba(232,116,43,0.14)', color: '#C84B26', border: '1px solid rgba(232,116,43,0.36)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Urgent</span>
            </div>

            {/* Live transcript */}
            <div style={{ padding: '16px 20px', minHeight: 280, maxHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {TRANSCRIPT.slice(Math.max(0, activeIdx - 4), activeIdx + 1).map((line, i, arr) => {
                const isActive = i === arr.length - 1
                return (
                  <div key={`${activeIdx}-${i}`} className="mc-slide-up" style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    opacity: isActive ? 1 : 0.45,
                    transition: 'opacity 0.4s',
                  }}>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '3px 8px', borderRadius: 6, marginTop: 2,
                      background: line.who === 'ai' ? 'rgba(232,116,43,0.10)' : '#F1F5F9',
                      color: line.who === 'ai' ? '#C84B26' : '#4A6670',
                      border: line.who === 'ai' ? '1px solid rgba(232,116,43,0.28)' : '1px solid #E2E8F0',
                    }}>{line.who === 'ai' ? 'AI' : 'Caller'}</span>
                    <span style={{ fontSize: 13.5, lineHeight: 1.55, color: isActive ? '#0B1F3A' : '#4A6670' }}>
                      {line.line}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Captured fields — fills as the call progresses */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(232,116,43,0.14)', background: 'linear-gradient(135deg, #FFF7EE 0%, #FFFAF3 100%)' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
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
                    padding: '8px 11px', borderRadius: 8,
                    background: f.ready ? (f.ok ? '#ECFDF5' : '#FFFFFF') : 'rgba(255,255,255,0.5)',
                    border: `1px solid ${f.ready ? (f.ok ? 'rgba(34,197,94,0.36)' : 'rgba(232,116,43,0.20)') : 'rgba(232,116,43,0.08)'}`,
                    transition: 'all 0.4s',
                  }}>
                    <div style={{ fontSize: 8.5, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 1 }}>{f.k}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: f.ready ? (f.ok ? '#15803D' : '#0B1F3A') : '#A0BCC2' }}>
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
        <div className="mc-glow-orange" style={{ width: 500, height: 500, top: '10%', left: '-10%' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14, textAlign: 'center' }}>Why I built it</p>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', color: '#0B1F3A', marginBottom: 36, lineHeight: 1.1 }}>
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
                <div className="mc-eyebrow" style={{ color: b.accent === 'orange' ? '#C84B26' : '#0AA89F' }}>{b.eyebrow}</div>
                <p style={{ fontSize: 15, lineHeight: 1.6, color: '#0B1F3A', margin: 0, fontWeight: 500 }}>
                  {b.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT'S BUILT — proof rows */}
      <section style={{ position: 'relative', padding: '40px 32px 64px' }}>
        <div className="mc-glow-teal" style={{ width: 600, height: 600, bottom: '0', right: '-15%' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14, textAlign: 'center' }}>What&apos;s already built</p>
          <h2 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', color: '#0B1F3A', marginBottom: 12, lineHeight: 1.1 }}>
            This isn&apos;t a pitch deck. <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>It&apos;s shipping software.</span>
          </h2>
          <p style={{ fontSize: 15, color: '#3D5A62', textAlign: 'center', maxWidth: 580, margin: '0 auto 36px', lineHeight: 1.6 }}>
            Every feature below works today. Call <a href="tel:+16514677829" style={{ color: '#C84B26', fontWeight: 700, textDecoration: 'none' }}>(651) 467-7829</a> to hear it yourself.
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
              <div key={x.title} className="mc-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="mc-live-dot" />
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#15803D', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Shipped</span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', margin: '0 0 6px', letterSpacing: '-0.2px' }}>{x.title}</h3>
                <p style={{ fontSize: 13, color: '#4A6670', margin: 0, lineHeight: 1.55 }}>{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: 'relative', padding: '72px 32px', textAlign: 'center', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 900, height: 900, top: '-60%', left: '50%', transform: 'translateX(-50%)' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 42px)', fontWeight: 900, marginBottom: 14, color: '#0B1F3A', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            Try it before you trust it.
          </h2>
          <p style={{ color: '#3D5A62', fontSize: 17, margin: '0 auto 32px', lineHeight: 1.55 }}>
            Call the demo. Hear the AI. Then decide. <span style={{ color: '#C84B26', fontWeight: 800 }}>30-day money-back if it doesn&apos;t earn its keep.</span>
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
      <footer style={{ padding: '32px 40px', background: '#FFF7EE', borderTop: '1px solid rgba(232,116,43,0.18)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>
          BellAveGo · Built by Peter McShane in Manhattan, NY · <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
