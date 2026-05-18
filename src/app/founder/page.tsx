'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'
import RoiCalculator from '@/components/RoiCalculator'

/**
 * Meet the Founder — Sunset Mission Control aesthetic.
 *
 * Right rail is a "Why I founded BellAveGo" video placeholder card (video
 * not recorded yet — sits there ready). Left rail is short emotional headline
 * + condensed founder summary + premium founder ID card.
 */
export default function FounderPage() {
  const { isSignedIn } = useAuth()

  return (
    <main className="mc-page" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Nav */}
      <nav className="bavg-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(232,116,43,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" className="bavg-top-nav-logo" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ objectFit: 'contain', marginTop: 10 }} />
        </Link>
        <div className="bavg-top-nav-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn && <Link href="/dashboard" className="nav-cta"><span className="nav-cta-text">Dashboard</span></Link>}
          <Link href="/founder" className="why-pulse"><span className="why-pulse-text">Why BellAveGo?</span></Link>
          <Link href="/pricing" className="price-pulse">Pricing</Link>
          {!isSignedIn && <Link href="/sign-in" className="signin-link">Sign In</Link>}
          {!isSignedIn && <Link href="/sign-up" className="nav-cta"><span className="nav-cta-text">Create Account</span></Link>}
        </div>
      </nav>

      {/* HERO — emotional headline + live AI demo card */}
      <section style={{ position: 'relative', padding: '72px 32px 80px', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 600, height: 600, top: '-20%', right: '-10%', opacity: 0.65 }} />
        <div className="mc-glow-teal" style={{ width: 700, height: 700, bottom: '-40%', left: '-12%' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto' }}>
          <style>{`
            @media (max-width: 920px) {
              .founder-quad { grid-template-columns: 1fr !important; gap: 22px !important; }
              .founder-quad .quad-left,
              .founder-quad .quad-right { gap: 18px !important; }
            }
          `}</style>

          {/* Headline spans the full width above the 4-corner layout */}
          <h1 className="mc-slide-up" style={{ fontSize: 'clamp(40px, 5.4vw, 68px)', fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 1.02, marginBottom: 32, color: '#0B1F3A', maxWidth: 880 }}>
            Hi, I&apos;m Peter.<br />
            I founded <span style={{ background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(232,116,43,0.32))' }}>BellAveGo.</span>
          </h1>

          {/* Four-corner reading layout:
                TL = Para 1 (origin),  TR = Para 3 (impact/mission)
                BL = Para 2 (team),    BR = Video card
              Reader scans down the left column (paragraphs 1 -> 2),
              then crosses to the right column where the closing
              paragraph sits above the visual anchor (the video). */}
          <div
            className="founder-quad mc-slide-up"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 36,
              alignItems: 'start',
              marginBottom: 36,
            }}
          >
            {/* LEFT column — paragraphs 1 + 2 stacked */}
            <div className="quad-left" style={{ display: 'flex', flexDirection: 'column', gap: 18, fontSize: 16, lineHeight: 1.65, color: '#3D5A62' }}>
              <p style={{ margin: 0 }}>
                I didn&apos;t start BellAveGo because AI was trending &mdash; I started it because I watched hardworking people lose money while doing the actual work. One afternoon, I was helping my friend Joe with a garage project when his phone rang four different times in under an hour. He ignored two calls because his hands were full, answered one just to say <em>&ldquo;I&rsquo;ll call you back,&rdquo;</em> and had to completely stop working just to schedule an appointment. Standing there watching it happen in real time, it hit me: thousands of home-service businesses are losing revenue every single day simply because they&rsquo;re too busy working to manage everything happening around them.
              </p>
              <p style={{ margin: 0 }}>
                My team and I have spent years deep in the world of LLMs, voice AI, agentic workflows, retrieval systems, automation pipelines, and conversational inference systems &mdash; not just experimenting with AI, but learning how to deploy it in ways that actually solve operational problems for real businesses. That&rsquo;s why we built BellAveGo: an AI receptionist and operational intelligence platform designed specifically for home-service teams with anywhere from one to fifteen employees. BellAveGo answers missed calls, books appointments, captures leads, analyzes neighborhood demand patterns, identifies revenue opportunities, and helps owners stop losing business while they&rsquo;re physically on the job.
              </p>
            </div>

            {/* RIGHT column — paragraph 3 on top, video below */}
            <div className="quad-right" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: '#3D5A62' }}>
                Behind the scenes, BellAveGo runs a network of <span style={{ color: '#C84B26', fontWeight: 800 }}>over 30 specialized agentic AI systems</span> that continuously analyze call behavior, local market trends, competitor positioning, booking inefficiencies, customer intent, and missed revenue opportunities across each client&rsquo;s service area. Those systems help generate BellAveGo consulting reports, which are then manually reviewed and refined by our team to turn raw AI analysis into real-world business strategy. We genuinely believe <strong>every single home-service business in the world could increase yearly revenue by 30%+ using BellAveGo</strong> &mdash; simply by capturing more leads, reducing missed opportunities, automating scheduling, saving time on the job, and identifying market opportunities they otherwise would never see. BellAveGo was never built to replace hardworking people &mdash; it was built to give smaller teams access to the kind of automation, operational intelligence, and market analysis that used to only exist inside large companies.
              </p>

              {/* VIDEO PLACEHOLDER — "Why I founded BellAveGo" */}
          {/* Video isn't recorded yet. When it is, swap the inner play-button
              block for an <iframe> (Loom / YouTube / mux-player). The card
              dimensions, glow, and tap target are already set. */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Why I founded BellAveGo — video coming soon"
            style={{
              position: 'relative',
              aspectRatio: '16/10',
              borderRadius: 22,
              overflow: 'hidden',
              cursor: 'pointer',
              background:
                'radial-gradient(circle at 30% 25%, rgba(255,157,90,0.30), transparent 55%),' +
                'radial-gradient(circle at 80% 75%, rgba(20,184,166,0.28), transparent 60%),' +
                'linear-gradient(135deg, #050E1F 0%, #0B1F3A 50%, #112C4A 100%)',
              border: '1px solid rgba(94,234,212,0.32)',
              boxShadow:
                '0 30px 70px rgba(11,31,58,0.30),' +
                '0 0 0 1px rgba(232,116,43,0.18),' +
                '0 0 80px rgba(232,116,43,0.20)',
              transition: 'transform 0.32s ease, box-shadow 0.32s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)'
              e.currentTarget.style.boxShadow =
                '0 40px 90px rgba(11,31,58,0.36), 0 0 0 1px rgba(94,234,212,0.45), 0 0 110px rgba(232,116,43,0.32)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow =
                '0 30px 70px rgba(11,31,58,0.30), 0 0 0 1px rgba(232,116,43,0.18), 0 0 80px rgba(232,116,43,0.20)'
            }}
          >
            <style>{`
              @keyframes founderPlayPulse {
                0%, 100% { box-shadow: 0 18px 40px rgba(232,116,43,0.55), 0 0 0 0 rgba(255,217,168,0.6); }
                50%      { box-shadow: 0 22px 50px rgba(232,116,43,0.7),  0 0 0 18px rgba(255,217,168,0); }
              }
              .founder-play { animation: founderPlayPulse 2.4s ease-in-out infinite; }
            `}</style>

            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: 22 }}>
              {/* Top meta — coming-soon tag + duration */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 11px', borderRadius: 99,
                  background: 'rgba(94,234,212,0.14)',
                  border: '1px solid rgba(94,234,212,0.40)',
                  fontSize: 10, fontWeight: 800, color: '#5EEAD4',
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#E8742B', boxShadow: '0 0 8px rgba(232,116,43,0.7)' }} />
                  Founder story
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.04em' }}>
                  Coming soon
                </span>
              </div>

              {/* Center play button */}
              <div className="founder-play" style={{
                margin: 'auto',
                width: 96, height: 96,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                border: '4px solid rgba(255,255,255,0.92)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#0B1F3A',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>

              {/* Bottom title */}
              <div style={{ textAlign: 'center', color: '#fff' }}>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px', marginBottom: 5 }}>
                  Why I founded BellAveGo
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(94,234,212,0.85)', letterSpacing: '0.04em' }}>
                  Video drops soon &middot; ~3&nbsp;min watch
                </div>
              </div>
            </div>
          </div>
            </div>{/* /quad-right */}
          </div>{/* /founder-quad */}

          {/* CTA buttons + Founder ID card — full width below the quad */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/pricing" className="mc-btn-orange">
                Try BellAveGo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a href="tel:+16514677829" className="mc-btn-ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Hear the AI live · (651) 467-7829
              </a>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 18, borderTop: '1px solid rgba(232,116,43,0.18)' }}>
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,116,43,0.45), transparent 70%)', filter: 'blur(12px)' }} />
                <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, boxShadow: '0 8px 20px rgba(232,116,43,0.42)', border: '2px solid #fff' }}>P</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px' }}>The BellAveGo Team</div>
                <div style={{ fontSize: 12, color: '#C84B26', fontWeight: 700, marginTop: 2 }}>Software &amp; Finance Team</div>
                <div style={{ fontSize: 11.5, color: '#7AAAB2', fontWeight: 500, marginTop: 2 }}>Building AI tools for home-service businesses</div>
              </div>
            </div>
          </div>
        </div>{/* /outer hero wrapper */}
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
              { title: 'Auto-provisioned local number',     desc: 'Every customer gets a local AI number in their area code the moment they pay.', tone: 'orange' },
              { title: 'Stripe billing',          desc: 'Three-tier subscription, auto-suspend on payment failure.', tone: 'teal' },
              { title: 'AI receptionist',  desc: 'Sub-second latency, real natural voice. Captures the lead in under 60 seconds.', tone: 'orange' },
              { title: 'Quote Hunter',            desc: 'Auto-follow-up SMS day 2 / 7 / 14 on open quotes.', tone: 'teal' },
              { title: 'AI Collections',          desc: 'Auto-chases past-due invoices with Stripe pay-by-text links.', tone: 'orange' },
              { title: 'AI Consulting reports',   desc: 'Pulls your data, ranks revenue opportunities by addressable monthly $.', tone: 'teal' },
            ].map(x => (
              <div key={x.title} className={`mc-card mc-card-${x.tone}`} style={{ padding: 20 }}>
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

      {/* ROI CALCULATOR — pre-CTA conversion lever (moved from homepage) */}
      <RoiCalculator />

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
              Call the AI Demo · (651) 467-7829
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
          BellAveGo · Built by the BellAveGo software &amp; finance team · <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
