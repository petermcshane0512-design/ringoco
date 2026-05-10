'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import DashboardPreview from '@/components/DashboardPreview'
import HeroShowcase from '@/components/HeroShowcase'
import { SAMPLE_REPORT } from '@/lib/consultingReport'

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const [logoHovered, setLogoHovered] = useState(false)

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={665}
            height={210}
            style={{
              objectFit: 'contain',
              marginTop: 10,
              transform: logoHovered ? 'scale(1.08)' : 'scale(1)',
              filter: logoHovered ? 'drop-shadow(0 0 14px rgba(24,175,168,0.55))' : 'none',
              transition: 'transform 0.25s ease, filter 0.25s ease',
            }}
          />
        </a>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/pricing" style={{ padding: '10px 16px', textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 600 }}>
            Pricing
          </Link>
          {isSignedIn ? (
            <>
              <SignOutButton redirectUrl="/">
                <button style={{ padding: '8px 18px', border: '1.5px solid #DCE9E2', borderRadius: 8, background: 'transparent', color: '#4A6670', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Sign out
                </button>
              </SignOutButton>
              <Link href="/dashboard" className="dash-pulse" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" style={{ padding: '10px 22px', border: '1.5px solid #DCE9E2', borderRadius: 8, textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 500 }}>
                Sign in
              </Link>
              <Link href="/pricing" className="cta-pulse" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 72, position: 'relative' }}>
        <style>{`
          @keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes ctaGlow {
            0%, 100% { box-shadow: 0 4px 18px rgba(34,197,94,0.42), 0 0 30px rgba(34,197,94,0.24); }
            50%      { box-shadow: 0 6px 32px rgba(34,197,94,0.65), 0 0 56px rgba(34,197,94,0.42); }
          }
          .cta-pulse { animation: ctaGlow 2.5s ease-in-out infinite; transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), filter 0.28s ease; }
          .cta-pulse:hover { animation-play-state: paused; transform: scale(1.06) translateY(-3px); box-shadow: 0 10px 44px rgba(34,197,94,0.72), 0 0 70px rgba(34,197,94,0.52); filter: brightness(1.12); }
          @keyframes dashGlow {
            0%, 100% { box-shadow: 0 4px 16px rgba(10,168,159,0.45), 0 0 28px rgba(10,168,159,0.28); }
            50%      { box-shadow: 0 4px 26px rgba(10,168,159,0.68), 0 0 48px rgba(10,168,159,0.42); }
          }
          .dash-pulse { animation: dashGlow 2.5s ease-in-out infinite; transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), filter 0.28s ease; }
          .dash-pulse:hover { animation-play-state: paused; transform: scale(1.06) translateY(-2px); box-shadow: 0 8px 36px rgba(10,168,159,0.75), 0 0 60px rgba(10,168,159,0.5); filter: brightness(1.12); }
          @keyframes heroCtaGlow {
            0%, 100% { box-shadow: 0 8px 28px rgba(16,185,129,0.45), 0 0 0 0 rgba(34,197,94,0.55), inset 0 1px 0 rgba(255,255,255,0.32); }
            50%      { box-shadow: 0 14px 44px rgba(16,185,129,0.65), 0 0 0 8px rgba(34,197,94,0), inset 0 1px 0 rgba(255,255,255,0.32); }
          }
          @keyframes pulseDot {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%      { transform: scale(1.6); opacity: 0.45; }
          }
          @keyframes cardIn {
            0%   { opacity: 0; transform: translateX(28px) scale(0.96); }
            100% { opacity: 1; transform: translateX(0) scale(1); }
          }
          @keyframes shimmer {
            0%   { background-position: -180% 0; }
            100% { background-position: 180% 0; }
          }
          .hero-cta {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            padding: 14px 26px;
            border-radius: 12px;
            background: linear-gradient(135deg, #22C55E 0%, #16A34A 60%, #15803D 100%);
            color: #fff;
            font-weight: 800;
            font-size: clamp(13px, 1.05vw, 16px);
            letter-spacing: -0.2px;
            text-decoration: none;
            border: 1px solid rgba(255,255,255,0.18);
            cursor: pointer;
            overflow: hidden;
            animation: heroCtaGlow 2.6s ease-in-out infinite;
            transition: transform 0.24s cubic-bezier(0.34,1.56,0.64,1), filter 0.24s ease;
          }
          .hero-cta::before {
            content: '';
            position: absolute; inset: 0;
            background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.32) 50%, transparent 70%);
            background-size: 220% 100%;
            animation: shimmer 3.4s linear infinite;
            pointer-events: none;
          }
          .hero-cta:hover {
            transform: translateY(-2px) scale(1.04);
            filter: brightness(1.10);
          }
          .hero-cta .arrow {
            transition: transform 0.24s ease;
          }
          .hero-cta:hover .arrow { transform: translateX(4px); }

          .nav-cta {
            position: relative;
            padding: 10px 22px;
            border-radius: 10px;
            background: linear-gradient(135deg, #22C55E 0%, #15A34A 100%);
            color: #fff;
            font-size: 14px;
            font-weight: 800;
            text-decoration: none;
            border: 1px solid rgba(255,255,255,0.16);
            box-shadow: 0 4px 18px rgba(34,197,94,0.42);
            transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease, filter 0.22s ease;
          }
          .nav-cta:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 8px 30px rgba(34,197,94,0.6); filter: brightness(1.08); }

          .nav-dash {
            position: relative;
            padding: 10px 22px;
            border-radius: 10px;
            background: linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%);
            color: #fff;
            font-size: 14px;
            font-weight: 800;
            text-decoration: none;
            border: 1px solid rgba(255,255,255,0.16);
            box-shadow: 0 4px 16px rgba(10,168,159,0.45);
            transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease, filter 0.22s ease;
          }
          .nav-dash:hover { transform: translateY(-2px) scale(1.04); box-shadow: 0 8px 30px rgba(10,168,159,0.65); filter: brightness(1.08); }

          .notif-card {
            position: relative;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 14px 14px 13px;
            border-radius: 16px;
            background: rgba(255,255,255,0.94);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255,255,255,0.6);
            box-shadow: 0 10px 32px rgba(11,31,58,0.22), 0 2px 6px rgba(11,31,58,0.10), inset 0 1px 0 rgba(255,255,255,0.7);
            opacity: 0;
            animation: cardIn 0.55s cubic-bezier(0.22,1,0.36,1) forwards;
            transition: transform 0.22s ease, box-shadow 0.22s ease;
          }
          .notif-card:hover {
            transform: translateY(-2px) scale(1.015);
            box-shadow: 0 18px 44px rgba(11,31,58,0.28), 0 4px 10px rgba(11,31,58,0.12), inset 0 1px 0 rgba(255,255,255,0.7);
          }
          .notif-icon {
            flex-shrink: 0;
            width: 38px; height: 38px;
            border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            color: #fff;
          }
          .notif-body { flex: 1; min-width: 0; }
          .notif-title { font-weight: 800; font-size: 13px; color: #0AA89F; letter-spacing: -0.2px; line-height: 1.25; margin: 0 0 3px; }
          .notif-sub   { font-size: 11.5px; color: #4A6670; line-height: 1.4; margin: 0; }
          .notif-time  { font-size: 10.5px; color: #7AAAB2; font-weight: 600; flex-shrink: 0; padding-top: 2px; }
          .notif-arrow { display: flex; justify-content: center; align-items: center; height: 14px; flex-shrink: 0; }
          .pulse-dot {
            display: inline-block; width: 7px; height: 7px; border-radius: 50%;
            background: #EF4444; margin-right: 6px;
            box-shadow: 0 0 0 0 rgba(239,68,68,0.6);
            animation: pulseDot 1.6s ease-in-out infinite;
          }
        `}</style>
        <div className="hero-wrap">
          <style>{`
            .hero-wrap {
              position: relative;
              width: 100%;
              min-height: 640px;
              background:
                radial-gradient(1100px 600px at 78% 35%, rgba(10,168,159,0.30), transparent 65%),
                radial-gradient(900px 700px at 12% 80%, rgba(94,234,212,0.18), transparent 70%),
                linear-gradient(150deg, #050E1F 0%, #0B1F3A 45%, #0A2E45 100%);
              overflow: hidden;
              line-height: normal;
            }
            .hero-wrap::before {
              content: '';
              position: absolute; inset: 0;
              background-image:
                linear-gradient(rgba(94,234,212,0.045) 1px, transparent 1px),
                linear-gradient(90deg, rgba(94,234,212,0.045) 1px, transparent 1px);
              background-size: 56px 56px;
              mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 60%, transparent 100%);
              -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 60%, transparent 100%);
              pointer-events: none;
            }
            .hero-wrap::after {
              content: '';
              position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
              background: linear-gradient(90deg, transparent, rgba(94,234,212,0.45), transparent);
              pointer-events: none;
            }
            .hero-blob {
              position: absolute;
              width: 520px; height: 520px;
              border-radius: 50%;
              filter: blur(110px);
              pointer-events: none;
              opacity: 0.55;
            }
            .hero-blob.b1 {
              top: -120px; right: 20%;
              background: radial-gradient(circle, #0AA89F 0%, transparent 70%);
              animation: hsBlobDrift 12s ease-in-out infinite alternate;
            }
            .hero-blob.b2 {
              bottom: -160px; left: -80px;
              width: 600px; height: 600px;
              background: radial-gradient(circle, #5EEAD4 0%, transparent 70%);
              opacity: 0.32;
              animation: hsBlobDrift 14s ease-in-out infinite alternate-reverse;
            }
            @keyframes hsBlobDrift {
              0%   { transform: translate(0, 0) scale(1); }
              100% { transform: translate(40px, -30px) scale(1.08); }
            }

            .hero-grid {
              position: relative;
              z-index: 2;
              max-width: 1340px;
              margin: 0 auto;
              padding: 64px 48px 72px;
              display: grid;
              grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr);
              gap: 36px;
              align-items: center;
            }

            .hero-eyebrow {
              display: inline-flex; align-items: center; gap: 8px;
              padding: 6px 13px;
              border-radius: 100px;
              border: 1px solid rgba(94,234,212,0.28);
              background: rgba(94,234,212,0.08);
              color: #5EEAD4;
              font-size: 11.5px;
              font-weight: 700;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              margin-bottom: 20px;
            }
            .hero-eyebrow::before {
              content: ''; width: 6px; height: 6px; border-radius: 50%;
              background: #22C55E;
              box-shadow: 0 0 8px rgba(34,197,94,0.7);
              animation: heroBlink 1.6s infinite;
            }

            .hero-h1 {
              font-size: clamp(34px, 4.4vw, 64px);
              font-weight: 900;
              line-height: 1.02;
              letter-spacing: -0.035em;
              margin: 0 0 18px;
              color: #fff;
            }
            .hero-h1 .accent {
              background: linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 50%, #0AA89F 100%);
              -webkit-background-clip: text;
              background-clip: text;
              color: transparent;
              filter: drop-shadow(0 0 28px rgba(94,234,212,0.35));
            }
            .hero-sub {
              font-size: clamp(15px, 1.15vw, 18px);
              line-height: 1.6;
              color: rgba(255,255,255,0.72);
              margin: 0 0 30px;
              max-width: 520px;
            }

            .hero-actions {
              display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
              margin-bottom: 32px;
            }
            .hero-cta-primary {
              display: inline-flex; align-items: center; gap: 10px;
              padding: 16px 28px;
              border-radius: 12px;
              background: linear-gradient(135deg, #0AA89F 0%, #0D8F87 60%, #086F69 100%);
              color: #fff; font-weight: 800; font-size: 15px;
              text-decoration: none;
              border: 1px solid rgba(94,234,212,0.4);
              box-shadow:
                0 12px 36px rgba(10,168,159,0.45),
                0 0 0 1px rgba(94,234,212,0.2),
                inset 0 1px 0 rgba(255,255,255,0.18);
              position: relative; overflow: hidden;
              transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s, filter 0.22s;
            }
            .hero-cta-primary::before {
              content: '';
              position: absolute; inset: 0;
              background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.32) 50%, transparent 70%);
              background-size: 220% 100%;
              animation: heroShimmer 3.2s linear infinite;
              pointer-events: none;
            }
            .hero-cta-primary:hover {
              transform: translateY(-2px) scale(1.03);
              box-shadow: 0 18px 50px rgba(10,168,159,0.6), 0 0 0 1px rgba(94,234,212,0.35), inset 0 1px 0 rgba(255,255,255,0.18);
              filter: brightness(1.08);
            }
            .hero-cta-primary .arrow { transition: transform 0.22s ease; }
            .hero-cta-primary:hover .arrow { transform: translateX(4px); }

            .hero-cta-secondary {
              display: inline-flex; align-items: center; gap: 8px;
              padding: 16px 22px;
              border-radius: 12px;
              border: 1px solid rgba(255,255,255,0.18);
              background: rgba(255,255,255,0.04);
              color: rgba(255,255,255,0.92); font-weight: 700; font-size: 14px;
              text-decoration: none;
              transition: background 0.2s, border-color 0.2s, transform 0.2s;
            }
            .hero-cta-secondary:hover {
              background: rgba(94,234,212,0.10);
              border-color: rgba(94,234,212,0.4);
              transform: translateY(-1px);
            }

            .hero-trust {
              display: flex; gap: 28px; flex-wrap: wrap;
              padding-top: 22px;
              border-top: 1px solid rgba(255,255,255,0.10);
              max-width: 540px;
            }
            .hero-trust-item { display: flex; flex-direction: column; gap: 2px; }
            .hero-trust-num {
              font-size: 22px; font-weight: 900;
              color: #5EEAD4;
              line-height: 1;
              letter-spacing: -0.5px;
              font-variant-numeric: tabular-nums;
            }
            .hero-trust-lab {
              font-size: 11px; font-weight: 600;
              color: rgba(255,255,255,0.55);
              letter-spacing: 0.04em;
            }

            .hero-stage {
              position: relative;
              height: 520px;
              min-width: 0;
            }

            @keyframes heroShimmer {
              0%   { background-position: -180% 0; }
              100% { background-position: 180% 0; }
            }
            @keyframes heroBlink {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.45; }
            }

            @media (max-width: 1024px) {
              .hero-grid { grid-template-columns: 1fr; gap: 48px; padding: 56px 28px; }
              .hero-stage { height: 440px; }
            }
            @media (max-width: 640px) {
              .hero-stage { height: 380px; }
              .hero-trust { gap: 18px; }
              .hero-trust-num { font-size: 18px; }
            }
          `}</style>

          <div className="hero-blob b1" />
          <div className="hero-blob b2" />

          {/* Brand callback â€” subtle wave silhouette at bottom (echoes logo) */}
          <svg
            viewBox="0 0 1440 90"
            preserveAspectRatio="none"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: 90, pointerEvents: 'none', zIndex: 1 }}
          >
            <path
              d="M0,55 C240,30 460,72 720,52 C980,32 1220,68 1440,45 L1440,90 L0,90 Z"
              fill="rgba(94,234,212,0.05)"
            />
            <path
              d="M0,55 C240,30 460,72 720,52 C980,32 1220,68 1440,45"
              stroke="rgba(94,234,212,0.32)"
              strokeWidth="1.4"
              fill="none"
            />
            <path
              d="M0,72 C260,48 480,84 720,64 C960,44 1240,80 1440,60"
              stroke="rgba(94,234,212,0.16)"
              strokeWidth="1"
              fill="none"
            />
          </svg>

          <div className="hero-grid">
            <div>
              <div className="hero-eyebrow">The Best AI Implementation for Teams of 1-15</div>
              <h1 className="hero-h1">
                Replace the $60K/yr office manager<br />
                <span className="accent">you can&apos;t afford to hire.</span>
              </h1>
              <p className="hero-sub">
                BellAveGo answers your calls, hunts down quotes, collects past-due invoices, and replies to reviews â€” all running in the background while you&apos;re on the truck. <strong>$497/month. No setup fee. First month free.</strong>
              </p>

              <div className="hero-actions">
                <Link href={isSignedIn ? '/dashboard' : '/sign-up'} className="hero-cta-primary">
                  {isSignedIn ? 'Open Dashboard' : 'Get Started'}
                  <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
                <a href="tel:+16514677829" className="hero-cta-secondary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  Call the AI Demo
                </a>
              </div>

              <div className="hero-trust">
                <div className="hero-trust-item">
                  <span className="hero-trust-num">12s</span>
                  <span className="hero-trust-lab">Avg answer time</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">24/7</span>
                  <span className="hero-trust-lab">Always on</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">$179</span>
                  <span className="hero-trust-lab">Starting / month</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">30â€‘day</span>
                  <span className="hero-trust-lab">Moneyâ€‘back</span>
                </div>
              </div>
            </div>

            <div className="hero-stage">
              <HeroShowcase />
            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <div id="lp-preview"><DashboardPreview /></div>

      {/* CONSULTING PREVIEW */}
      <section style={{ background: 'linear-gradient(180deg, #EBF7F3 0%, #F5FCFA 100%)', padding: '72px 48px 80px', borderBottom: '1px solid #D4E6DC', position: 'relative', overflow: 'hidden' }}>
        <style>{`
          @keyframes pdfFloat {
            0%, 100% { transform: rotate(6deg) translateY(0); }
            50%      { transform: rotate(6deg) translateY(-6px); }
          }
          @keyframes pdfBadgePulse {
            0%, 100% { box-shadow: 0 8px 24px rgba(10,168,159,0.32), 0 0 0 0 rgba(94,234,212,0.4); }
            50%      { box-shadow: 0 12px 32px rgba(10,168,159,0.5), 0 0 0 8px rgba(94,234,212,0); }
          }
          .pdf-float {
            position: absolute;
            top: 64px;
            right: 48px;
            display: flex; align-items: center; gap: 14px;
            z-index: 5;
            text-decoration: none;
          }
          .pdf-thumb {
            width: 92px; height: 116px;
            border-radius: 8px;
            background: linear-gradient(160deg, #fff 0%, #F5FCFA 100%);
            border: 1px solid rgba(10,168,159,0.22);
            box-shadow: 0 14px 32px rgba(11,31,58,0.18), 0 4px 10px rgba(11,31,58,0.08);
            position: relative;
            overflow: hidden;
            animation: pdfFloat 4.2s ease-in-out infinite;
            transition: transform 0.24s ease;
            flex-shrink: 0;
          }
          .pdf-thumb:hover { transform: rotate(0deg) scale(1.06); }
          .pdf-thumb-head {
            height: 24px;
            background: linear-gradient(135deg, #0B1F3A, #163356);
            display: flex; align-items: center; padding: 0 7px; gap: 4px;
          }
          .pdf-thumb-dot { width: 4px; height: 4px; border-radius: 50%; background: #5EEAD4; }
          .pdf-thumb-stripe {
            height: 5px;
            background: linear-gradient(90deg, #5EEAD4 0%, #0AA89F 100%);
          }
          .pdf-thumb-body { padding: 8px 8px 6px; display: flex; flex-direction: column; gap: 4px; }
          .pdf-thumb-line {
            height: 4px; border-radius: 2px;
            background: rgba(11,31,58,0.10);
          }
          .pdf-thumb-line.lg { height: 6px; background: rgba(11,31,58,0.18); }
          .pdf-thumb-pin {
            position: absolute;
            top: -7px; right: -7px;
            background: linear-gradient(135deg, #22C55E, #15803D);
            color: #fff;
            font-size: 8.5px; font-weight: 800;
            padding: 3px 7px; border-radius: 99px;
            letter-spacing: 0.04em;
            box-shadow: 0 4px 12px rgba(34,197,94,0.42);
          }
          .pdf-cta {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 11px 18px;
            border-radius: 10px;
            background: linear-gradient(135deg, #0AA89F, #0D8F87);
            color: #fff;
            font-weight: 800; font-size: 13px;
            letter-spacing: -0.2px;
            border: 1px solid rgba(94,234,212,0.4);
            animation: pdfBadgePulse 2.4s ease-in-out infinite;
            transition: transform 0.22s ease, filter 0.22s ease;
            white-space: nowrap;
          }
          .pdf-cta:hover { transform: translateY(-2px) scale(1.04); filter: brightness(1.10); }
          .pdf-cta-arrow { transition: transform 0.22s ease; }
          .pdf-float:hover .pdf-cta-arrow { transform: translateX(3px); }
          .pdf-cta-stack { display: flex; flex-direction: column; gap: 4px; }
          .pdf-cta-tag {
            font-size: 10px; font-weight: 700; color: #0AA89F;
            letter-spacing: 0.14em; text-transform: uppercase;
          }
          @media (max-width: 880px) {
            .pdf-float { display: none; }
          }
        `}</style>

        <Link href="/sample-report" className="pdf-float" aria-label="View a sample BellAveGo consulting report">
          <div className="pdf-thumb">
            <span className="pdf-thumb-pin">PDF</span>
            <div className="pdf-thumb-head">
              <span className="pdf-thumb-dot" />
              <span className="pdf-thumb-dot" style={{ background: 'rgba(94,234,212,0.45)' }} />
              <span className="pdf-thumb-dot" style={{ background: 'rgba(94,234,212,0.25)' }} />
            </div>
            <div className="pdf-thumb-stripe" />
            <div className="pdf-thumb-body">
              <div className="pdf-thumb-line lg" style={{ width: '78%' }} />
              <div className="pdf-thumb-line" style={{ width: '92%' }} />
              <div className="pdf-thumb-line" style={{ width: '85%' }} />
              <div className="pdf-thumb-line" style={{ width: '60%' }} />
              <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                <div style={{ flex: 1, height: 14, borderRadius: 3, background: 'rgba(10,168,159,0.18)' }} />
                <div style={{ flex: 1, height: 14, borderRadius: 3, background: 'rgba(34,197,94,0.18)' }} />
                <div style={{ flex: 1, height: 14, borderRadius: 3, background: 'rgba(245,158,11,0.18)' }} />
              </div>
              <div className="pdf-thumb-line" style={{ width: '70%', marginTop: 3 }} />
              <div className="pdf-thumb-line" style={{ width: '50%' }} />
            </div>
          </div>
          <div className="pdf-cta-stack">
            <span className="pdf-cta-tag">BellAveGo Â· PDF</span>
            <span className="pdf-cta">
              View a report
              <svg className="pdf-cta-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </div>
        </Link>

        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Quarterly consulting Â· Included on Growth+</p>
            <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 42px)', fontWeight: 900, color: '#0B1F3A', letterSpacing: '-1px', marginBottom: 12, lineHeight: 1.1 }}>
              A real consulting report â€”<br /><span style={{ color: '#0AA89F' }}>built from your data, every quarter.</span>
            </h2>
            <p style={{ fontSize: 16, color: '#4A7A80', maxWidth: 580, margin: '0 auto', lineHeight: 1.6 }}>
              Most AI receptionists answer your phone. BellAveGo also pulls your dashboard, your service area&apos;s census + Google Places data, and ships you a polished consulting report â€” quarterly on Growth, monthly on Multi-location.
            </p>
          </div>

          {/* What's inside â€” 3-up feature row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    <polyline points="17 6 23 6 23 12"/>
                  </svg>
                ),
                title: 'Top 3 revenue gaps',
                desc: 'AI scans your call data and spots the 3 highest-leverage moves. With dollars. e.g. "Saturday 10amâ€“2pm gap = +$5,200/mo at your close rates."',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                ),
                title: 'Local market scan',
                desc: 'Homeowners in your ZIPs, median income, home age, HVAC replacement opportunity. Census + Google Places fused with your service area.',
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                ),
                title: '90-day action plan',
                desc: '5 prioritized moves â€” ranked by impact Ã· effort, with timelines. Not generic advice. Specific to your data, your trade, your zip.',
              },
            ].map(f => (
              <div key={f.title} style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.16)', borderRadius: 14, padding: '20px 22px', boxShadow: '0 2px 14px rgba(10,168,159,0.06)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, boxShadow: '0 4px 12px rgba(10,168,159,0.32)' }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', margin: '0 0 6px', letterSpacing: '-0.2px' }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: '#4A7A80', margin: 0, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Sample report visual + live preview cards */}
          <style>{`
            @keyframes consPreviewIn {
              0%   { opacity: 0; transform: translateY(14px) scale(0.97); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            .cons-preview {
              opacity: 0;
              animation: consPreviewIn 0.6s cubic-bezier(0.22,1,0.36,1) forwards;
            }
            .cons-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 20px; align-items: stretch; }
            @media (max-width: 880px) { .cons-grid { grid-template-columns: 1fr; } }
          `}</style>

          <div className="cons-grid">
            {/* LEFT â€” report image with overlay CTA */}
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 70px rgba(7,27,58,0.18)', border: '1px solid rgba(10,168,159,0.18)', minHeight: 420 }}>
              <Image
                src="/Consulting1.png"
                alt="BellAveGo Consulting Report â€” sample"
                width={1400}
                height={900}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 50%, rgba(7,27,58,0.92) 100%)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ color: '#fff' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 3 }}>Sample report</div>
                  <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-0.3px' }}>Q1 2026 Â· Mike&apos;s HVAC Â· Minneapolis</div>
                </div>
                <Link href="/sample-report" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '10px 18px', borderRadius: 9,
                  background: '#fff', color: '#0AA89F',
                  fontWeight: 800, fontSize: 13, textDecoration: 'none',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
                }}>
                  View full report
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>
            </div>

            {/* RIGHT â€” live preview cards from the actual report */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

              {/* Card 1: Top opportunity */}
              <div className="cons-preview" style={{
                background: '#fff',
                borderRadius: 14,
                padding: '16px 18px',
                border: '1px solid rgba(10,168,159,0.18)',
                boxShadow: '0 8px 24px rgba(11,31,58,0.08), 0 2px 6px rgba(11,31,58,0.04)',
                animationDelay: '0.05s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Â§4 Â· Top opportunity</span>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.14)', color: '#15803D', letterSpacing: '0.04em', textTransform: 'uppercase' }}>â— High confidence</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>+${SAMPLE_REPORT.opportunities[0].monthlyValue.toLocaleString()}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#7AAAB2', letterSpacing: '0.06em', textTransform: 'uppercase' }}>per month</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', marginBottom: 4 }}>{SAMPLE_REPORT.opportunities[0].title}</div>
                <p style={{ fontSize: 12, color: '#4A6670', margin: 0, lineHeight: 1.5 }}>{SAMPLE_REPORT.opportunities[0].pattern}</p>
              </div>

              {/* Card 2: Service area mini-map */}
              <div className="cons-preview" style={{
                background: 'linear-gradient(160deg, #E8F4EF 0%, #DCEDE6 100%)',
                borderRadius: 14,
                padding: 14,
                border: '1px solid rgba(10,168,159,0.18)',
                boxShadow: '0 8px 24px rgba(11,31,58,0.08), 0 2px 6px rgba(11,31,58,0.04)',
                animationDelay: '0.20s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Â§5 Â· Service area pinpoints</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#7AAAB2' }}>{SAMPLE_REPORT.meta.serviceArea.length} ZIPs</span>
                </div>
                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '21/9', background: '#fff' }}>
                  <svg viewBox="0 0 1000 430" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                    <defs>
                      <pattern id="cgrid-home" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(10,168,159,0.10)" strokeWidth="1" />
                      </pattern>
                    </defs>
                    <rect width="1000" height="430" fill="url(#cgrid-home)" />
                    <ellipse cx="290" cy="170" rx="92" ry="58" fill="rgba(94,234,212,0.55)" />
                    <g stroke="rgba(11,31,58,0.16)" strokeWidth="3" fill="none" strokeLinecap="round">
                      <path d="M0,260 C 220,240 340,300 520,260 S 820,200 1000,230" />
                      <path d="M0,160 C 200,180 360,120 540,150 S 780,100 1000,130" />
                      <path d="M520,0 C 540,140 480,260 540,430" />
                      <path d="M820,0 C 840,140 780,260 840,430" />
                    </g>
                    {SAMPLE_REPORT.serviceAreaMap.points.map((p, i) => {
                      const cx = (p.x / 100) * 1000
                      const cy = (p.y / 100) * 430
                      const fill = p.kind === 'business' ? '#0AA89F' : p.kind === 'opportunity' ? '#22C55E' : '#94A3B8'
                      const r = p.kind === 'business' ? 22 : 18
                      return (
                        <g key={i}>
                          <circle cx={cx} cy={cy} r={r + 4} fill={fill} opacity="0.30" />
                          <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth="2.5" />
                          <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800">{p.label}</text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10.5, color: '#4A6670' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0AA89F' }} /> You
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} /> Opportunities
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94A3B8' }} /> Competitors
                  </span>
                </div>
              </div>

              {/* Card 3: Outreach target preview */}
              <div className="cons-preview" style={{
                background: '#fff',
                borderRadius: 14,
                padding: '14px 16px',
                border: '1px solid rgba(10,168,159,0.18)',
                boxShadow: '0 8px 24px rgba(11,31,58,0.08), 0 2px 6px rgba(11,31,58,0.04)',
                animationDelay: '0.35s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Â§6 Â· Outreach targets</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(11,31,58,0.06)', color: '#4A6670', letterSpacing: '0.04em', textTransform: 'uppercase' }}>TCPA-safe</span>
                </div>
                {SAMPLE_REPORT.outreachTargets.slice(0, 2).map((t, i) => (
                  <div key={t.business} style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '8px 0',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(10,168,159,0.10)',
                  }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800 }}>
                      {t.business[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0B1F3A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.business}</div>
                      <div style={{ fontSize: 10.5, color: '#7AAAB2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.type}</div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0AA89F', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {t.phone}
                    </span>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(10,168,159,0.18)', fontSize: 11, color: '#7AAAB2', textAlign: 'center', fontWeight: 600 }}>
                  + {SAMPLE_REPORT.outreachTargets.length - 2} more in the full report â†’
                </div>
              </div>
            </div>
          </div>

          {/* University trust strip */}
          <div style={{ marginTop: 28, padding: '18px 24px', borderRadius: 14, background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, boxShadow: '0 12px 36px rgba(11,31,58,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #5EEAD4, #0AA89F)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                  <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>Methodology</div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', letterSpacing: '-0.2px' }}>
                  Reports formulated by graduates of <span style={{ color: '#5EEAD4' }}>Harvard, Stanford &amp; Fordham</span>.
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
              Powered by Claude Sonnet Â· Census ACS Â· Google Places
            </div>
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section style={{ background: '#F2F9F5', borderBottom: '1px solid #D4E6DC', padding: '28px 0 0' }}>
        <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#5A8A92', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>Built for home service businesses</p>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: 'max-content', animation: 'scroll 25s linear infinite', paddingBottom: 26 }}>
            {[...Array(2)].map((_, repeat) => (
              <div key={repeat} style={{ display: 'flex' }}>
                {[
                  { icon: 'â„ï¸', label: 'HVAC' }, { icon: 'ðŸª ', label: 'Plumbing' }, { icon: 'âš¡', label: 'Electrical' },
                  { icon: 'ðŸ§¹', label: 'Cleaning' }, { icon: 'ðŸŒ¿', label: 'Landscaping' }, { icon: 'ðŸ”¨', label: 'Handyman' },
                  { icon: 'ðŸ ', label: 'Roofing' }, { icon: 'ðŸ”§', label: 'Appliance Repair' }, { icon: 'ðŸš—', label: 'Auto Detailing' },
                  { icon: 'ðŸ¾', label: 'Pet Services' }, { icon: 'ðŸ’§', label: 'Pool & Spa' }, { icon: 'ðŸªŸ', label: 'Window Cleaning' },
                ].map(s => (
                  <div key={s.label + repeat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px', borderRight: '1px solid #D4E6DC', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#3D5A62' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JOB SITE */}
      <section style={{ padding: '72px 48px', background: '#EAF5F0', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Built for the job site</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px', color: '#0B1F3A', marginBottom: 12 }}>
              You stay on the job.<br />
              <span style={{ color: '#20B2AA' }}>BellAveGo handles the front desk.</span>
            </h2>
            <p style={{ color: '#3D5A62', fontSize: 17, maxWidth: 500, margin: '0 auto' }}>
              While you&apos;re working, driving, or finishing a job, BellAveGo answers the call, books the appointment, and texts the customer.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 36 }}>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/customer.png" alt="Contractor on the job" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>ðŸ’¬ Customer gets handled instantly</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Booked, confirmed, and reminded automatically.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/electrician.png" alt="Customer getting confirmation" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>ðŸ“ Contractor can&apos;t answer</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Phone rings while you&apos;re on the job.</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {[
              { icon: 'ðŸ“ž', title: 'BellAveGo answers', desc: 'Every call, every time â€” 24/7' },
              { icon: 'ðŸ“…', title: 'Job gets booked', desc: 'Added to your schedule instantly' },
              { icon: 'ðŸ’¬', title: 'Customer texted', desc: 'Confirmation + reminder, automatic' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fff', border: '1px solid #D4E6DC', borderRadius: 14, padding: '26px 22px', textAlign: 'center', boxShadow: '0 2px 14px rgba(32,178,170,0.07)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{s.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 15, marginBottom: 6, color: '#0B1F3A' }}>{s.title}</p>
                <p style={{ color: '#4A6670', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '72px 48px', background: '#F2F9F5', borderBottom: '1px solid #D4E6DC', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Pricing</p>
        <h2 style={{ fontSize: 42, fontWeight: 900, marginBottom: 8, letterSpacing: '-1.5px', color: '#0B1F3A' }}>Pay for what you use.</h2>
        <p style={{ color: '#4A6670', fontSize: 16, marginBottom: 48 }}>Your first booked job pays for the whole month.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, maxWidth: 960, margin: '0 auto 20px' }}>
          {[
            {
              name: 'Receptionist', price: 179, tier: 'receptionist', calls: 'Up to 500',
              desc: 'AI captures every call. You close it in one tap â€” confirm, invoice, call back, or just acknowledge.',
              features: ['24/7 AI call answering', 'Captures name Â· phone Â· service Â· address Â· preferred time', 'Instant text summary to your phone', 'One-tap actions on every call', 'Emergency routing to your cell', 'Live dashboard + transcripts + recordings', '3 quarterly intelligence reports/year'],
              popular: false, customCta: false,
            },
            {
              name: 'AI Office Manager', price: 497, tier: 'officemgr', calls: 'Unlimited',
              desc: 'Replace the $60K/yr office manager you canâ€™t afford to hire. Calls + quote follow-up + collections + reviews.',
              features: ['Everything in Receptionist, plus:', 'Unlimited calls', 'AI Quote Hunter (auto follow-ups day 2/7/14)', 'AI Collections (nightly past-due chase)', 'AI Reviews (drafts replies for one-tap approval)', 'Smart suggestions on call summaries', 'Jobber / HousecallPro / ServiceTitan integration', '6 bi-monthly intelligence reports/year'],
              popular: true, customCta: false,
            },
            {
              name: 'Concierge', price: 997, tier: 'concierge', calls: 'Unlimited',
              desc: 'Everything autonomous. Multi-location ready. White-glove onboarding. We run the back office for you.',
              features: ['Everything in AI Office Manager, plus:', 'Auto-confirm mode (when you trust it)', 'Multi-location support (up to 5 numbers)', 'Custom AI prompt tuning', 'AI Photo Estimator Â· Financing Closer Â· Recruiter (Q3 2026)', 'White-glove onboarding (we wire up your CRM)', 'Priority support â€” 24h SLA, dedicated Slack', 'API access for custom integrations', '12 monthly intelligence reports/year'],
              popular: false, customCta: false,
            },
          ].map(plan => (
            <div key={plan.name} style={{
              background: plan.popular ? 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)' : '#fff',
              borderRadius: 20,
              padding: '36px 28px',
              border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.18)',
              boxShadow: plan.popular ? '0 24px 60px rgba(11,31,58,0.26)' : '0 2px 16px rgba(7,27,58,0.06)',
              position: 'relative',
              textAlign: 'left',
            }}>
              {plan.popular && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#22C55E', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Most Popular
                </div>
              )}
              <div style={{ fontSize: 14, fontWeight: 700, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#7AAAB2', marginBottom: 8 }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, marginBottom: 4 }}>
                {plan.customCta ? (
                  <span style={{ fontSize: 32, fontWeight: 900, color: '#0B1F3A', lineHeight: 1.1, letterSpacing: '-1px' }}>Custom</span>
                ) : (
                  <>
                    <span style={{ fontSize: 20, fontWeight: 900, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#4A7A80', marginTop: 10 }}>$</span>
                    <span style={{ fontSize: 56, fontWeight: 900, color: plan.popular ? '#fff' : '#0B1F3A', lineHeight: 1, letterSpacing: '-2px' }}>{plan.price}</span>
                  </>
                )}
              </div>
              <div style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.38)' : '#7AAAB2', marginBottom: 6 }}>{plan.customCta ? 'pricing per location' : 'per month Â· cancel anytime'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2', marginBottom: 12 }}>No setup fee Â· No contracts Â· First month free</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: plan.popular ? '#18AFA8' : '#0AA89F', marginBottom: 16 }}>{plan.calls} calls</div>
              <div style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.6)' : '#4A7A80', marginBottom: 24, lineHeight: 1.6 }}>{plan.desc}</div>
              <div style={{ marginBottom: 24 }}>
                {(plan.features ?? []).map((f, idx) => {
                  const isHeader = f.endsWith(':') || f.endsWith('plus:')
                  return (
                    <div key={f + idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: idx === (plan.features!.length - 1) ? 'none' : `1px solid ${plan.popular ? 'rgba(255,255,255,0.07)' : 'rgba(10,168,159,0.08)'}` }}>
                      {!isHeader && (
                        <div style={{ width: 16, height: 16, background: plan.popular ? '#18AFA8' : '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                          <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>âœ“</span>
                        </div>
                      )}
                      <span style={{ fontSize: 12, color: isHeader ? (plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2') : (plan.popular ? 'rgba(255,255,255,0.82)' : '#0B1F3A'), fontWeight: isHeader ? 700 : 500, fontStyle: isHeader ? 'italic' : 'normal', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  )
                })}
              </div>
              {isSignedIn ? (
                <Link href={`/pricing?tier=${plan.tier}&autocheckout=1`} style={{ display: 'block', textAlign: 'center', padding: '13px', background: plan.popular ? '#22C55E' : 'linear-gradient(135deg,#0AA89F,#0D8F87)', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none' }}>
                  Start Free Month â†’
                </Link>
              ) : (
                <Link href={`/pricing?tier=${plan.tier}`} style={{ display: 'block', textAlign: 'center', padding: '13px', background: plan.popular ? '#22C55E' : 'rgba(10,168,159,0.08)', borderRadius: 10, textDecoration: 'none', color: plan.popular ? '#fff' : '#0AA89F', fontWeight: 800, fontSize: 14, border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.2)' }}>
                  Get started â†’
                </Link>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#7AAAB2', marginTop: 16, lineHeight: 1.6 }}>
          $0 setup Â· Month-to-month Â· First month free Â· 17% off annual.<br />
          <span style={{ fontWeight: 700, color: '#0AA89F' }}>Typical $1M HVAC shop sees $18K/mo lift from the 4-AI bundle</span> â€” 37x return on $497.<br />
          90-day money-back if we don&apos;t add at least 5 booked jobs.
        </p>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '88px 48px', background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 50px)', fontWeight: 900, marginBottom: 16, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.1 }}>
          Stop letting missed calls<br />become missed jobs.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 17, maxWidth: 460, margin: '0 auto 40px', lineHeight: 1.8 }}>
          Set up BellAveGo in 15 minutes and let the AI answer, book, and text your next customer.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isSignedIn ? (
            <Link href="/dashboard" className="dash-pulse" style={{ padding: '16px 46px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
              Dashboard â†’
            </Link>
          ) : (
            <Link href="/pricing" className="cta-pulse" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
              Get started â†’
            </Link>
          )}
          <a href="tel:+16514677829" style={{ padding: '16px 30px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none' }} title="Call (651) 467-7829 â€” live AI demo">
            ðŸ“ž Call the AI Demo
          </a>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13, marginTop: 18 }}>No credit card. No contract. No BS.</p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '44px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Image src="/logo.png" alt="BellAveGo" width={300} height={100} style={{ objectFit: 'contain' }} />
          <p style={{ margin: 0, fontSize: 14, color: '#7AAAB2', fontStyle: 'italic' }}>We don&apos;t just answer calls. We grow your business.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>The best AI implementation for teams of 1-15 · From $179/mo · First month free · 90-day guarantee</p>
        </div>
      </footer>

    </main>
  )
}
