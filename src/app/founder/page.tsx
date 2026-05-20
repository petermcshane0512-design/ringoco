'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'
import RoiCalculator from '@/components/RoiCalculator'

/**
 * Founder story — Sunset Mission Control aesthetic.
 *
 * Single emotional hook headline (Joe gets 4 calls in an hour) anchors the
 * page; the two-column body splits the origin story (left) from the thesis
 * (right). ROI calculator below lets the reader plug in their own numbers,
 * then a sharp "trust the AI, not me" CTA closes. Algorithm-tightened:
 * the prior video placeholder + shipped-features grid were deleted because
 * neither was finished work — placeholder content is anti-conversion.
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

      {/* HERO — emotional headline + live AI demo card.
          Spacing/typography retuned for a premium SaaS founder-story
          feel (Stripe/Ramp/Linear cadence). Wider content area, large
          column gap, looser line-height, stronger vertical rhythm. */}
      <section style={{ position: 'relative', padding: '104px 40px 120px', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 600, height: 600, top: '-20%', right: '-10%', opacity: 0.65 }} />
        <div className="mc-glow-teal" style={{ width: 700, height: 700, bottom: '-40%', left: '-12%' }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1320, margin: '0 auto' }}>
          <style>{`
            @media (max-width: 1100px) {
              .founder-quad { column-gap: 56px !important; }
            }
            @media (max-width: 960px) {
              .founder-quad { grid-template-columns: 1fr !important; column-gap: 0 !important; row-gap: 36px !important; }
              .founder-quad .quad-left,
              .founder-quad .quad-right { gap: 26px !important; }
              .founder-meta { flex-direction: column !important; align-items: flex-start !important; gap: 28px !important; }
              .founder-story-pair { grid-template-columns: 1fr !important; gap: 20px !important; }
            }
          `}</style>

          {/* Eyebrow — names the author of the page, replaces the generic
              "Hi I'm Peter" placeholder headline. */}
          <p className="mc-slide-up" style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.22em', textTransform: 'uppercase', margin: '0 0 18px', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 22, height: 1, background: 'linear-gradient(90deg, #E8742B, transparent)' }} />
            Founder story · Peter McShane
          </p>

          {/* Headline — emotional hook, not a placeholder. Specific numbers
              (four calls, one hour) earn the read. The dropped-jobs framing
              is the story arc compressed into a single sentence. */}
          <h1 className="mc-slide-up" style={{ fontSize: 'clamp(40px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.04, marginBottom: 40, color: '#0B1F3A', maxWidth: 1020 }}>
            My friend Joe got <span style={{ background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(232,116,43,0.32))' }}>four calls in an hour.</span> He answered one. That night I started building <span style={{ background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(232,116,43,0.32))' }}>BellAveGo.</span>
          </h1>

          {/* Story pair — the two photos that previously lived on the homepage.
              Visually anchors the Joe-on-the-job paragraph below: customer
              calls the AI receptionist while the contractor stays focused on
              the job, both get a clean notification. Stacks 1-col on mobile. */}
          <div
            className="founder-story-pair mc-slide-up"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 28,
              marginBottom: 64,
            }}
          >
            <div
              style={{
                position: 'relative',
                borderRadius: 22,
                overflow: 'hidden',
                border: '1px solid rgba(232,116,43,0.18)',
                boxShadow: '0 24px 60px rgba(11,31,58,0.18), 0 0 0 1px rgba(232,116,43,0.08)',
                aspectRatio: '3/2',
                background: '#0B1F3A',
              }}
            >
              <Image
                src="/customer.png"
                alt="Homeowner on the phone with BellAveGo's AI receptionist, getting a confirmation notification"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: 'cover' }}
                priority
              />
            </div>
            <div
              style={{
                position: 'relative',
                borderRadius: 22,
                overflow: 'hidden',
                border: '1px solid rgba(94,234,212,0.22)',
                boxShadow: '0 24px 60px rgba(11,31,58,0.18), 0 0 0 1px rgba(10,168,159,0.08)',
                aspectRatio: '3/2',
                background: '#0B1F3A',
              }}
            >
              <Image
                src="/electrician.png"
                alt="Electrician on the job getting an SMS from BellAveGo with a new appointment request"
                fill
                sizes="(max-width: 960px) 100vw, 50vw"
                style={{ objectFit: 'cover' }}
                priority
              />
            </div>
          </div>

          {/* Body grid — slightly wider left (text) column than right
              (visual) column. Large column gap creates the editorial
              breathing room; both columns flow top-down naturally. */}
          <div
            className="founder-quad mc-slide-up"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.12fr 1fr',
              columnGap: 88,
              rowGap: 40,
              alignItems: 'start',
              marginBottom: 64,
            }}
          >
            {/* LEFT column — the story, with specifics. The math at the end
                converts the anecdote into a problem-statement contractors
                can recognize as their own. */}
            <div className="quad-left" style={{ display: 'flex', flexDirection: 'column', gap: 28, fontSize: 18, lineHeight: 1.72, color: '#3D5A62' }}>
              <p style={{ margin: 0 }}>
                It was a Saturday and I was helping Joe finish a garage. His phone rang four times in under an hour. Two went to voicemail because his hands were buried in drywall. One he caught long enough to say <em>&ldquo;I&rsquo;ll call you back&rdquo;</em> &mdash; then forgot. The fourth he answered, but he had to stop working to schedule it. By the time we cleaned up he was three jobs lighter than he should&rsquo;ve been, and he wasn&rsquo;t sure which calls he&rsquo;d lost.
              </p>
              <p style={{ margin: 0 }}>
                I went home that night and started building. Every contractor I&rsquo;ve talked to since tells the same story. The math is brutal &mdash; at a <strong style={{ color: '#0B1F3A' }}>$480 average ticket</strong> and a <strong style={{ color: '#0B1F3A' }}>35% close rate</strong>, eight missed calls a week is roughly <strong style={{ color: '#C84B26' }}>$5,800 walking out the door every month.</strong>
              </p>
            </div>

            {/* RIGHT column — the belief that justifies the company's
                existence. This is the thesis: receptionist is the data
                collection layer, the real product is the intelligence on
                top. Closes with the thesis pull quote. */}
            <div className="quad-right" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.72, color: '#3D5A62' }}>
                Most AI receptionist startups think the product is call answering. It isn&rsquo;t. Call answering is how we <em>collect the data.</em>
              </p>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.72, color: '#3D5A62' }}>
                The real product is what BellAveGo does with that data &mdash; finds the patterns, scores the opportunities, and tells you in dollars exactly where your business is leaking revenue. Every customer gets a free diagnostic report on day one. That&rsquo;s the part nobody else is building, and it&rsquo;s the only reason BellAveGo will exist in five years.
              </p>

              {/* Thesis pull quote — the company in one sentence. Replaces
                  the prior "never built to replace hardworking people"
                  framing, which read like a press release. */}
              <p style={{
                margin: '8px 0 0',
                paddingLeft: 20,
                borderLeft: '3px solid rgba(232,116,43,0.75)',
                fontSize: 19,
                lineHeight: 1.55,
                color: '#0B1F3A',
                fontWeight: 700,
                letterSpacing: '-0.2px',
              }}>
                &ldquo;The receptionist is how we get the data. The product is knowing &mdash; in dollars &mdash; exactly which call you should have answered first.&rdquo;
              </p>
            </div>{/* /quad-right */}
          </div>{/* /founder-quad */}

          {/* CTAs (left) + Founder ID card (right) on the same row, with
              a soft top divider that visually re-anchors them to the
              story above. On mobile this stacks via the .founder-meta
              media query in the <style> block above. */}
          <div
            className="founder-meta"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 40,
              paddingTop: 44,
              borderTop: '1px solid rgba(232,116,43,0.16)',
            }}
          >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Link href="/pricing" className="mc-btn-orange">
                Try BellAveGo
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <a href="tel:+16514677829" className="mc-btn-ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                Hear the AI live · (651) 467-7829
              </a>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,116,43,0.45), transparent 70%)', filter: 'blur(12px)' }} />
                <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, boxShadow: '0 8px 20px rgba(232,116,43,0.42)', border: '2px solid #fff' }}>P</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px' }}>Peter McShane</div>
                <div style={{ fontSize: 12, color: '#C84B26', fontWeight: 700, marginTop: 2 }}>Founder, BellAveGo</div>
                <div style={{ fontSize: 11.5, color: '#7AAAB2', fontWeight: 500, marginTop: 2 }}>Building software to give contractors their nights back</div>
              </div>
            </div>
          </div>
        </div>{/* /outer hero wrapper */}
      </section>

      {/* ROI CALCULATOR — Peter showing the math to the contractor reading
          the founder page. The two-paragraph story upstream set the stakes
          ($5,800/mo at 8 missed calls/wk); this lets them plug in their
          own numbers and feel it. Conversion lever moved from homepage. */}
      <RoiCalculator />

      {/* CTA */}
      <section style={{ position: 'relative', padding: '72px 32px', textAlign: 'center', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 900, height: 900, top: '-60%', left: '50%', transform: 'translateX(-50%)' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 42px)', fontWeight: 900, marginBottom: 14, color: '#0B1F3A', letterSpacing: '-0.04em', lineHeight: 1.1 }}>
            You don&apos;t have to trust me. Trust the AI.
          </h2>
          <p style={{ color: '#3D5A62', fontSize: 17, margin: '0 auto 32px', lineHeight: 1.55 }}>
            Call <a href="tel:+16514677829" style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>(651) 467-7829</a>. Tell it your AC is broken. If the AI doesn&rsquo;t capture the lead in 60 seconds and text the dispatcher, <span style={{ color: '#C84B26', fontWeight: 800 }}>BellAveGo isn&rsquo;t ready for you.</span>
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
          BellAveGo · Built by Peter McShane · <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
