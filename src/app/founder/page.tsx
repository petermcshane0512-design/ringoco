'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Founder page — single-article layout.
 *
 * No separate hero slab. The headline + essay are one continuous
 * article, with the founder portrait floated right inside the prose
 * so the words wrap around it (magazine-style). Two scene photos
 * sit below the article, sized to align with the prose column.
 * Total page length: ~1.5 viewport heights.
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
        .fv4-article {
          max-width: 940px;
          margin: 0 auto;
          padding: 56px 32px 72px;
          position: relative;
        }
        .fv4-eyebrow {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 800;
          color: #C84B26;
          letter-spacing: 0.24em; text-transform: uppercase;
          margin: 0 0 18px;
        }
        .fv4-eyebrow::before {
          content: ''; width: 24px; height: 1px;
          background: currentColor;
          opacity: 0.55;
        }
        .fv4-h1 {
          font-size: clamp(34px, 4.6vw, 56px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 1.03;
          color: #0B1F3A;
          margin: 0 0 32px;
          max-width: 720px;
        }
        .fv4-h1 .accent {
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 2px 12px rgba(232,116,43,0.22));
        }

        /* Floated portrait — sits inside the prose flow on desktop so
           paragraphs wrap around it. Drops to full-width centered
           above the prose on mobile. */
        .fv4-portrait {
          float: right;
          width: 300px;
          aspect-ratio: 4/5;
          margin: 4px 0 18px 32px;
          position: relative;
          border-radius: 22px;
          overflow: hidden;
          background:
            radial-gradient(circle at 28% 22%, rgba(255,217,168,0.85), transparent 60%),
            radial-gradient(circle at 76% 78%, rgba(255,233,200,0.55), transparent 65%),
            linear-gradient(160deg, #FFF1E2 0%, #FFE5C7 55%, #FFD9A8 100%);
          border: 1px solid rgba(232,116,43,0.22);
          box-shadow:
            0 24px 50px -18px rgba(11,31,58,0.18),
            0 0 0 1px rgba(232,116,43,0.08),
            inset 0 1px 0 rgba(255,255,255,0.65);
        }
        .fv4-portrait::before {
          content: '';
          position: absolute;
          top: -12%; left: -10%;
          width: 55%; height: 55%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,157,90,0.38), transparent 60%);
          filter: blur(34px);
          animation: fv4DriftA 11s ease-in-out infinite alternate;
          pointer-events: none;
        }
        .fv4-portrait::after {
          content: '';
          position: absolute;
          bottom: -16%; right: -12%;
          width: 60%; height: 60%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,116,43,0.22), transparent 65%);
          filter: blur(38px);
          animation: fv4DriftB 13s ease-in-out infinite alternate;
          pointer-events: none;
        }
        @keyframes fv4DriftA {
          0%   { transform: translate(0,0) scale(1); opacity: 0.65; }
          100% { transform: translate(28px, 22px) scale(1.14); opacity: 0.92; }
        }
        @keyframes fv4DriftB {
          0%   { transform: translate(0,0) scale(1); opacity: 0.6; }
          100% { transform: translate(-22px, -28px) scale(1.12); opacity: 0.88; }
        }
        .fv4-portrait img {
          position: absolute; inset: 0;
          object-fit: cover;
          z-index: 2;
        }

        .fv4-prose {
          font-size: 17px;
          line-height: 1.7;
          color: #3D5A62;
          letter-spacing: -0.005em;
        }
        .fv4-prose p { margin: 0 0 20px; }
        .fv4-prose p:last-of-type { margin-bottom: 0; }
        .fv4-prose strong { color: #0B1F3A; font-weight: 700; }
        .fv4-prose em { font-style: italic; }

        /* Clearfix so the article container wraps the floated portrait */
        .fv4-prose::after {
          content: ''; display: block; clear: both;
        }

        /* Inline end-CTA — sits at the bottom of the last paragraph */
        .fv4-end {
          margin-top: 32px;
          padding-top: 22px;
          border-top: 1px solid rgba(232,116,43,0.20);
          display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          font-size: 13.5px; color: #7AAAB2;
        }
        .fv4-end a.try {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 18px;
          border-radius: 11px;
          background: linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%);
          color: #fff;
          font-size: 13.5px; font-weight: 800;
          letter-spacing: -0.1px;
          text-decoration: none;
          box-shadow: 0 10px 24px rgba(232,116,43,0.36), inset 0 1px 0 rgba(255,255,255,0.25);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s;
        }
        .fv4-end a.try:hover { transform: translateY(-2px) scale(1.02); filter: brightness(1.06); }
        .fv4-end a.call { color: #C84B26; font-weight: 700; text-decoration: none; }
        .fv4-end a.call:hover { text-decoration: underline; }

        /* Scene photos — sized to match the prose column for visual
           cohesion. Aspect 4:3 keeps them moderate. */
        .fv4-scenes {
          max-width: 860px;
          margin: 0 auto;
          padding: 8px 32px 72px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }
        .fv4-scene {
          position: relative;
          aspect-ratio: 4/3;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(232,116,43,0.18);
          box-shadow: 0 18px 40px -16px rgba(11,31,58,0.16);
          background: #FFE9D0;
        }

        @media (max-width: 720px) {
          .fv4-article { padding: 40px 22px 56px; }
          .fv4-h1 { font-size: clamp(34px, 8.5vw, 44px); margin-bottom: 24px; }

          /* On mobile: portrait stacks above the prose at a contained
             width — no float, no wrap. */
          .fv4-portrait {
            float: none;
            width: 100%;
            max-width: 280px;
            margin: 0 auto 28px;
            display: block;
          }

          .fv4-prose { font-size: 16.5px; line-height: 1.68; }
          .fv4-prose p { margin-bottom: 18px; }

          .fv4-scenes { padding: 4px 22px 56px; gap: 12px; }
          .fv4-scene { border-radius: 12px; }
        }
      `}</style>

      {/* ═════════ ARTICLE ═════════ */}
      <article className="fv4-article">

        <p className="fv4-eyebrow">Founder &middot; Peter McShane</p>
        <h1 className="fv4-h1">
          Hi, I&rsquo;m Peter, and I founded{' '}
          <span className="accent">BellAveGo.</span>
        </h1>

        <div className="fv4-prose">
          {/* Floated portrait sits inside the prose so paragraphs
              wrap around it on desktop. On mobile the float drops
              via the @media block above. */}
          <div className="fv4-portrait">
            <Image
              src="/peter.png"
              alt="Peter McShane, founder of BellAveGo"
              fill
              sizes="(max-width: 720px) 280px, 300px"
              priority
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          </div>

          <p>
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

          <div className="fv4-end">
            <Link href="/pricing" className="try">
              Try BellAveGo
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <span>or hear the AI live &middot; <a href="tel:+16514677829" className="call">(651) 467-7829</a></span>
          </div>
        </div>
      </article>

      {/* ═════════ SCENE PHOTOS ═════════ */}
      <section className="fv4-scenes">
        <div className="fv4-scene">
          <Image
            src="/customer.png"
            alt="A homeowner calls — BellAveGo's AI answers, captures the job, and texts the contractor"
            fill
            sizes="(max-width: 720px) 50vw, 410px"
            style={{ objectFit: 'cover' }}
          />
        </div>
        <div className="fv4-scene">
          <Image
            src="/electrician.png"
            alt="An electrician on the job gets a text from BellAveGo with a new appointment — never has to stop working"
            fill
            sizes="(max-width: 720px) 50vw, 410px"
            style={{ objectFit: 'cover' }}
          />
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '28px 40px', background: '#FFF7EE', borderTop: '1px solid rgba(232,116,43,0.18)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>
          BellAveGo &middot; Built by Peter McShane &middot; <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
      </footer>
    </main>
  )
}
