'use client'
import Link from 'next/link'

/**
 * Founder story section — video-ready placeholder.
 *
 * To wire your Loom / YouTube embed when ready:
 *   1. Drop the video file or embed URL in here
 *   2. Replace the <VideoPlaceholder /> with an <iframe> or <video>
 *   3. The card already has the right dimensions + glow + click target
 */

export default function FounderSection() {
  return (
    <section className="fs-root">
      <style>{`
        .fs-root {
          position: relative;
          padding: 64px 32px 72px;
          background: linear-gradient(180deg, #F2F9F5 0%, #EBF7F3 100%);
          border-bottom: 1px solid rgba(10,168,159,0.10);
          overflow: hidden;
        }
        .fs-root::before {
          content: '';
          position: absolute; top: -30%; right: -10%;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(232,116,43,0.10) 0%, transparent 65%);
          pointer-events: none;
        }
        .fs-root::after {
          content: '';
          position: absolute; bottom: -40%; left: -10%;
          width: 700px; height: 700px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(10,168,159,0.08) 0%, transparent 65%);
          pointer-events: none;
        }
        .fs-wrap {
          position: relative; z-index: 1;
          max-width: 1080px; margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1fr);
          gap: 48px;
          align-items: center;
        }
        @media (max-width: 920px) { .fs-wrap { grid-template-columns: 1fr; gap: 32px; } }

        .fs-text { min-width: 0; }
        .fs-eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 5px 13px;
          border-radius: 99px;
          background: rgba(232,116,43,0.10);
          border: 1px solid rgba(232,116,43,0.32);
          font-size: 10.5px; font-weight: 800;
          color: #C84B26;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }
        .fs-eyebrow::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          box-shadow: 0 0 8px rgba(232,116,43,0.6);
        }
        .fs-h2 {
          font-size: clamp(26px, 3.4vw, 40px);
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.04;
          margin: 0 0 14px;
          color: #0B1F3A;
        }
        .fs-h2 .accent {
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .fs-body p {
          font-size: 14.5px; line-height: 1.65; color: #3D5A62;
          margin: 0 0 12px;
        }
        .fs-body p:last-child { margin-bottom: 0; }
        .fs-sig {
          display: flex; align-items: center; gap: 12px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid rgba(10,168,159,0.14);
        }
        .fs-sig-avatar {
          width: 44px; height: 44px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0AA89F, #0D8F87);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 900;
          box-shadow: 0 6px 14px rgba(10,168,159,0.32);
          flex-shrink: 0;
        }
        .fs-sig-name { font-size: 14px; font-weight: 800; color: #0B1F3A; letter-spacing: -0.2px; }
        .fs-sig-role { font-size: 11.5px; color: #7AAAB2; font-weight: 600; margin-top: 1px; }

        .fs-cta-row {
          display: flex; align-items: center; gap: 10px;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        .fs-cta {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 20px;
          border-radius: 11px;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          color: #0B1F3A;
          font-size: 13px; font-weight: 900;
          letter-spacing: -0.1px;
          text-decoration: none;
          border: 1px solid rgba(255,217,168,0.55);
          box-shadow: 0 10px 26px rgba(232,116,43,0.4);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease;
        }
        .fs-cta:hover { transform: translateY(-2px) scale(1.03); filter: brightness(1.05); }
        .fs-cta-ghost {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 11px 16px;
          border-radius: 11px;
          background: rgba(255,255,255,0.6);
          border: 1px solid rgba(10,168,159,0.22);
          color: #0AA89F;
          font-size: 12.5px; font-weight: 700;
          text-decoration: none;
        }
        .fs-cta-ghost:hover { background: rgba(255,255,255,0.85); }

        /* Video card */
        .fs-video {
          position: relative;
          aspect-ratio: 16/10;
          border-radius: 18px;
          overflow: hidden;
          background:
            radial-gradient(circle at 30% 30%, rgba(255,157,90,0.32), transparent 60%),
            linear-gradient(135deg, #050E1F 0%, #0B1F3A 50%, #112C4A 100%);
          border: 1px solid rgba(232,116,43,0.38);
          box-shadow:
            0 30px 70px rgba(0,0,0,0.32),
            0 0 0 1px rgba(94,234,212,0.10),
            0 0 80px rgba(232,116,43,0.22);
          cursor: pointer;
          transition: transform 0.32s ease, box-shadow 0.32s ease;
        }
        .fs-video:hover { transform: translateY(-3px); box-shadow: 0 40px 90px rgba(0,0,0,0.4), 0 0 0 1px rgba(94,234,212,0.20), 0 0 110px rgba(232,116,43,0.32); }
        .fs-video-content {
          position: absolute; inset: 0;
          display: flex; flex-direction: column;
          padding: 22px;
        }
        .fs-video-meta {
          display: flex; align-items: center; justify-content: space-between;
        }
        .fs-video-tag {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 11px;
          border-radius: 99px;
          background: rgba(94,234,212,0.14);
          border: 1px solid rgba(94,234,212,0.32);
          font-size: 10px; font-weight: 800;
          color: #5EEAD4;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .fs-video-tag::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: #E8742B;
        }
        .fs-video-duration {
          font-size: 11px; font-weight: 700;
          color: rgba(255,255,255,0.65);
          letter-spacing: 0.04em;
          font-variant-numeric: tabular-nums;
        }
        .fs-video-play {
          margin: auto;
          width: 84px; height: 84px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%);
          border: 4px solid rgba(255,255,255,0.92);
          display: flex; align-items: center; justify-content: center;
          color: #0B1F3A;
          box-shadow:
            0 18px 40px rgba(232,116,43,0.55),
            0 0 0 0 rgba(255,217,168,0.5);
          animation: fsPlayPulse 2.4s ease-in-out infinite;
        }
        @keyframes fsPlayPulse {
          0%, 100% { box-shadow: 0 18px 40px rgba(232,116,43,0.55), 0 0 0 0 rgba(255,217,168,0.6); }
          50%      { box-shadow: 0 22px 50px rgba(232,116,43,0.7), 0 0 0 18px rgba(255,217,168,0); }
        }
        .fs-video-foot {
          text-align: center;
          color: #fff;
        }
        .fs-video-title {
          font-size: 15px; font-weight: 800;
          letter-spacing: -0.2px;
          margin: 0 0 4px;
        }
        .fs-video-sub {
          font-size: 11.5px; font-weight: 600;
          color: rgba(255,255,255,0.62);
        }
      `}</style>

      <div className="fs-wrap">
        <div className="fs-text">
          <span className="fs-eyebrow">Built by a founder, not a fund</span>
          <h2 className="fs-h2">Hi — I&apos;m Peter.<br /><span className="accent">Here&apos;s why I built BellAveGo.</span></h2>
          <div className="fs-body">
            <p>
              I watched too many home-service owners lose jobs to voicemail while they were on a ladder, in a crawlspace, or driving between calls. The fix existed — but it was either dumb (a generic call service) or insanely expensive (a $400/mo agency).
            </p>
            <p>
              BellAveGo is the version I wish my contractor friends had. Answers like a real receptionist. Texts you the lead. Pays for itself in one booked job. No contracts.
            </p>
            <p>
              If it doesn&apos;t earn its keep in the first 30 days, you get a full refund and we part on good terms. That&apos;s the deal.
            </p>
          </div>

          <div className="fs-cta-row">
            <Link href="/pricing" className="fs-cta">
              Try BellAveGo
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
            <a href="mailto:peter@bellavego.com" className="fs-cta-ghost">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Email me directly
            </a>
          </div>

          <div className="fs-sig">
            <div className="fs-sig-avatar">P</div>
            <div>
              <div className="fs-sig-name">Peter McShane</div>
              <div className="fs-sig-role">Founder · BellAveGo · Minneapolis</div>
            </div>
          </div>
        </div>

        <div className="fs-video" role="button" tabIndex={0} aria-label="Founder video — coming soon">
          <div className="fs-video-content">
            <div className="fs-video-meta">
              <span className="fs-video-tag">Founder story</span>
              <span className="fs-video-duration">60 seconds</span>
            </div>
            <div className="fs-video-play">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <div className="fs-video-foot">
              <div className="fs-video-title">Why I built BellAveGo</div>
              <div className="fs-video-sub">Watch the 60-second story · video dropping soon</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
