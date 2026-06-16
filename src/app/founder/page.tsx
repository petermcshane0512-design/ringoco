'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'
import { LEADS_PER_WEEK, LEADS_PER_MONTH } from '@/lib/offer'

/**
 * Founder page — magazine single-article layout.
 *
 * Old layout w/ floated portrait + prose-wrap restored 2026-06-09 per
 * Peter request. Story rewritten for leads-only pivot: friend doing
 * handyman work struggling to find homeowners in his area → built
 * BellAveGo to surface those homeowners automatically.
 */
export default function FounderPage() {
  const { isSignedIn } = useAuth()

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', overflowX: 'hidden' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px clamp(16px, 4vw, 48px)',
        background: 'rgba(255,248,240,0.92)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(232,116,43,0.16)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={260} height={80} style={{ objectFit: 'contain' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {isSignedIn && <Link href="/dashboard" style={navCTA}>Dashboard →</Link>}
          <Link href="/" style={navLink}>Home</Link>
          <Link href="/pricing" style={navLink}>Pricing</Link>
          {!isSignedIn && (
            <>
              <Link href="/sign-in" style={navLink}>Sign in</Link>
              <Link href="/start" style={navCTA}>First month free →</Link>
            </>
          )}
        </div>
      </nav>

      <style>{`
        .fv4-article {
          max-width: 940px;
          margin: 0 auto;
          padding: 56px 32px 72px;
          position: relative;
          animation: fv4Enter 800ms cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes fv4Enter {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fv4Sheen {
          0%, 60% { transform: translateX(-130%) skewX(-18deg); }
          100%    { transform: translateX(230%) skewX(-18deg); }
        }
        .fv4-end a.try {
          position: relative;
          overflow: hidden;
        }
        .fv4-end a.try::after {
          content: '';
          position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.35), transparent);
          animation: fv4Sheen 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .fv4-article { animation: none; }
          .fv4-end a.try::after { animation: none; }
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
        .fv4-portrait {
          float: right;
          width: 300px;
          aspect-ratio: 1/1;
          margin: 4px 0 18px 32px;
          position: relative;
          border-radius: 50%;
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
          transition: transform 0.45s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.45s ease, border-color 0.45s ease, filter 0.45s ease;
        }
        .fv4-portrait:hover {
          transform: scale(1.035) translateY(-5px);
          border-color: rgba(232,116,43,0.42);
          box-shadow: 0 38px 72px -18px rgba(11,31,58,0.26), 0 0 0 1px rgba(232,116,43,0.20), 0 0 80px -10px rgba(232,116,43,0.35), inset 0 1px 0 rgba(255,255,255,0.75);
          filter: brightness(1.04);
        }
        .fv4-portrait::before {
          content: '';
          position: absolute; top: -12%; left: -10%;
          width: 55%; height: 55%; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,157,90,0.38), transparent 60%);
          filter: blur(34px);
          animation: fv4DriftA 11s ease-in-out infinite alternate;
          pointer-events: none;
        }
        .fv4-portrait::after {
          content: '';
          position: absolute; bottom: -16%; right: -12%;
          width: 60%; height: 60%; border-radius: 50%;
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
        .fv4-prose::after { content: ''; display: block; clear: both; }

        .fv4-end {
          margin-top: 32px;
          padding-top: 22px;
          border-top: 1px solid rgba(232,116,43,0.20);
          display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          font-size: 13.5px; color: #7AAAB2;
        }
        .fv4-end a.try {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 20px;
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

        @media (max-width: 720px) {
          .fv4-article { padding: 40px 22px 56px; }
          .fv4-h1 { font-size: clamp(34px, 8.5vw, 44px); margin-bottom: 24px; }
          .fv4-portrait {
            float: none;
            width: 100%;
            max-width: 280px;
            margin: 0 auto 28px;
            display: block;
          }
          .fv4-prose { font-size: 16.5px; line-height: 1.68; }
          .fv4-prose p { margin-bottom: 18px; }
        }
      `}</style>

      <article className="fv4-article">
        <p className="fv4-eyebrow">Founder &middot; Peter McShane</p>
        <h1 className="fv4-h1">
          Hi, I&rsquo;m Peter, and I founded{' '}
          <span className="accent">BellAveGo.</span>
        </h1>

        <div className="fv4-prose">
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
            I started BellAveGo because my buddy &mdash; a solo handyman &mdash; was getting <strong>one job a day</strong>. Twenty hours a week scrolling Nextdoor, posting in Facebook groups, paying $80 for shared HomeAdvisor leads. Great at the work. Broke finding it.
          </p>
          <p>
            So we built an AI that scans his whole service area every night &mdash; and hands him <strong>{LEADS_PER_WEEK} real homeowners a week</strong> ({LEADS_PER_MONTH}/month) who actually need the work, with a verified phone and a ready-to-send intro. Exclusive to him, never shared like HomeAdvisor.
          </p>
          <p>
            Here&rsquo;s the part that makes it work: we <strong>prioritize the homeowners who genuinely have to get the job done</strong> &mdash; the ones the city has flagged to repair their property. They&rsquo;re not &ldquo;maybe interested.&rdquo; They&rsquo;re already looking for someone like you. So your calls land on people who want to hear from you, not strangers you&rsquo;re bugging. The franchise shops pay five-figure budgets for worse leads. You pay $197 — and your first month is free.
          </p>
          <p>
            Behind the scenes &mdash; <strong>four software engineers</strong>. Small on purpose. My buddy went from one job a day to fully booked inside a month. That&rsquo;s the whole reason this exists.
          </p>

          <div className="fv4-end">
            <Link href="/start" className="try">
              Try BellAveGo &mdash; first month free
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <a className="call" href="tel:+17737109565">or text us: (773) 710-9565</a>
          </div>
        </div>
      </article>

      <footer style={{ padding: '28px 40px', background: '#FFF7EE', borderTop: '1px solid rgba(232,116,43,0.18)', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>
          © 2026 BellAveGo LLC &middot; Built by Peter McShane &middot; <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#7AAAB2' }}>
          <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</Link>
          {' · '}
          <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</Link>
        </p>
      </footer>
    </main>
  )
}

const navLink: React.CSSProperties = {
  color: '#4A6670', textDecoration: 'none', fontWeight: 700, fontSize: 14,
}
const navCTA: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 13,
  boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
}
