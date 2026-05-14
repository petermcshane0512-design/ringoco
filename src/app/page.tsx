'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import DashboardPreview from '@/components/DashboardPreview'
import ConsultingShowcase from '@/components/ConsultingShowcase'
import HeroPhone from '@/components/HeroPhone'
import RoiCalculator from '@/components/RoiCalculator'
import FounderSection from '@/components/FounderSection'
import StickyDemoCta from '@/components/StickyDemoCta'

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
          {isSignedIn && (
            <Link href="/dashboard" className="nav-cta"><span className="nav-cta-text">Dashboard</span></Link>
          )}
          <Link href="/founder" className="why-pulse"><span className="why-pulse-text">Why BellAveGo?</span></Link>
          <Link href="/pricing" className="price-pulse">Pricing</Link>
          {isSignedIn ? (
            <SignOutButton redirectUrl="/">
              <button className="signout-link">Sign out</button>
            </SignOutButton>
          ) : (
            <Link href="/sign-up" className="nav-cta"><span className="nav-cta-text">Sign in / Create Account</span></Link>
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
                radial-gradient(800px 400px at 88% 8%, rgba(255,157,90,0.22), transparent 60%),
                radial-gradient(900px 500px at 72% 28%, rgba(232,116,43,0.16), transparent 65%),
                radial-gradient(1100px 600px at 78% 55%, rgba(10,168,159,0.26), transparent 65%),
                radial-gradient(900px 700px at 12% 85%, rgba(94,234,212,0.20), transparent 70%),
                linear-gradient(180deg, #050E1F 0%, #0B1F3A 35%, #0F3454 78%, #2D7A92 100%);
              overflow: hidden;
              line-height: normal;
            }
            .hero-wrap::after {
              content: '';
              position: absolute; left: -10%; right: -10%; bottom: -2px; height: 88px;
              background:
                radial-gradient(ellipse 22% 100% at 18% 60%, rgba(255,255,255,0.32), transparent 70%),
                radial-gradient(ellipse 28% 100% at 52% 50%, rgba(255,255,255,0.22), transparent 70%),
                radial-gradient(ellipse 24% 100% at 86% 60%, rgba(255,255,255,0.34), transparent 70%);
              filter: blur(2px);
              opacity: 0.55;
              mix-blend-mode: screen;
              pointer-events: none;
              animation: heroFoam 6s ease-in-out infinite;
            }
            @keyframes heroFoam {
              0%, 100% { transform: translateX(-1%); opacity: 0.45; }
              50%      { transform: translateX(1%); opacity: 0.7; }
            }
            .hero-waves {
              position: absolute; left: 0; right: 0; bottom: 0;
              width: 100%; height: 110px;
              pointer-events: none;
              opacity: 0.55;
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
              background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%);
              color: #fff; font-weight: 800; font-size: 15px;
              text-decoration: none;
              border: 1px solid rgba(94,234,212,0.45);
              box-shadow:
                0 12px 36px rgba(20,184,166,0.42),
                0 0 0 1px rgba(94,234,212,0.22),
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
              box-shadow: 0 18px 50px rgba(20,184,166,0.55), 0 0 0 1px rgba(94,234,212,0.40), inset 0 1px 0 rgba(255,255,255,0.18);
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
              min-height: 460px;
              min-width: 0;
            }
            .hero-stage-dash {
              position: absolute;
              inset: 0;
              display: flex;
              align-items: center;
              padding-right: 10%;
              transform: scale(0.82);
              transform-origin: left center;
            }
            .hero-stage-phone {
              position: absolute;
              right: -2%;
              bottom: 0;
              z-index: 10;
              animation: heroPhoneFloat 6s ease-in-out infinite;
              transform-origin: center;
            }
            @keyframes heroPhoneFloat {
              0%, 100% { transform: rotate(4deg) translateY(0); }
              50%      { transform: rotate(4deg) translateY(-6px); }
            }

            @keyframes heroShimmer {
              0%   { background-position: -180% 0; }
              100% { background-position: 180% 0; }
            }
            @keyframes heroBlink {
              0%, 100% { opacity: 1; }
              50%      { opacity: 0.45; }
            }

            /* ── Grid layouts for non-hero sections ── */
            .home-grid-2       { display: grid; grid-template-columns: 1fr 1fr; }
            .home-grid-3       { display: grid; grid-template-columns: repeat(3, 1fr); }
            .home-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); }

            /* ── Tablet ── */
            @media (max-width: 1024px) {
              .hero-grid { grid-template-columns: 1fr; gap: 48px; padding: 56px 28px; }
              .hero-stage { min-height: 420px; }
              .hero-stage-dash { padding-right: 8%; }
              .hero-stage-phone { right: 0; }
            }

            /* ── Mobile (iOS portrait / cold-email-click experience) ── */
            @media (max-width: 768px) {
              /* Tighter hero — fits above the fold on iPhone */
              .hero-grid { padding: 36px 18px 56px; gap: 28px; }
              .hero-eyebrow { font-size: 10.5px; margin-bottom: 14px; padding: 5px 11px; }
              .hero-h1 { font-size: 32px; line-height: 1.05; margin-bottom: 14px; }
              .hero-sub { font-size: 15px; margin-bottom: 22px; max-width: 100%; }

              /* CTAs become full-width thumb-targets */
              .hero-actions { gap: 10px; margin-bottom: 26px; flex-direction: column; align-items: stretch; }
              .hero-cta-primary, .hero-cta-secondary { width: 100%; justify-content: center; padding: 14px 20px; }

              /* Trust badges shrink */
              .hero-trust { gap: 16px; padding-top: 18px; }
              .hero-trust-num { font-size: 18px; }
              .hero-trust-lab { font-size: 10px; }

              /* Dashboard preview stays VISIBLE on mobile (Peter's ask) — but
                 rescaled to fit the narrow viewport without overflow. The phone
                 mockup hides since two stacked floating widgets get noisy. */
              .hero-stage { min-height: 280px; margin-top: 6px; }
              .hero-stage-phone { display: none; }
              .hero-stage-dash {
                padding-right: 0;
                transform: scale(0.62);
                transform-origin: top center;
                inset: 0 -30%;  /* expand bounding box so the scaled-down preview centers nicely */
              }

              /* Pricing + job-site grids collapse to single column */
              .home-grid-2,
              .home-grid-3,
              .home-pricing-grid { grid-template-columns: 1fr; gap: 16px; }

              /* Tighter section padding throughout */
              section { padding-left: 18px !important; padding-right: 18px !important; }
              section h2 { font-size: 28px !important; line-height: 1.1 !important; letter-spacing: -0.6px !important; }
              section h2 br { display: none; }  /* hard-wrapped headings unwrap on mobile */
            }
          `}</style>

          <div className="hero-blob b1" />
          <div className="hero-blob b2" />

          {/* Beach wave silhouettes — brand callback */}
          <svg className="hero-waves" viewBox="0 0 1440 110" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="wave1" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0" />
                <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0.55" />
              </linearGradient>
              <linearGradient id="wave2" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#0AA89F" stopOpacity="0" />
                <stop offset="100%" stopColor="#0AA89F" stopOpacity="0.42" />
              </linearGradient>
            </defs>
            <path d="M0,65 C 240,30 460,80 720,55 C 980,30 1220,75 1440,50 L1440,110 L0,110 Z" fill="url(#wave1)" />
            <path d="M0,80 C 260,55 480,95 720,75 C 960,55 1240,90 1440,72 L1440,110 L0,110 Z" fill="url(#wave2)" />
            <path d="M0,70 C 260,42 480,90 720,62 C 960,38 1240,82 1440,58" stroke="rgba(94,234,212,0.55)" strokeWidth="1.4" fill="none" />
            <path d="M0,86 C 280,60 500,98 720,80 C 940,60 1240,95 1440,78" stroke="rgba(94,234,212,0.32)" strokeWidth="1" fill="none" />
          </svg>

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
              <div className="hero-eyebrow">AI Built for Home Service Pros</div>
              <h1 className="hero-h1">
                Never lose another job<br />
                <span className="accent">to voicemail.</span>
              </h1>
              <p className="hero-sub">
                BellAveGo answers when you can&apos;t, captures the lead, and texts you a summary with the caller&apos;s name, problem, and times they&apos;re available. Pays for itself in one booked job — built for home service teams of 1–15.
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
                  <span className="hero-trust-num">$397</span>
                  <span className="hero-trust-lab">Starting / month</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">30‑day</span>
                  <span className="hero-trust-lab">Money‑back</span>
                </div>
              </div>
            </div>

            <div className="hero-stage">
              <div className="hero-stage-dash">
                <DashboardPreview compact />
              </div>
              <div className="hero-stage-phone">
                <HeroPhone />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONSULTING PREVIEW */}
      <ConsultingShowcase />

      {/* HOW IT WORKS — moved above ROI calculator. Shows the actual mechanic:
          phone rings → AI captures the lead → contractor gets a one-tap text. */}
      <section style={{ padding: '72px 48px', background: '#EAF5F0', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>How it works</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px', color: '#0B1F3A', marginBottom: 12 }}>
              Phone rings. You&apos;re busy.<br />
              <span style={{ color: '#20B2AA' }}>BellAveGo handles it.</span>
            </h2>
            <p style={{ color: '#3D5A62', fontSize: 17, maxWidth: 580, margin: '0 auto', lineHeight: 1.55 }}>
              The AI answers, asks a few questions, and texts you a one-tap summary — caller, problem, when they want it, and your YES/NO buttons.
            </p>
          </div>

          {/* Visual story — 2 images, customer calling on the LEFT, contractor on the right */}
          <div className="home-grid-2" style={{ gap: 24, marginBottom: 36 }}>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/customer.png" alt="Customer calling for a job" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📞 Customer is calling for a job</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>BellAveGo answers in 12 seconds and captures the booking.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/electrician.png" alt="Contractor on the job" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📍 You&apos;re on the job</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Phone rings while you&apos;re driving, on a roof, or under a sink.</p>
              </div>
            </div>
          </div>

          {/* The killer element — a faux SMS notification card showing exactly
              what the contractor sees on their phone. This is the bit Peter
              specifically asked for: caller name, what happened, summary, and
              one-tap actions. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 36, alignItems: 'center', maxWidth: 1000, margin: '0 auto 36px' }} className="hiw-grid">
            <style>{`
              @media (max-width: 820px) {
                .hiw-grid { grid-template-columns: 1fr !important; }
              }
              @keyframes hiwPulse {
                0%, 100% { box-shadow: 0 24px 60px rgba(34,197,94,0.18), 0 0 0 0 rgba(34,197,94,0.4); }
                50% { box-shadow: 0 28px 70px rgba(34,197,94,0.25), 0 0 0 14px rgba(34,197,94,0); }
              }
              .hiw-notif { animation: hiwPulse 3s ease-in-out infinite; }
            `}</style>
            <div>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                What lands on your phone
              </p>
              <h3 style={{ fontSize: 26, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.6px', lineHeight: 1.15, marginBottom: 14 }}>
                A text with everything you need to decide.
              </h3>
              <p style={{ fontSize: 15, color: '#3D5A62', lineHeight: 1.65, marginBottom: 18 }}>
                Who called. What they need. When they want it. Plus four one-tap actions: <strong>book it</strong>, <strong>call back</strong>, <strong>send payment link</strong>, or <strong>decline politely</strong>.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14, color: '#0B1F3A', lineHeight: 1.9 }}>
                {[
                  ['Caller name + phone', 'verified before the AI hangs up'],
                  ['Service requested', 'in the caller’s own words'],
                  ['Address + window', 'when they want you there'],
                  ['One-tap actions', 'YES books it. NO calls them back.'],
                ].map(([k, v]) => (
                  <li key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 0' }}>
                    <span style={{ width: 16, height: 16, background: '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 4 }}>
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5 6.5-7" /></svg>
                    </span>
                    <span><strong>{k}</strong> <span style={{ color: '#7AAAB2' }}>— {v}</span></span>
                  </li>
                ))}
              </ul>
            </div>

            {/* iOS iMessage-style card — what the contractor actually sees */}
            <div className="hiw-notif" style={{
              position: 'relative',
              background: '#FFFFFF',
              borderRadius: 38,
              padding: '14px 0 18px',
              border: '8px solid #1C1C1E',
              maxWidth: 380,
              margin: '0 auto',
              width: '100%',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
              boxShadow: '0 24px 60px rgba(11,31,58,0.18), 0 0 0 1px rgba(0,0,0,0.04)',
            }}>
              {/* iOS status bar — time + signal/wifi/battery */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px 8px', fontSize: 13, fontWeight: 600, color: '#000' }}>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>11:42</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {/* signal */}
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="#000"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="4" y="4" width="3" height="6" rx="0.5"/><rect x="8" y="2" width="3" height="8" rx="0.5"/><rect x="12" y="0" width="3" height="10" rx="0.5"/></svg>
                  {/* wifi */}
                  <svg width="14" height="10" viewBox="0 0 16 12" fill="#000"><path d="M8 11.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM4.2 7.7a5.5 5.5 0 017.6 0l-1.1 1.1a4 4 0 00-5.4 0L4.2 7.7zM1 4.5a10 10 0 0114 0l-1.1 1.1a8.5 8.5 0 00-11.8 0L1 4.5z"/></svg>
                  {/* battery */}
                  <div style={{ width: 22, height: 10, border: '1px solid #000', borderRadius: 2.5, position: 'relative', padding: 1, marginLeft: 1 }}>
                    <div style={{ width: '78%', height: '100%', background: '#000', borderRadius: 1 }} />
                    <div style={{ position: 'absolute', right: -3, top: 2, width: 1.5, height: 4, background: '#000', borderRadius: 1 }} />
                  </div>
                </div>
              </div>

              {/* Contact header — BellAveGo avatar + name centered */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 22px 14px', borderBottom: '1px solid #E5E5EA' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(232,116,43,0.32)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#000' }}>
                  BellAveGo
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="#8E8E93"><path d="M6 12l-4-4 1.4-1.4L6 9.2l6.6-6.6L14 4z"/></svg>
                </div>
              </div>

              {/* Message thread */}
              <div style={{ padding: '14px 16px 6px' }}>
                {/* Date/time stamp — iMessage style centered gray */}
                <div style={{ textAlign: 'center', fontSize: 11, color: '#8E8E93', margin: '0 0 12px', fontWeight: 600 }}>
                  <span style={{ fontWeight: 700 }}>Text Message</span>
                  <span> · Today 11:42 AM</span>
                </div>

                {/* Received bubble — gray #E9E9EB, left-aligned, iMessage radii */}
                <div style={{
                  background: '#E9E9EB',
                  color: '#000',
                  borderRadius: 18,
                  borderBottomLeftRadius: 4,
                  padding: '10px 14px',
                  fontSize: 14.5,
                  lineHeight: 1.42,
                  maxWidth: '88%',
                  fontFamily: 'inherit',
                  letterSpacing: '-0.2px',
                }}>
                  <div style={{ fontWeight: 600 }}>🔔 New job — tap to book</div>
                  <div style={{ marginTop: 6 }}>
                    <strong>Sarah Chen</strong><br />
                    📞 (612) 555-0148<br />
                    🔧 AC not blowing cold — kids home from school<br />
                    📍 4218 Cedar Lake Rd, St. Louis Park<br />
                    🕐 Today, 2&ndash;6 PM
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13.5, color: '#3C3C43' }}>
                    Reply <strong>YES</strong> to book or <strong>NO</strong> to pass.
                  </div>
                </div>

                {/* Apple smart-action chips — appears under rich messages */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, maxWidth: '88%' }}>
                  {[
                    { label: 'YES, book it', bg: '#34C759', color: '#fff' },
                    { label: 'Call back',    bg: '#fff',    color: '#007AFF' },
                    { label: 'Send pay link', bg: '#fff',    color: '#007AFF' },
                    { label: 'NO, pass',     bg: '#fff',    color: '#FF3B30' },
                  ].map(b => (
                    <span key={b.label} style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '7px 14px',
                      borderRadius: 99,
                      background: b.bg,
                      color: b.color,
                      border: b.bg === '#fff' ? '1px solid #E5E5EA' : 'none',
                      fontSize: 13, fontWeight: 600,
                      letterSpacing: '-0.1px',
                    }}>
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* iMessage compose bar at the bottom — visual only */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 0', borderTop: '1px solid #E5E5EA', marginTop: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#E5E5EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 18, color: '#8E8E93', lineHeight: 1, marginTop: -2 }}>+</span>
                </div>
                <div style={{ flex: 1, height: 30, borderRadius: 18, border: '1px solid #E5E5EA', background: '#fff', padding: '0 12px', display: 'flex', alignItems: 'center', fontSize: 13, color: '#C7C7CC' }}>
                  iMessage
                </div>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#8E8E93', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M3 11l18-9-9 18-2-7-7-2z"/></svg>
                </div>
              </div>
            </div>
          </div>

          {/* Three steps below */}
          <div className="home-grid-3" style={{ gap: 18 }}>
            {[
              { n: '1', title: 'Phone rings', desc: 'BellAveGo answers in 12 seconds. Real-sounding voice.' },
              { n: '2', title: 'AI captures the lead', desc: 'Name, address, problem, urgency, preferred window.' },
              { n: '3', title: 'You get a one-tap text', desc: 'Tap YES to book. Done in 30 seconds, 24/7.' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fff', border: '1px solid #D4E6DC', borderRadius: 14, padding: '24px 22px', textAlign: 'left', boxShadow: '0 2px 14px rgba(32,178,170,0.07)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{s.n}</div>
                <div>
                  <p style={{ fontWeight: 800, fontSize: 15, marginBottom: 4, color: '#0B1F3A' }}>{s.title}</p>
                  <p style={{ color: '#4A6670', fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI CALCULATOR — interactive money-on-the-table preview */}
      <RoiCalculator />

      {/* FOUNDER SECTION — story + video placeholder */}
      <FounderSection />

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

      {/* PRICING */}
      <section style={{ padding: '72px 48px', background: '#F2F9F5', borderBottom: '1px solid #D4E6DC', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Pricing</p>
        <h2 style={{ fontSize: 42, fontWeight: 900, marginBottom: 8, letterSpacing: '-1.5px', color: '#0B1F3A' }}>Pay for what you use.</h2>
        <p style={{ color: '#4A6670', fontSize: 16, marginBottom: 48 }}>Your first booked job pays for the whole month.</p>

        <div className="home-pricing-grid" style={{ gap: 20, maxWidth: 960, margin: '0 auto 20px' }}>
          {[
            {
              name: 'Receptionist', price: 397, setup: 250, tier: 'receptionist', calls: 'Up to 250 / mo',
              desc: 'AI answers every call. You close it in one tap — confirm, invoice, call back, or just acknowledge. Includes a welcome AI consulting report and 6 reports/yr.',
              features: ['6 AI consulting reports / year (bi-monthly)', '24/7 AI call answering', 'Captures name · phone · service · address · preferred time', 'Instant text summary to your phone', 'One-tap actions on every call', 'Emergency routing to your cell', 'Live dashboard + full transcripts', 'Welcome AI business diagnostic at activation'],
              popular: false, customCta: false,
            },
            {
              name: 'Office Manager', price: 797, setup: 500, tier: 'officemgr', calls: 'Unlimited',
              desc: 'Your back-office, on autopilot. Five AIs that answer calls, chase quotes, recover invoices, draft review replies, and ask past customers for new reviews.',
              features: ['Everything in Receptionist, plus:', '12 AI consulting reports / year (monthly)', 'Unlimited calls', 'AI Quote Hunter (auto follow-ups day 2/7/14)', 'AI Collections (auto-chase past-due invoices)', 'AI Reviews (drafts replies for one-tap approval)', 'AI Reputation (auto-SMS past customers for reviews)', 'Smart call-summary sales tips with every booking'],
              popular: true, customCta: false,
            },
            {
              name: 'Concierge', price: 1997, setup: 1000, tier: 'concierge', calls: 'Unlimited',
              desc: 'AI runs your back office AND your marketing. Weekly strategy reports, ad creative from your own call transcripts, lead sourcing from permits + storms, competitor intel, local SEO. You just close the work.',
              features: ['Everything in Office Manager, plus:', '52 weekly AI strategy reports + quarterly deep-dive', 'AI Ad Creative Generator (Google + Meta)', 'AI Lead Sourcing (permits + severe-weather alerts)', 'AI Past-Customer Reactivation drips', 'AI Google Business Profile Watcher', 'AI Competitor Watcher (daily intel on 5 competitors)', 'AI Local SEO (weekly WordPress blog posts)', 'Custom AI prompt tuning', 'Priority 4-hour SLA'],
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
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 8.5l3.5 3.5 6.5-7" />
                          </svg>
                        </div>
                      )}
                      <span style={{ fontSize: 12, color: isHeader ? (plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2') : (plan.popular ? 'rgba(255,255,255,0.82)' : '#0B1F3A'), fontWeight: isHeader ? 700 : 500, fontStyle: isHeader ? 'italic' : 'normal', lineHeight: 1.4 }}>{f}</span>
                    </div>
                  )
                })}
              </div>
              {isSignedIn ? (
                <Link href={`/pricing?tier=${plan.tier}&autocheckout=1`} style={{ display: 'block', textAlign: 'center', padding: '13px', background: plan.popular ? '#22C55E' : 'linear-gradient(135deg,#0AA89F,#0D8F87)', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none' }}>
                  Let&apos;s get started →
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
          <span style={{ fontWeight: 700, color: '#0AA89F' }}>Typical $1M HVAC shop sees $18K/mo lift from the 5-AI bundle</span> — 23x return on $797.<br />
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
            <Link href="/dashboard" className="dash-pulse" style={{ padding: '16px 46px', background: 'linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
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
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>The best AI implementation for teams of 1–15 · From $397/mo · 30-day money-back · Cancel anytime</p>
        </div>
      </footer>

      {/* Sticky "Hear the AI live" CTA — bottom-right pill desktop, full-width strip mobile */}
      <StickyDemoCta />

    </main>
  )
}
