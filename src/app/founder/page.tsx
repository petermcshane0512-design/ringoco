'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Founder page — minimal editorial layout.
 *
 *   1. NAV
 *   2. HERO ........ headline + founder photo (cinematic dark card
 *                    fallback if /peter.png isn't uploaded)
 *   3. SCENES ...... two product-context photos (homeowner + electrician)
 *   4. ESSAY ....... long-form founder narrative
 *   5. FOOTER
 *
 * No cards. No stat blocks. No manifesto rails. Just words, photos,
 * and a phone link at the end of the prose.
 */
export default function FounderPage() {
  const { isSignedIn } = useAuth()

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', overflowX: 'hidden' }}>

      {/* Nav */}
      <nav className="bavg-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(232,116,43,0.12)', position: 'sticky', top: 0, zIndex: 100 }}>
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

      <style>{`
        .fv3-shell { max-width: 1180px; margin: 0 auto; padding: 0 32px; position: relative; z-index: 1; }

        /* ── HERO ─────────────────────────────────────────────── */
        .fv3-hero {
          position: relative;
          padding: 96px 0 88px;
          overflow: hidden;
        }
        .fv3-hero::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(700px 500px at 85% 12%, rgba(255,157,90,0.22), transparent 65%),
            radial-gradient(900px 600px at 8% 90%, rgba(10,168,159,0.10), transparent 70%);
          pointer-events: none;
        }
        .fv3-hero-grid {
          display: grid;
          grid-template-columns: 1.22fr 1fr;
          gap: 72px;
          align-items: center;
        }
        .fv3-eyebrow {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 800;
          color: #C84B26;
          letter-spacing: 0.24em; text-transform: uppercase;
          margin: 0 0 22px;
        }
        .fv3-eyebrow::before {
          content: ''; width: 24px; height: 1px;
          background: currentColor;
          opacity: 0.55;
        }
        .fv3-h1 {
          font-size: clamp(46px, 6.2vw, 76px);
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1.02;
          margin: 0;
          color: #0B1F3A;
        }
        .fv3-h1 .accent {
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 2px 14px rgba(232,116,43,0.28));
        }

        /* Founder portrait card — light cream/sunset placeholder that
           blends with the cream page background. Two soft drifting
           glows give it life without going dark. When /peter.png is
           uploaded, the image covers everything via objectFit:cover. */
        .fv3-portrait {
          position: relative;
          aspect-ratio: 4/5;
          max-width: 440px;
          margin: 0 auto;
          border-radius: 26px;
          overflow: hidden;
          background:
            radial-gradient(circle at 30% 22%, rgba(255,217,168,0.85), transparent 60%),
            radial-gradient(circle at 75% 78%, rgba(255,233,200,0.55), transparent 65%),
            linear-gradient(160deg, #FFF1E2 0%, #FFE5C7 55%, #FFD9A8 100%);
          border: 1px solid rgba(232,116,43,0.22);
          box-shadow:
            0 30px 70px -20px rgba(11,31,58,0.18),
            0 0 0 1px rgba(232,116,43,0.08),
            inset 0 1px 0 rgba(255,255,255,0.65);
        }
        .fv3-portrait::before {
          content: '';
          position: absolute;
          top: -15%; left: -10%;
          width: 55%; height: 55%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,157,90,0.38), transparent 60%);
          filter: blur(38px);
          animation: fv3DriftA 11s ease-in-out infinite alternate;
          pointer-events: none;
        }
        .fv3-portrait::after {
          content: '';
          position: absolute;
          bottom: -18%; right: -12%;
          width: 60%; height: 60%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,116,43,0.22), transparent 65%);
          filter: blur(42px);
          animation: fv3DriftB 13s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes fv3DriftA {
          0%   { transform: translate(0,0) scale(1); opacity: 0.65; }
          100% { transform: translate(36px, 26px) scale(1.16); opacity: 0.92; }
        }
        @keyframes fv3DriftB {
          0%   { transform: translate(0,0) scale(1); opacity: 0.6; }
          100% { transform: translate(-26px, -32px) scale(1.14); opacity: 0.88; }
        }
        .fv3-portrait img {
          position: absolute; inset: 0;
          object-fit: cover;
          z-index: 2;
        }

        /* ── SCENES — two product-context photos, sized to align
           with the prose column below for visual cohesion ────── */
        .fv3-scenes {
          padding: 8px 0 0;
        }
        .fv3-scenes-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          max-width: 860px;
          margin: 0 auto;
        }
        .fv3-scene {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(232,116,43,0.18);
          box-shadow: 0 20px 48px -16px rgba(11,31,58,0.18);
          background: #FFE9D0;
        }

        /* ── ESSAY — long-form prose. Padding tightened so the
           scene photos read as a continuation of the essay, not a
           separate slab. ──────────────────────────────────────── */
        .fv3-essay {
          padding: 56px 0 104px;
        }
        .fv3-prose {
          max-width: 720px;
          margin: 0 auto;
          font-size: 19px;
          line-height: 1.78;
          color: #3D5A62;
          letter-spacing: -0.01em;
        }
        .fv3-prose p {
          margin: 0 0 28px;
        }
        .fv3-prose p:last-child { margin-bottom: 0; }
        .fv3-prose strong { color: #0B1F3A; }
        .fv3-prose em { font-style: italic; }
        .fv3-prose .lead::first-letter {
          float: left;
          font-size: 72px;
          line-height: 0.92;
          font-weight: 900;
          color: #C84B26;
          padding: 6px 14px 0 0;
          margin-top: 4px;
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .fv3-prose-end {
          margin-top: 44px;
          padding-top: 28px;
          border-top: 1px solid rgba(232,116,43,0.20);
          display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          font-size: 14px; color: #7AAAB2;
        }
        .fv3-prose-end a.try {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 20px;
          border-radius: 11px;
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          color: #fff;
          font-size: 14px; font-weight: 800;
          letter-spacing: -0.1px;
          text-decoration: none;
          box-shadow: 0 12px 28px rgba(232,116,43,0.40), inset 0 1px 0 rgba(255,255,255,0.25);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s;
        }
        .fv3-prose-end a.try:hover { transform: translateY(-2px) scale(1.02); filter: brightness(1.06); }
        .fv3-prose-end a.call {
          color: #C84B26; font-weight: 700; text-decoration: none;
          letter-spacing: -0.1px;
        }
        .fv3-prose-end a.call:hover { text-decoration: underline; }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 1024px) {
          .fv3-hero-grid { grid-template-columns: 1fr; gap: 56px; }
          .fv3-portrait { max-width: 400px; }
        }
        @media (max-width: 820px) {
          .fv3-shell { padding: 0 22px; }
          .fv3-hero { padding: 56px 0 56px; }
          .fv3-h1 { font-size: clamp(40px, 10vw, 56px); }
          .fv3-portrait { max-width: 320px; }

          .fv3-scenes { padding: 20px 0 12px; }
          .fv3-scenes-grid { gap: 14px; }

          .fv3-essay { padding: 48px 0 72px; }
          .fv3-prose { font-size: 17px; line-height: 1.72; }
          .fv3-prose p { margin-bottom: 22px; }
          .fv3-prose .lead::first-letter { font-size: 56px; padding-right: 10px; }
        }
      `}</style>

      {/* ═════════ HERO ═════════ */}
      <section className="fv3-hero">
        <div className="fv3-shell">
          <div className="fv3-hero-grid">

            <div>
              <p className="fv3-eyebrow">Founder · Peter McShane</p>
              <h1 className="fv3-h1">
                Hi, I&rsquo;m Peter,<br />
                and I founded{' '}
                <span className="accent">BellAveGo.</span>
              </h1>
            </div>

            <div>
              <div className="fv3-portrait">
                <Image
                  src="/peter.png"
                  alt="Peter McShane, founder of BellAveGo"
                  fill
                  sizes="(max-width: 1024px) 400px, 460px"
                  priority
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ═════════ TWO SCENE PHOTOS ═════════ */}
      <section className="fv3-scenes">
        <div className="fv3-shell">
          <div className="fv3-scenes-grid">
            <div className="fv3-scene">
              <Image
                src="/customer.png"
                alt="A homeowner calls — BellAveGo's AI answers, captures the job, and texts the contractor"
                fill
                sizes="(max-width: 820px) 50vw, 560px"
                style={{ objectFit: 'cover' }}
              />
            </div>
            <div className="fv3-scene">
              <Image
                src="/electrician.png"
                alt="An electrician on the job gets a text from BellAveGo with a new appointment — never has to stop working"
                fill
                sizes="(max-width: 820px) 50vw, 560px"
                style={{ objectFit: 'cover' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═════════ ESSAY ═════════ */}
      <section className="fv3-essay">
        <div className="fv3-shell">
          <div className="fv3-prose">
            <p className="lead">
              I didn&rsquo;t start BellAveGo because AI was trending &mdash; I started it because I watched hardworking people lose money while doing the actual work. One afternoon, I was helping my friend Joe with a garage project when his phone rang four different times in under an hour. He ignored two calls because his hands were full, answered one just to say <em>&ldquo;I&rsquo;ll call you back,&rdquo;</em> and had to completely stop working just to schedule an appointment. Standing there watching it happen in real time, it hit me: thousands of home-service businesses are losing revenue every single day simply because they&rsquo;re too busy working to manage everything happening around them.
            </p>
            <p>
              That&rsquo;s why I built BellAveGo &mdash; an AI receptionist built specifically for home-service teams of one to fifteen people. It answers the calls you can&rsquo;t get to, books appointments, captures leads, and quietly does the front-office work so you can stay on the job. But <strong>the receptionist is only half of what BellAveGo does.</strong>
            </p>
            <p>
              The other half is what makes BellAveGo different from anything else on the market. While the AI handles your phones, our team is actively scanning your service area for opportunities and threats you&rsquo;d never see on your own &mdash; new construction permits pulled in your zip code, neighborhoods with aging HVAC units coming due for replacement, competitors raising prices or going quiet, seasonal demand spikes hitting two weeks early, storm damage clusters, commercial buildings switching providers. Every signal gets turned into a plain-English report with a list of leads to chase and threats to defend against. <strong>Not a dashboard you have to interpret. A strategy you can run on Monday morning.</strong>
            </p>
            <p>
              That&rsquo;s the part nobody else is doing. Plenty of companies will sell you an AI that answers the phone. We&rsquo;re the only ones pairing it with the kind of market intelligence and human strategy work that used to cost five figures a month from a real consulting firm &mdash; built into a product priced for a small crew, not a corporation.
            </p>
            <p>
              BellAveGo was never built to replace hardworking people. It was built to give smaller teams the kind of automation and intelligence that used to only exist inside large companies &mdash; so the next time the phone rings while you&rsquo;re under a sink, you don&rsquo;t lose the job, and you actually know exactly where the next ten are coming from.
            </p>

            <div className="fv3-prose-end">
              <Link href="/pricing" className="try">
                Try BellAveGo
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
              <span>or hear the AI live &middot; <a href="tel:+16514677829" className="call">(651) 467-7829</a></span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 40px', background: '#FFF7EE', borderTop: '1px solid rgba(232,116,43,0.18)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>
          BellAveGo &middot; Built by Peter McShane &middot; <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
