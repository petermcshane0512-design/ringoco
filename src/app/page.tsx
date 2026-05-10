'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import DashboardPreview from '@/components/DashboardPreview'
import HeroShowcase from '@/components/HeroShowcase'

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

          {/* Brand callback — subtle wave silhouette at bottom (echoes logo) */}
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
                BellAveGo answers your calls, hunts down quotes, collects past-due invoices, and replies to reviews — all running in the background while you&apos;re on the truck. <strong>$497/month + $247 onboarding. 30-day money-back guarantee.</strong>
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
                  <span className="hero-trust-num">30‑day</span>
                  <span className="hero-trust-lab">Money‑back</span>
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
      <section style={{ background: 'linear-gradient(180deg, #EBF7F3 0%, #F5FCFA 100%)', padding: '64px 32px 72px', borderBottom: '1px solid #D4E6DC' }}>
        <style>{`
          @keyframes pdfFloat {
            0%, 100% { transform: rotate(6deg) translateY(0); }
            50%      { transform: rotate(6deg) translateY(-6px); }
          }
          @keyframes pdfBadgePulse {
            0%, 100% { box-shadow: 0 8px 24px rgba(10,168,159,0.32), 0 0 0 0 rgba(94,234,212,0.4); }
            50%      { box-shadow: 0 12px 32px rgba(10,168,159,0.5), 0 0 0 8px rgba(94,234,212,0); }
          }
          .consult-wrap { position: relative; max-width: 1200px; margin: 0 auto; }
          .consult-img { display: block; width: 100%; height: auto; border-radius: 22px; box-shadow: 0 30px 80px rgba(7,27,58,0.18); border: 1px solid rgba(10,168,159,0.18); }
          .pdf-float-img {
            position: absolute;
            top: 64px; right: 28px;
            display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
            z-index: 5;
            text-decoration: none;
          }
          .pdf-cta-tag {
            font-size: 10px; font-weight: 800; color: #fff;
            letter-spacing: 0.14em; text-transform: uppercase;
            text-shadow: 0 1px 6px rgba(0,0,0,0.55);
          }
          .pdf-cta {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 10px 16px;
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
          .pdf-cta-arrow { transition: transform 0.22s ease; }
          .pdf-float-img:hover .pdf-cta { transform: translateY(-1px); filter: brightness(1.08); }
          .pdf-float-img:hover .pdf-cta-arrow { transform: translateX(3px); }
          .pdf-thumb {
            width: 144px; height: 196px;
            border-radius: 11px;
            background: #0B1F3A;
            border: 1px solid rgba(94,234,212,0.40);
            box-shadow: 0 18px 40px rgba(11,31,58,0.32), 0 6px 14px rgba(11,31,58,0.18);
            position: relative;
            overflow: hidden;
            animation: pdfFloat 4.2s ease-in-out infinite;
            transition: transform 0.24s ease;
            flex-shrink: 0;
          }
          .pdf-thumb:hover { transform: rotate(0deg) scale(1.06); }
          .pdf-thumb-photo {
            position: absolute; inset: 0;
            width: 100%; height: 100%;
            object-fit: cover; object-position: center;
            display: block;
          }
          /* Top + bottom darkening for text legibility */
          .pdf-thumb-shade {
            position: absolute; inset: 0;
            background:
              linear-gradient(180deg,
                rgba(7,22,42,0.78) 0%,
                rgba(7,22,42,0.42) 26%,
                rgba(7,22,42,0.0) 48%,
                rgba(7,22,42,0.0) 68%,
                rgba(7,22,42,0.55) 100%
              );
            pointer-events: none;
          }
          .pdf-thumb-content {
            position: absolute; inset: 0;
            padding: 10px 11px 9px;
            display: flex; flex-direction: column;
            z-index: 2;
          }
          .pdf-thumb-logo-wrap {
            align-self: flex-start;
            background: rgba(255,255,255,0.94);
            padding: 4px 8px;
            border-radius: 6px;
            margin-bottom: 7px;
            box-shadow: 0 4px 12px rgba(11,31,58,0.28);
            display: inline-block;
          }
          .pdf-thumb-logo {
            display: block; height: 14px; width: auto;
          }
          .pdf-thumb-eyebrow {
            display: inline-flex; align-items: center; gap: 4px;
            font-size: 7px; font-weight: 800;
            color: #fff;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            text-shadow: 0 1px 4px rgba(0,0,0,0.7);
          }
          .pdf-thumb-eyebrow::before {
            content: ''; width: 4px; height: 4px; border-radius: 50%;
            background: #22C55E; box-shadow: 0 0 6px rgba(34,197,94,0.85);
          }
          .pdf-thumb-business {
            font-size: 11px; font-weight: 800; color: #fff;
            letter-spacing: -0.3px; line-height: 1.1; margin-top: 2px;
            text-shadow: 0 1px 4px rgba(0,0,0,0.7);
          }
          .pdf-thumb-headline {
            font-size: 18px; font-weight: 900; color: #fff;
            line-height: 1.0; letter-spacing: -0.6px; margin-top: 4px;
            text-shadow: 0 2px 10px rgba(0,0,0,0.7), 0 0 18px rgba(94,234,212,0.45);
          }
          .pdf-thumb-sub {
            font-size: 8px; font-weight: 700;
            color: rgba(255,255,255,0.94);
            letter-spacing: 0.06em;
            text-shadow: 0 1px 3px rgba(0,0,0,0.65);
          }
          .pdf-thumb-meta {
            display: flex; gap: 3px; flex-wrap: wrap;
            margin-top: auto;
          }
          .pdf-thumb-pill {
            font-size: 6.5px; font-weight: 800;
            padding: 2px 5px; border-radius: 99px;
            background: rgba(11,31,58,0.65);
            border: 0.5px solid rgba(94,234,212,0.5);
            color: #fff;
            letter-spacing: 0.04em;
            backdrop-filter: blur(3px);
            -webkit-backdrop-filter: blur(3px);
          }
          .pdf-thumb-pin {
            position: absolute;
            top: -7px; right: -7px;
            background: linear-gradient(135deg, #22C55E, #15803D);
            color: #fff;
            font-size: 8.5px; font-weight: 800;
            padding: 3px 7px; border-radius: 99px;
            letter-spacing: 0.04em;
            box-shadow: 0 4px 12px rgba(34,197,94,0.42);
            z-index: 3;
          }
          @media (max-width: 720px) {
            .pdf-float-img { top: 12px; right: 12px; gap: 6px; }
            .pdf-cta-tag { display: none; }
            .pdf-cta { padding: 8px 12px; font-size: 11px; }
            .pdf-thumb { width: 100px; height: 136px; }
            .pdf-thumb-content { padding: 7px 8px 6px; }
            .pdf-thumb-logo { height: 12px; margin-bottom: 4px; }
            .pdf-thumb-business { font-size: 9px; }
            .pdf-thumb-headline { font-size: 14px; }
            .pdf-thumb-eyebrow { font-size: 6px; }
            .pdf-thumb-sub { font-size: 7px; }
            .pdf-thumb-pill { display: none; }
          }
        `}</style>

        <div className="consult-wrap">
          <Image
            src="/Consulting1.png"
            alt="BellAveGo Consulting Report - sample"
            width={1400}
            height={900}
            className="consult-img"
          />
          <Link href="/sample-report" className="pdf-float-img" aria-label="View a sample BellAveGo consulting report">
            <span className="pdf-cta-tag">BellAveGo &middot; PDF</span>
            <span className="pdf-cta">
              View a report
              <svg className="pdf-cta-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
            <div className="pdf-thumb">
              <span className="pdf-thumb-pin">PDF</span>
              <Image
                src="/hero-beach.jpg"
                alt=""
                width={1440}
                height={480}
                className="pdf-thumb-photo"
                aria-hidden="true"
              />
              <div className="pdf-thumb-shade" />
              <div className="pdf-thumb-content">
                <span className="pdf-thumb-logo-wrap">
                  <Image
                    src="/logo.png"
                    alt="BellAveGo"
                    width={665}
                    height={210}
                    className="pdf-thumb-logo"
                  />
                </span>
                <span className="pdf-thumb-eyebrow">Q1 2026 Report</span>
                <div className="pdf-thumb-business">Mike&apos;s HVAC</div>
                <div className="pdf-thumb-headline">$4.5K/mo</div>
                <div className="pdf-thumb-sub">identified upside</div>
                <div className="pdf-thumb-meta">
                  <span className="pdf-thumb-pill">HVAC</span>
                  <span className="pdf-thumb-pill">★ 7.4</span>
                </div>
              </div>
            </div>
          </Link>
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
                  { icon: '❄️', label: 'HVAC' }, { icon: '🪠', label: 'Plumbing' }, { icon: '⚡', label: 'Electrical' },
                  { icon: '🧹', label: 'Cleaning' }, { icon: '🌿', label: 'Landscaping' }, { icon: '🔨', label: 'Handyman' },
                  { icon: '🏠', label: 'Roofing' }, { icon: '🔧', label: 'Appliance Repair' }, { icon: '🚗', label: 'Auto Detailing' },
                  { icon: '🐾', label: 'Pet Services' }, { icon: '💧', label: 'Pool & Spa' }, { icon: '🪟', label: 'Window Cleaning' },
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
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>💬 Customer gets handled instantly</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Booked, confirmed, and reminded automatically.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/electrician.png" alt="Customer getting confirmation" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📍 Contractor can&apos;t answer</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Phone rings while you&apos;re on the job.</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {[
              { title: 'BellAveGo answers', desc: 'Every call, every time — 24/7' },
              { title: 'Job gets booked', desc: 'Added to your schedule instantly' },
              { title: 'Customer texted', desc: 'Confirmation + reminder, automatic' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fff', border: '1px solid #D4E6DC', borderRadius: 14, padding: '24px 22px', textAlign: 'center', boxShadow: '0 2px 14px rgba(32,178,170,0.07)' }}>
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
              name: 'Receptionist', price: 179, setup: 50, tier: 'receptionist', calls: 'Up to 500',
              desc: 'AI captures every call. You close it in one tap — confirm, invoice, call back, or just acknowledge.',
              features: ['24/7 AI call answering', 'Captures name · phone · service · address · preferred time', 'Instant text summary to your phone', 'One-tap actions on every call', 'Emergency routing to your cell', 'Live dashboard + transcripts + recordings', '3 quarterly intelligence reports/year'],
              popular: false, customCta: false,
            },
            {
              name: 'AI Office Manager', price: 497, setup: 247, tier: 'officemgr', calls: 'Unlimited',
              desc: 'Replace the $60K/yr office manager you can’t afford to hire. Calls + quote follow-up + collections + reviews.',
              features: ['Everything in Receptionist, plus:', 'Unlimited calls', 'AI Quote Hunter (auto follow-ups day 2/7/14)', 'AI Collections (nightly past-due chase)', 'AI Reviews (drafts replies for one-tap approval)', 'Smart suggestions on call summaries', 'Jobber / HousecallPro / ServiceTitan integration', '6 bi-monthly intelligence reports/year'],
              popular: true, customCta: false,
            },
            {
              name: 'Concierge', price: 997, setup: 497, tier: 'concierge', calls: 'Unlimited',
              desc: 'Everything autonomous. Multi-location ready. White-glove onboarding. We run the back office for you.',
              features: ['Everything in AI Office Manager, plus:', 'Auto-confirm mode (when you trust it)', 'Multi-location support (up to 5 numbers)', 'Custom AI prompt tuning', 'AI Photo Estimator · Financing Closer · Recruiter (Q3 2026)', 'White-glove onboarding (we wire up your CRM)', 'Priority support — 24h SLA, dedicated Slack', 'API access for custom integrations', '12 monthly intelligence reports/year'],
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
              <div style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.38)' : '#7AAAB2', marginBottom: 6 }}>{plan.customCta ? 'pricing per location' : 'per month · cancel anytime'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2', marginBottom: 12 }}>{plan.customCta ? 'White-glove onboarding included' : '+ $' + plan.setup + ' onboarding · 30-day money-back'}</div>
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
                  Start Free Month →
                </Link>
              ) : (
                <Link href={`/pricing?tier=${plan.tier}`} style={{ display: 'block', textAlign: 'center', padding: '13px', background: plan.popular ? '#22C55E' : 'rgba(10,168,159,0.08)', borderRadius: 10, textDecoration: 'none', color: plan.popular ? '#fff' : '#0AA89F', fontWeight: 800, fontSize: 14, border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.2)' }}>
                  Get started →
                </Link>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#7AAAB2', marginTop: 16, lineHeight: 1.6 }}>
          Month-to-month . 30-day money-back . 17% off annual.<br />
          <span style={{ fontWeight: 700, color: '#0AA89F' }}>Typical $1M HVAC shop sees $18K/mo lift from the 4-AI bundle</span> — 37x return on $497.<br />
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
              Dashboard →
            </Link>
          ) : (
            <Link href="/pricing" className="cta-pulse" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
              Get started →
            </Link>
          )}
          <a href="tel:+16514677829" style={{ padding: '16px 30px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none' }} title="Call (651) 467-7829 — live AI demo">
            📞 Call the AI Demo
          </a>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13, marginTop: 18 }}>No credit card. No contract. No BS.</p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '44px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Image src="/logo.png" alt="BellAveGo" width={300} height={100} style={{ objectFit: 'contain' }} />
          <p style={{ margin: 0, fontSize: 14, color: '#7AAAB2', fontStyle: 'italic' }}>We don&apos;t just answer calls. We grow your business.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>The best AI implementation for teams of 1–15 · From $179/mo · 90-day money-back · Cancel anytime</p>
        </div>
      </footer>

    </main>
  )
}
