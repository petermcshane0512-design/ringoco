'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'
import RoiCalculator from '@/components/RoiCalculator'

/**
 * Founder story — editorial single-column layout.
 *
 * Five stacked sections: (1) hero with H1 + founder portrait, (2) origin
 * story prose + small inline scene-photo pair, (3) thesis prose + big
 * pull quote, (4) ROI calculator, (5) "trust the AI" CTA. The hero
 * portrait references /peter.png — drop the file into /public and it
 * replaces the gradient + "P" initial placeholder automatically.
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

      {/* Shared media-query rules + portrait styling. Defined once at the
          top of <main>. The .founder-portrait gradient is also the
          fallback that shows through if /peter.png hasn't been uploaded
          yet — drop the file into /public and it just works. */}
      <style>{`
        .founder-shell { max-width: 1180px; margin: 0 auto; padding: 0 40px; }
        .founder-prose { max-width: 720px; margin: 0 auto; font-size: 18px; line-height: 1.72; color: #3D5A62; }
        .founder-prose p { margin: 0 0 22px; }
        .founder-prose p:last-child { margin-bottom: 0; }
        .founder-prose strong { color: #0B1F3A; }
        .founder-eyebrow {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 800; color: #C84B26;
          letter-spacing: 0.22em; text-transform: uppercase;
          margin: 0 0 18px;
        }
        .founder-eyebrow::before {
          content: ''; width: 22px; height: 1px;
          background: linear-gradient(90deg, #E8742B, transparent);
        }

        /* Hero portrait — fallback gradient shows the "P" initial if the
           image is missing; image (when present) covers via objectFit. */
        .founder-portrait {
          position: relative;
          width: 100%;
          max-width: 420px;
          aspect-ratio: 4/5;
          margin: 0 auto;
          border-radius: 28px;
          overflow: hidden;
          background:
            radial-gradient(circle at 30% 25%, rgba(255,217,168,0.45), transparent 55%),
            radial-gradient(circle at 75% 80%, rgba(20,184,166,0.25), transparent 60%),
            linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%);
          border: 1px solid rgba(232,116,43,0.4);
          box-shadow:
            0 36px 80px rgba(11,31,58,0.30),
            0 0 0 1px rgba(232,116,43,0.18),
            0 0 100px rgba(232,116,43,0.18);
        }
        .founder-portrait::after {
          /* Placeholder "P" — hidden once the image loads on top */
          content: 'P';
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: clamp(120px, 14vw, 200px);
          font-weight: 900; color: rgba(255,255,255,0.55);
          letter-spacing: -0.05em;
          text-shadow: 0 8px 30px rgba(11,31,58,0.25);
          pointer-events: none;
          z-index: 0;
        }
        .founder-portrait img {
          position: relative;
          z-index: 1;
          object-fit: cover;
        }

        /* Small inline photo pair — much smaller than before. */
        .founder-scene-pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          max-width: 640px;
          margin: 36px auto 0;
        }
        .founder-scene {
          position: relative;
          aspect-ratio: 3/2;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(232,116,43,0.18);
          box-shadow: 0 14px 36px rgba(11,31,58,0.14);
          background: #0B1F3A;
        }
        .founder-scene-caption {
          margin-top: 10px;
          font-size: 12px;
          color: #7AAAB2;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-align: center;
        }

        /* Pull quote — centered, big, branded */
        .founder-pullquote {
          max-width: 880px;
          margin: 64px auto 0;
          padding: 0 20px;
          text-align: center;
          font-size: clamp(22px, 2.4vw, 30px);
          font-weight: 800;
          letter-spacing: -0.02em;
          line-height: 1.35;
          color: #0B1F3A;
        }
        .founder-pullquote .accent {
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .founder-pullquote::before {
          content: '“';
          display: block;
          font-size: 64px;
          line-height: 1;
          color: rgba(232,116,43,0.5);
          margin-bottom: 4px;
          font-family: 'Georgia', serif;
        }

        @media (max-width: 920px) {
          .founder-shell { padding: 0 22px; }
          .founder-hero-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
          .founder-hero-grid .founder-hero-text { order: 2; }
          .founder-hero-grid .founder-hero-photo { order: 1; }
          .founder-portrait { max-width: 320px; }
          .founder-scene-pair { gap: 12px; }
          .founder-pullquote { margin-top: 44px; }
        }
      `}</style>

      {/* ── 1. HERO — H1 + founder portrait ────────────────────────────── */}
      <section style={{ position: 'relative', padding: '88px 0 64px', overflow: 'hidden' }}>
        <div className="mc-glow-orange" style={{ width: 600, height: 600, top: '-25%', right: '-12%', opacity: 0.55 }} />
        <div className="mc-glow-teal" style={{ width: 600, height: 600, bottom: '-50%', left: '-10%' }} />

        <div className="founder-shell" style={{ position: 'relative', zIndex: 1 }}>
          <div
            className="founder-hero-grid mc-slide-up"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.15fr 1fr',
              gap: 64,
              alignItems: 'center',
            }}
          >
            {/* Left — eyebrow, H1, sub, CTAs */}
            <div className="founder-hero-text">
              <p className="founder-eyebrow">Founder story · Peter McShane</p>

              <h1 style={{ fontSize: 'clamp(40px, 5.4vw, 64px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.04, margin: '0 0 22px', color: '#0B1F3A' }}>
                Hi, I&rsquo;m Peter,<br />
                and I founded{' '}
                <span style={{ background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(232,116,43,0.32))' }}>
                  BellAveGo.
                </span>
              </h1>

              <p style={{ fontSize: 19, lineHeight: 1.55, color: '#3D5A62', margin: '0 0 30px', maxWidth: 520 }}>
                I built this company because of one Saturday afternoon in my friend Joe&rsquo;s garage. Four phone calls in under an hour. He answered one. That night I went home and started writing code.
              </p>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/pricing" className="mc-btn-orange">
                  Try BellAveGo
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
                <a href="tel:+16514677829" className="mc-btn-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  Hear the AI · (651) 467-7829
                </a>
              </div>
            </div>

            {/* Right — founder portrait. Drop /public/peter.png to fill;
                gradient + "P" initial shows through until then. The
                onError handler hides the broken-image icon during the
                pre-upload state so the placeholder looks intentional. */}
            <div className="founder-hero-photo">
              <div className="founder-portrait">
                <Image
                  src="/peter.png"
                  alt="Peter McShane, founder of BellAveGo"
                  fill
                  sizes="(max-width: 920px) 320px, 420px"
                  priority
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
              <p style={{ textAlign: 'center', margin: '14px 0 0', fontSize: 13, color: '#7AAAB2', fontWeight: 600, letterSpacing: '0.04em' }}>
                Peter McShane &middot; Founder, BellAveGo
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. ORIGIN STORY — centered prose + small inline photo pair ── */}
      <section style={{ position: 'relative', padding: '64px 0 80px' }}>
        <div className="founder-shell">
          <p className="founder-eyebrow" style={{ justifyContent: 'center', display: 'flex', maxWidth: 720, margin: '0 auto 18px' }}>
            The moment
          </p>

          <div className="founder-prose">
            <p>
              It was a Saturday and I was helping Joe finish a garage. His phone rang four times in under an hour. Two went to voicemail because his hands were buried in drywall. One he caught long enough to say <em>&ldquo;I&rsquo;ll call you back&rdquo;</em> &mdash; then forgot. The fourth he answered, but he had to stop working to schedule it. By the time we cleaned up he was three jobs lighter than he should&rsquo;ve been, and he wasn&rsquo;t sure which calls he&rsquo;d lost.
            </p>
            <p>
              I went home that night and started building. Every contractor I&rsquo;ve talked to since tells the same story. The math is brutal &mdash; at a <strong>$480 average ticket</strong> and a <strong>35% close rate</strong>, eight missed calls a week is roughly <strong style={{ color: '#C84B26' }}>$5,800 walking out the door every month.</strong>
            </p>
          </div>

          {/* Small inline photo pair — visual rest between paragraphs. */}
          <div className="founder-scene-pair">
            <div>
              <div className="founder-scene">
                <Image
                  src="/customer.png"
                  alt="Homeowner calling — BellAveGo's AI receptionist picks up and confirms the booking by text"
                  fill
                  sizes="(max-width: 920px) 50vw, 310px"
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <p className="founder-scene-caption">The homeowner gets answered.</p>
            </div>
            <div>
              <div className="founder-scene">
                <Image
                  src="/electrician.png"
                  alt="Contractor on the job — BellAveGo texts him the appointment so he never stops working"
                  fill
                  sizes="(max-width: 920px) 50vw, 310px"
                  style={{ objectFit: 'cover' }}
                />
              </div>
              <p className="founder-scene-caption">The contractor stays on the job.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. THESIS — centered prose + big pull quote ─────────────────── */}
      <section style={{ position: 'relative', padding: '40px 0 96px' }}>
        <div className="mc-glow-teal" style={{ width: 600, height: 600, top: '0', right: '-15%', opacity: 0.45 }} />
        <div className="founder-shell" style={{ position: 'relative', zIndex: 1 }}>
          <p className="founder-eyebrow" style={{ justifyContent: 'center', display: 'flex', maxWidth: 720, margin: '0 auto 18px' }}>
            Why we exist
          </p>

          <div className="founder-prose">
            <p>
              Most AI receptionist startups think the product is call answering. It isn&rsquo;t. Call answering is how we <em>collect the data.</em>
            </p>
            <p>
              The real product is what BellAveGo does with that data &mdash; finds the patterns, scores the opportunities, and tells you in dollars exactly where your business is leaking revenue. Every customer gets a free diagnostic report on day one. That&rsquo;s the part nobody else is building, and it&rsquo;s the only reason BellAveGo will exist in five years.
            </p>
          </div>

          <blockquote className="founder-pullquote">
            The receptionist is how we get the data. <span className="accent">The product is knowing &mdash; in dollars &mdash; exactly which call you should have answered first.</span>
          </blockquote>
        </div>
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
