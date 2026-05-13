'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Meet the Founder — standalone page.
 *
 * Purpose at 0 ARR: prove BellAveGo is built by a real person who answers
 * his own phone, not a faceless SaaS shell. Linked from the homepage nav.
 * Video block stays "Coming soon" until we record it.
 */
export default function FounderPage() {
  const { isSignedIn } = useAuth()
  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh' }}>

      {/* Nav — consistent with the rest of the site */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={220} height={70} style={{ objectFit: 'contain', marginTop: 8 }} />
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn && (
            <Link href="/dashboard" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>Dashboard</Link>
          )}
          <Link href="/founder" className="nav-pill-why">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <path d="M13 2L3 14h7l-1 8 11-12h-7l1-8z"/>
            </svg>
            Why BellAveGo?
          </Link>
          <Link href="/pricing" className="nav-pill-price">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            Pricing
          </Link>
          {!isSignedIn && (
            <Link href="/sign-up" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>Sign in / Create Account</Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        padding: '64px 32px 72px',
        background: 'linear-gradient(180deg, #F2F9F5 0%, #EBF7F3 100%)',
        borderBottom: '1px solid rgba(10,168,159,0.10)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-30%', right: '-10%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,116,43,0.10) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-40%', left: '-10%',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(10,168,159,0.08) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1080, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(0, 1fr)', gap: 48, alignItems: 'center' }} className="founder-grid">
          <style>{`@media (max-width: 920px){.founder-grid{grid-template-columns:1fr!important;gap:32px!important}}`}</style>

          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '5px 13px', borderRadius: 99,
              background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.32)',
              fontSize: 10.5, fontWeight: 800, color: '#C84B26',
              letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg, #FF9D5A, #E8742B)' }} />
              Built by people who answer their own phones
            </span>
            <h1 style={{ fontSize: 'clamp(30px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.04, marginBottom: 16, color: '#0B1F3A' }}>
              Hi, I&apos;m Peter. I&apos;m <span style={{
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>building BellAveGo in public.</span>
            </h1>
            <div style={{ fontSize: 16, lineHeight: 1.65, color: '#3D5A62' }}>
              <p style={{ margin: '0 0 14px' }}>
                I&apos;m a one-person team, currently in Manhattan, NY. I started BellAveGo because I watched too many home-service owners — my friends, my family&apos;s contractors, the guys I called for help — lose jobs to voicemail. The fix existed, but it was either dumb (a $9/mo generic answering service) or insanely expensive ($400/mo agency that takes a cut of every booking).
              </p>
              <p style={{ margin: '0 0 14px' }}>
                BellAveGo is the version contractors actually deserve. The AI answers like a real receptionist. Texts you the lead with one-tap actions. Pays for itself in a single booked job. No contracts.
              </p>
              <p style={{ margin: 0 }}>
                If it doesn&apos;t earn its keep in the first 30 days, you get a full refund and we part on good terms. That&apos;s the deal. My personal number is on every receipt — <a href="tel:+17737109565" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>(773) 710-9565</a> — and yes, I actually answer it.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(10,168,159,0.14)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, boxShadow: '0 6px 14px rgba(10,168,159,0.32)', flexShrink: 0 }}>P</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px' }}>Peter McShane</div>
                <div style={{ fontSize: 11.5, color: '#7AAAB2', fontWeight: 600, marginTop: 1 }}>Founder · BellAveGo · Manhattan, NY</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <Link href="/pricing" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 20px', borderRadius: 11,
                background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)',
                color: '#0B1F3A', fontSize: 13, fontWeight: 900, letterSpacing: '-0.1px',
                textDecoration: 'none', border: '1px solid rgba(255,217,168,0.55)',
                boxShadow: '0 10px 26px rgba(232,116,43,0.4)',
              }}>
                Try BellAveGo
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a href="mailto:peter@bellavego.com" style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '11px 16px', borderRadius: 11,
                background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(10,168,159,0.22)',
                color: '#0AA89F', fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                Email me directly
              </a>
            </div>
          </div>

          {/* Video card — placeholder until recorded */}
          <div style={{
            position: 'relative', aspectRatio: '16/10', borderRadius: 18, overflow: 'hidden',
            background: 'radial-gradient(circle at 30% 30%, rgba(255,157,90,0.32), transparent 60%), linear-gradient(135deg, #050E1F 0%, #0B1F3A 50%, #112C4A 100%)',
            border: '1px solid rgba(232,116,43,0.38)',
            boxShadow: '0 30px 70px rgba(0,0,0,0.32), 0 0 0 1px rgba(94,234,212,0.10), 0 0 80px rgba(232,116,43,0.22)',
          }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 11px', borderRadius: 99,
                  background: 'rgba(94,234,212,0.14)', border: '1px solid rgba(94,234,212,0.32)',
                  fontSize: 10, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E8742B' }} />
                  BellAveGo story
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.04em' }}>Coming soon</span>
              </div>
              <div style={{
                margin: 'auto', width: 84, height: 84, borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                border: '4px solid rgba(255,255,255,0.92)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0B1F3A',
                boxShadow: '0 18px 40px rgba(232,116,43,0.55)',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px', marginBottom: 4 }}>Why I built BellAveGo</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.62)' }}>Coming soon</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Proof of work — at 0 ARR, show the actual building, not just claims */}
      <section style={{ padding: '64px 32px', background: '#fff', borderBottom: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' }}>What&apos;s already built</p>
          <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.8px', textAlign: 'center', marginBottom: 10, color: '#0B1F3A' }}>
            This isn&apos;t a pitch deck. It&apos;s shipping software.
          </h2>
          <p style={{ fontSize: 15, color: '#4A6670', textAlign: 'center', maxWidth: 620, margin: '0 auto 36px', lineHeight: 1.6 }}>
            Every line below works today. Call the demo number to hear it yourself: <a href="tel:+16514677829" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>(651) 467-7829</a>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {[
              { title: 'Multi-tenant Twilio', desc: 'Every customer auto-provisioned their own local AI number on Stripe checkout. Live.' },
              { title: 'Stripe billing', desc: 'Three-tier subscription with auto-suspend on payment failure. Live.' },
              { title: 'AI receptionist', desc: 'Real Claude Sonnet voice agent. Captures name, address, problem, urgency, window in ≤6 questions. Live.' },
              { title: 'Quote Hunter', desc: 'Auto-follow-up SMS on open quotes at day 2, 7, 14. Live for Office Manager tier.' },
              { title: 'AI Collections', desc: 'Auto-chases past-due invoices with Stripe pay-by-text links. Live.' },
              { title: 'Consulting reports', desc: 'AI-generated revenue intelligence reports — pulls your data, ranks opportunities by addressable revenue. Live.' },
            ].map(x => (
              <div key={x.title} style={{ background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 14, padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#15803D', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Shipped</span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', margin: '0 0 6px', letterSpacing: '-0.2px' }}>{x.title}</h3>
                <p style={{ fontSize: 13, color: '#4A6670', margin: 0, lineHeight: 1.55 }}>{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '64px 32px', background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 40px)', fontWeight: 900, marginBottom: 12, color: '#fff', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
          Try it before you trust it.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, maxWidth: 480, margin: '0 auto 28px', lineHeight: 1.6 }}>
          Call the demo. Hear the AI. Then decide. 30-day money-back if it doesn&apos;t earn its keep.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="tel:+16514677829" style={{ padding: '14px 30px', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', borderRadius: 12, textDecoration: 'none', fontWeight: 900, fontSize: 15 }}>
            📞 Call the AI Demo
          </a>
          <Link href="/pricing" style={{ padding: '14px 28px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 15 }}>
            See pricing →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>BellAveGo · Built by Peter McShane in Manhattan, NY · <a href="mailto:peter@bellavego.com" style={{ color: '#5EEAD4', textDecoration: 'none' }}>peter@bellavego.com</a></p>
      </footer>
    </main>
  )
}
