'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import DashboardPreview from '@/components/DashboardPreview'
import ConsultingShowcase from '@/components/ConsultingShowcase'
import HeroPhone from '@/components/HeroPhone'
import StickyDemoCta from '@/components/StickyDemoCta'
import { TIER_METADATA as HOMEPAGE_TIER_META, TIER_FEATURES as HOMEPAGE_TIER_FEATURES } from '@/lib/pricing'

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const [logoHovered, setLogoHovered] = useState(false)

  // Bounce-in animation for the mobile dashboard preview. IntersectionObserver
  // fires once the section scrolls into view and adds .is-revealed → CSS
  // keyframes do the scale-pop + settle. Only runs once per page load.
  const mobileDashRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = mobileDashRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add('is-revealed')
            obs.disconnect()
          }
        }
      },
      { threshold: 0.18 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav className="bavg-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 clamp(14px, 4vw, 48px)', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'sticky', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          className="bavg-top-nav-logo"
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
        <div className="bavg-top-nav-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Desktop-only auth + dashboard (mobile gets a single Dashboard
              button below, plus sticky CTA at the bottom of the viewport). */}
          {isSignedIn && (
            <Link href="/dashboard" className="nav-cta dt-only"><span className="nav-cta-text">Dashboard</span></Link>
          )}
          <Link href="/founder" className="why-pulse"><span className="why-pulse-text">Why BellAveGo?</span></Link>
          <Link href="/pricing" className="price-pulse">Pricing</Link>
          {isSignedIn ? (
            <SignOutButton redirectUrl="/">
              <button className="signout-link dt-only">Sign out</button>
            </SignOutButton>
          ) : (
            <>
              <Link href="/sign-in" className="signin-link dt-only">Sign In</Link>
              <Link href="/sign-up" className="nav-cta dt-only"><span className="nav-cta-text">Create Account</span></Link>
            </>
          )}
          {/* Mobile-only: Dashboard + Sign out side-by-side when signed in,
              else just Dashboard (clerk middleware redirects unauthed to
              /sign-in automatically). */}
          <Link href="/dashboard" className="nav-cta mb-only"><span className="nav-cta-text">Dashboard</span></Link>
          {isSignedIn && (
            <SignOutButton redirectUrl="/">
              <button className="signout-link mb-only">Sign out</button>
            </SignOutButton>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative' }}>
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
            background: linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%);
            color: #fff;
            font-weight: 800;
            font-size: clamp(13px, 1.05vw, 16px);
            letter-spacing: -0.2px;
            text-decoration: none;
            border: 1px solid rgba(94,234,212,0.45);
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
            /* Mobile-only dashboard preview — hidden on desktop, overridden
               to display:block inside the (max-width: 768px) media block */
            .mobile-dash-preview { display: none; }
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
            .home-pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); max-width: 1180px; }

            /* ── Tablet ── */
            @media (max-width: 1024px) {
              .hero-grid { grid-template-columns: 1fr; gap: 48px; padding: 56px 28px; }
              .hero-stage { min-height: 420px; }
              .hero-stage-dash { padding-right: 8%; }
              .hero-stage-phone { right: 0; }
            }

            /* ── Mobile (iOS portrait / cold-email-click experience) ── */
            @media (max-width: 768px) {
              /* Top-LEFT alignment for hero content. Tight bottom padding
                 (12px) so the hero ends right after the trust strip — no
                 trailing empty space below the guarantee badge. */
              .hero-grid {
                /* Headline hugs the bottom edge of the nav — top padding 6px.
                 Trust strip is the last thing in the dark navy stage. */
                padding: 6px 22px 8px !important;
                gap: 12px !important;
                grid-template-columns: 1fr !important;
                text-align: left !important;
                align-items: flex-start !important;
                justify-items: flex-start !important;
                min-height: 0 !important;
              }
              .hero-grid > div { text-align: left; width: 100%; }
              .hero-eyebrow { font-size: 11px; margin-bottom: 12px; padding: 5px 11px; }
              /* Bigger headline that stretches wider — fills the column. */
              .hero-h1 {
                font-size: clamp(46px, 13vw, 60px) !important;
                line-height: 1.0 !important;
                margin-bottom: 14px !important;
                margin-top: 0 !important;
                letter-spacing: -0.035em !important;
                text-align: left !important;
              }
              .hero-sub { font-size: 15.5px; line-height: 1.45; margin-bottom: 18px; max-width: 100%; text-align: left; }

              /* CTAs become full-width thumb-targets, explicitly centered.
                 The !important on width / box-sizing prevents content from
                 spilling outside the button on narrow viewports. */
              .hero-actions {
                gap: 10px !important;
                margin-bottom: 22px !important;
                flex-direction: column !important;
                align-items: stretch !important;
                width: 100% !important;
              }
              .hero-cta-primary,
              .hero-cta-secondary {
                width: 100% !important;
                box-sizing: border-box !important;
                justify-content: center !important;
                align-items: center !important;
                text-align: center !important;
                padding: 14px 16px !important;
                white-space: normal !important;  /* allow wrap so nothing clips */
              }
              /* Secondary CTA — 2-line layout on mobile: label on top, phone
                 number beneath in slightly smaller / dimmer type. Desktop
                 collapses these into one inline string. */
              .hero-cta-secondary { flex-direction: row; gap: 10px !important; }
              .hero-cta-secondary-label {
                display: flex !important;
                flex-direction: column !important;
                align-items: flex-start !important;
                line-height: 1.2 !important;
                gap: 1px;
              }
              .hero-cta-secondary-sep { display: none !important; }
              .hero-cta-secondary-line2 {
                font-size: 12.5px !important;
                opacity: 0.75;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
              }

              /* Trust badges — 2x2 grid on mobile so they don't crush */
              .hero-trust {
                display: grid !important;
                grid-template-columns: 1fr 1fr;
                gap: 14px 22px;
                padding-top: 18px;
                max-width: 100%;
              }
              .hero-trust-num { font-size: 22px; }
              .hero-trust-lab { font-size: 10.5px; }

              /* Dashboard preview + floating phone — HIDDEN on mobile.
                 The earlier scale(0.62) + margin-bottom: -38% hack made
                 the dashboard preview overlap the consulting section
                 below. The hero already carries the load: H1 + sub +
                 CTAs + trust badges. Dropping the decorative preview
                 keeps the hero clean and the page scrolls quicker into
                 the value props. */
              .hero-stage { display: none !important; }
              .hero-stage-dash,
              .hero-stage-phone { display: none !important; }
              /* Show the mobile-only dashboard preview section
                 (hidden on desktop where the hero already shows it) */
              .mobile-dash-preview { display: block !important; padding: 40px 0 8px !important; }

              /* Hero — DESKTOP teal-blue gradient applied to mobile too AND
                 fixed to the viewport so the dashboard-preview section
                 below can SHARE the exact same backdrop. Result: hero +
                 preview look like one continuous beach surface, no
                 visible seam, same orange/teal/cyan glows behind both. */
              .hero-wrap {
                margin-left: -18px !important;
                margin-right: -18px !important;
                width: calc(100% + 36px) !important;
                min-height: 0 !important;
                position: relative;
                background:
                  radial-gradient(800px 400px at 88% 8%, rgba(255,157,90,0.22), transparent 60%),
                  radial-gradient(900px 500px at 72% 28%, rgba(232,116,43,0.16), transparent 65%),
                  radial-gradient(1100px 600px at 78% 55%, rgba(10,168,159,0.26), transparent 65%),
                  radial-gradient(900px 700px at 12% 85%, rgba(94,234,212,0.20), transparent 70%),
                  linear-gradient(180deg, #050E1F 0%, #0B1F3A 35%, #0F3454 78%, #2D7A92 100%) !important;
                background-attachment: fixed !important;
                background-size: cover !important;
                overflow: hidden;
              }
              /* No grid-mesh overlay on the teal hero — it muddied the colors. */
              .hero-wrap::before { display: none !important; }
              .hero-wrap::after { display: none !important; }
              /* Hide ALL svg overlays + decorative blobs on mobile — they
                 were creating perceived empty wallpaper between the nav
                 and the headline. Now hero is dark navy + grid mesh ONLY. */
              .hero-wrap svg { display: none !important; }
              .hero-blob { display: none !important; }
              .hero-wrap > * { position: relative; z-index: 1; }
              /* Force hero-wrap to be content-height only — no inherited
                 min-height, no auto stretching. Bg ends right at the trust
                 strip's bottom edge. */
              .hero-wrap {
                height: auto !important;
                max-height: none !important;
              }
              /* White headline + subhead on the dark navy bg */
              .hero-h1 { color: #fff !important; }
              .hero-h1 .accent {
                background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B) !important;
                -webkit-background-clip: text !important;
                background-clip: text !important;
                color: transparent !important;
              }
              .hero-sub { color: rgba(226, 235, 240, 0.88) !important; }
              .hero-eyebrow {
                background: rgba(94,234,212,0.10) !important;
                color: #5EEAD4 !important;
                border-color: rgba(94,234,212,0.32) !important;
              }
              .hero-cta-secondary {
                background: rgba(94,234,212,0.10) !important;
                border: 1.5px solid rgba(94,234,212,0.55) !important;
                color: #5EEAD4 !important;
                box-shadow:
                  0 0 24px rgba(94,234,212,0.45),
                  0 0 48px rgba(10,168,159,0.32) !important;
                animation: heroSecondaryGlow 2.4s ease-in-out infinite !important;
              }
              @keyframes heroSecondaryGlow {
                0%,100% { box-shadow: 0 0 24px rgba(94,234,212,0.45), 0 0 48px rgba(10,168,159,0.32); }
                50%      { box-shadow: 0 0 36px rgba(94,234,212,0.70), 0 0 64px rgba(10,168,159,0.50); }
              }
              .hero-cta-secondary svg { color: #5EEAD4 !important; }
              /* Trust strip text → light cream for legibility */
              .hero-trust-num { color: #FFD9A8 !important; }
              .hero-trust-lab { color: rgba(226,235,240,0.72) !important; }

              /* Pricing grid — 1-col stacked (Peter wants each card
                 stretched full-width), tight gaps to kill dead space. */
              .home-grid-2,
              .home-grid-3,
              .home-pricing-grid {
                grid-template-columns: 1fr !important;
                gap: 14px !important;
              }

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
              <div className="hero-eyebrow">Built for HVAC, Plumbing, Electrical, Roofing, and Handyman pros</div>
              <h1 className="hero-h1">
                Never lose another job<br />
                <span className="accent">to voicemail.</span>
              </h1>
              {/* Subhead — desktop keeps the long sales-y version, mobile
                  gets a short scannable one. Both Pads use the same .hero-sub
                  base styles; .dt-only / .mb-only-block control visibility. */}
              <p className="hero-sub dt-only-block">
                BellAveGo answers when you can&apos;t, captures the job, and texts you the details in 20 seconds. One booked job pays for the month.
              </p>
              <p className="hero-sub mb-only-block">
                BellAveGo answers missed calls, captures the job, and texts you the next step in seconds.
              </p>

              <div className="hero-actions">
                <Link href={isSignedIn ? '/dashboard' : '/sign-up'} className="hero-cta-primary">
                  {/* Desktop reads "Get Started" / "Open Dashboard"; mobile
                      always reads "Open Dashboard" (the unsigned path still
                      sends them to sign-up via the href above). */}
                  <span className="dt-only-inline">{isSignedIn ? 'Open Dashboard' : 'Get Started'}</span>
                  <span className="mb-only-inline">Open Dashboard</span>
                  <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
                <a href="tel:+16514677829" className="hero-cta-secondary" title="Tap to dial on mobile · (651) 467-7829">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  {/* Desktop: single inline line. Mobile: label on top,
                      phone number on a smaller line beneath. */}
                  <span className="hero-cta-secondary-label">
                    <span className="hero-cta-secondary-line1">Call the AI Demo</span>
                    <span className="hero-cta-secondary-sep"> · </span>
                    <span className="hero-cta-secondary-line2">(651) 467-7829</span>
                  </span>
                </a>
              </div>

              <div className="hero-trust">
                <div className="hero-trust-item">
                  <span className="hero-trust-num">100%</span>
                  <span className="hero-trust-lab">Picked up before voicemail</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">10s</span>
                  <span className="hero-trust-lab">Call summary after every call</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">24/7</span>
                  <span className="hero-trust-lab">Always on</span>
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

      {/* MOBILE-ONLY dashboard preview — the desktop hero shows the
          dashboard at the right of the headline; that block is hidden on
          mobile (.hero-stage display:none). Surface it here so mobile
          visitors still see what they're getting before they hit the
          lead reports section. CSS class hides this on desktop. */}
      <section className="mobile-dash-preview" ref={mobileDashRef}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 8px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.16em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
            What you see when you log in
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#5EEAD4', letterSpacing: '-0.6px', textAlign: 'center', marginBottom: 18, lineHeight: 1.18 }}>
            Every call, lead and dollar — live, in one place.
          </div>
          <DashboardPreview compact />
        </div>
      </section>

      {/* CONSULTING PREVIEW */}
      <ConsultingShowcase />

      {/* APPOINTMENTS — Two-mode workflow.
          One section, both modes BellAveGo handles new jobs:
          (a) MANUAL — texts the owner a summary with one-tap actions
          (b) AUTO   — checks calendar, books, writes the event
          Replaces the prior HOW IT WORKS + CALENDAR SYNC sections so the
          page communicates flexibility ("pick your mode") instead of two
          disconnected workflows. iMessage frames + Google Calendar mock
          are intentionally specific so the value lands in <5 seconds. */}
      <section className="appt-section" style={{
        padding: '92px 48px',
        background: 'linear-gradient(180deg, #FFF8F0 0%, #FFF1E2 50%, #FFF8F0 100%)',
        borderBottom: '1px solid rgba(232,116,43,0.16)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <style>{`
          @keyframes apptPulse {
            0%, 100% { box-shadow: 0 20px 50px rgba(11,31,58,0.16), 0 0 0 1px rgba(0,0,0,0.04); }
            50%      { box-shadow: 0 26px 64px rgba(11,31,58,0.22), 0 0 0 1px rgba(0,0,0,0.04); }
          }
          .appt-phone { animation: apptPulse 3.6s ease-in-out infinite; }
          .appt-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 26px;
            max-width: 1180px;
            margin: 0 auto 44px;
          }
          .appt-card {
            background: #FFFFFF;
            border-radius: 22px;
            padding: 30px 28px 28px;
            border: 1px solid rgba(232,116,43,0.16);
            box-shadow: 0 14px 40px rgba(11,31,58,0.06);
            display: flex;
            flex-direction: column;
            gap: 22px;
            transition: transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.32s ease, border-color 0.32s ease;
          }
          .appt-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 26px 60px rgba(11,31,58,0.10);
          }
          .appt-card-manual:hover { border-color: rgba(232,116,43,0.42); }
          .appt-card-auto:hover   { border-color: rgba(10,168,159,0.42); }
          .appt-step-num {
            width: 26px; height: 26px; border-radius: 8px;
            color: #fff; font-weight: 900; font-size: 12.5px;
            display: inline-flex; align-items: center; justify-content: center;
            flex-shrink: 0;
          }
          .appt-step-num.sunset { background: linear-gradient(135deg, #FF9D5A, #E8742B); }
          .appt-step-num.teal   { background: linear-gradient(135deg, #14B8A6, #0AA89F); }
          .appt-toggle {
            display: inline-flex;
            padding: 5px;
            border-radius: 14px;
            background: #fff;
            border: 1px solid rgba(232,116,43,0.22);
            box-shadow: 0 8px 22px rgba(11,31,58,0.06);
            gap: 4px;
          }
          .appt-toggle-seg {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 10px 18px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: -0.1px;
            color: #0B1F3A;
          }
          .appt-toggle-seg.is-manual { background: linear-gradient(135deg, rgba(255,157,90,0.18), rgba(232,116,43,0.10)); color: #C84B26; }
          .appt-toggle-seg.is-auto   { background: linear-gradient(135deg, rgba(20,184,166,0.18), rgba(10,168,159,0.10)); color: #0AA89F; }
          .appt-toggle-dot {
            width: 8px; height: 8px; border-radius: 50%;
          }
          .appt-chip {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 5px 12px;
            border-radius: 999px;
            font-size: 10.5px;
            font-weight: 900;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-bottom: 12px;
          }
          .appt-chip-sunset { background: rgba(232,116,43,0.10); color: #C84B26; }
          .appt-chip-teal   { background: rgba(10,168,159,0.10); color: #0AA89F; }
          @media (max-width: 920px) {
            .appt-section { padding: 56px 18px !important; }
            .appt-grid { gap: 18px; }
          }
          /* Phone-specific layout — STACK the two mode cards vertically
             instead of squeezing them into 175px-wide columns with a
             zoom: 0.62 hack. Each card gets the full screen width so
             the iPhone-mockup messages are actually readable. */
          @media (max-width: 720px) {
            .appt-section { padding: 48px 16px !important; }
            .appt-grid {
              grid-template-columns: 1fr !important;
              gap: 16px !important;
              margin-bottom: 28px !important;
            }
            .appt-card {
              padding: 22px 18px 18px !important;
              gap: 16px !important;
              border-radius: 18px !important;
            }
            .appt-card header h3 { font-size: 19px !important; line-height: 1.2 !important; margin: 0 0 6px !important; }
            .appt-card header p  { font-size: 13px !important; line-height: 1.5 !important; }
            .appt-chip {
              font-size: 9.5px !important;
              padding: 4px 9px !important;
              margin-bottom: 10px !important;
            }
            /* Phone mockup is full-width inside the now-stacked card, so
               drop the zoom hack and let it render at native size. */
            .appt-phone {
              max-width: 320px !important;
              margin: 0 auto !important;
            }
            .appt-card-auto > div:nth-of-type(2) {
              max-width: 320px !important;
              margin: 0 auto !important;
            }
            .appt-card ol { gap: 8px !important; }
            .appt-card ol li { font-size: 13px !important; line-height: 1.5 !important; }
            /* Two-mode toggle visual gets pushed down a bit on mobile too */
            .appt-toggle { transform: scale(0.92); transform-origin: center; }
          }
        `}</style>

        {/* background sunset glows */}
        <div aria-hidden style={{ position: 'absolute', top: '-12%', right: '-8%', width: 540, height: 540, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,116,43,0.18), transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', bottom: '-14%', left: '-8%', width: 540, height: 540, borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,184,166,0.14), transparent 65%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1180, margin: '0 auto', position: 'relative' }}>

          {/* Eyebrow pill */}
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(232,116,43,0.28)', fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Two ways to handle appointments
            </span>
          </div>

          {/* Heading */}
          <h2 style={{ fontSize: 'clamp(26px, 4.2vw, 46px)', fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1.05, color: '#0B1F3A', textAlign: 'center', maxWidth: 'min(880px, 100%)', margin: '0 auto 14px', padding: '0 12px' }}>
            You stay in control.{' '}
            <span style={{ background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 55%, #C84B26 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>BellAveGo handles the call.</span>
          </h2>

          {/* Subheading */}
          <p style={{ fontSize: 17, color: '#3D5A62', lineHeight: 1.6, maxWidth: 720, margin: '0 auto 28px', textAlign: 'center' }}>
            Connect your calendar for automatic booking, or keep it manual and approve every job from a text.
          </p>

          {/* Toggle visual — non-functional, communicates duality */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 44 }}>
            <div className="appt-toggle">
              <div className="appt-toggle-seg is-manual">
                <span className="appt-toggle-dot" style={{ background: '#E8742B' }} />
                Manual approval
              </div>
              <div className="appt-toggle-seg is-auto">
                <span className="appt-toggle-dot" style={{ background: '#0AA89F' }} />
                Auto-booking
              </div>
            </div>
            <p style={{ fontSize: 11, color: '#7AAAB2', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, margin: 0 }}>
              Both modes available · switch anytime
            </p>
          </div>

          {/* Two-card comparison */}
          <div className="appt-grid">

            {/* ── LEFT — Text me first (manual approval) ─────────────── */}
            <article className="appt-card appt-card-manual">
              <header>
                <span className="appt-chip appt-chip-sunset">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E8742B' }} />
                  No calendar required
                </span>
                <h3 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', margin: '0 0 8px' }}>
                  Text me first
                </h3>
                <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>
                  BellAveGo answers the call, captures the details, and texts you everything you need to decide.
                </p>
              </header>

              {/* iPhone — manual mode iMessage */}
              <div className="appt-phone" style={{
                position: 'relative',
                background: '#FFFFFF',
                borderRadius: 36,
                padding: '12px 0 16px',
                border: '7px solid #1C1C1E',
                maxWidth: 330,
                margin: '0 auto',
                width: '100%',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
              }}>
                {/* iOS status bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 6px', fontSize: 12.5, fontWeight: 600, color: '#000' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>11:42</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="16" height="10" viewBox="0 0 16 10" fill="#000"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="4" y="4" width="3" height="6" rx="0.5"/><rect x="8" y="2" width="3" height="8" rx="0.5"/><rect x="12" y="0" width="3" height="10" rx="0.5"/></svg>
                    <svg width="14" height="10" viewBox="0 0 16 12" fill="#000"><path d="M8 11.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM4.2 7.7a5.5 5.5 0 017.6 0l-1.1 1.1a4 4 0 00-5.4 0L4.2 7.7zM1 4.5a10 10 0 0114 0l-1.1 1.1a8.5 8.5 0 00-11.8 0L1 4.5z"/></svg>
                    <div style={{ width: 22, height: 10, border: '1px solid #000', borderRadius: 2.5, position: 'relative', padding: 1, marginLeft: 1 }}>
                      <div style={{ width: '78%', height: '100%', background: '#000', borderRadius: 1 }} />
                      <div style={{ position: 'absolute', right: -3, top: 2, width: 1.5, height: 4, background: '#000', borderRadius: 1 }} />
                    </div>
                  </div>
                </div>

                {/* Contact header */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 22px 12px', borderBottom: '1px solid #E5E5EA' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(232,116,43,0.32)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#000' }}>BellAveGo</div>
                </div>

                {/* Message thread */}
                <div style={{ padding: '12px 14px 4px' }}>
                  <div style={{ textAlign: 'center', fontSize: 10.5, color: '#8E8E93', margin: '0 0 10px', fontWeight: 600 }}>
                    <span style={{ fontWeight: 700 }}>Text Message</span>
                    <span> · Today 11:42 AM</span>
                  </div>

                  <div style={{
                    background: '#E9E9EB',
                    color: '#000',
                    borderRadius: 17,
                    borderBottomLeftRadius: 4,
                    padding: '10px 14px',
                    fontSize: 13.5,
                    lineHeight: 1.42,
                    maxWidth: '92%',
                    letterSpacing: '-0.2px',
                  }}>
                    <div style={{ fontWeight: 700 }}>New job request — Sarah Chen</div>
                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      <strong>Needs:</strong> AC not blowing cold<br />
                      <strong>Address:</strong> 4218 Cedar Lake Rd<br />
                      <strong>Preferred:</strong> Today, 2&ndash;4 PM<br />
                      <strong>Caller said:</strong> kids home from school, needs help today
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12.5, color: '#3C3C43' }}>
                      Reply <strong>YES</strong> to confirm, <strong>NO</strong> to pass, or call Sarah back.
                    </div>
                  </div>

                  {/* Action chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, maxWidth: '92%' }}>
                    {[
                      { label: 'Yes, book it', bg: '#34C759', color: '#fff' },
                      { label: 'Call back',     bg: '#fff',    color: '#007AFF' },
                      { label: 'Send pay link', bg: '#fff',    color: '#007AFF' },
                    ].map(b => (
                      <span key={b.label} style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '6px 13px',
                        borderRadius: 99,
                        background: b.bg,
                        color: b.color,
                        border: b.bg === '#fff' ? '1px solid #E5E5EA' : 'none',
                        fontSize: 12.5, fontWeight: 600,
                        letterSpacing: '-0.1px',
                      }}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3-step flow */}
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  'BellAveGo answers the missed call',
                  'Customer explains what they need',
                  'You get a text with approve, call back, or payment options',
                ].map((s, i) => (
                  <li key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span className="appt-step-num sunset">{i + 1}</span>
                    <span style={{ fontSize: 13.5, color: '#0B1F3A', lineHeight: 1.5, fontWeight: 500 }}>{s}</span>
                  </li>
                ))}
              </ol>
            </article>

            {/* ── RIGHT — Book it automatically (auto-booking) ───────── */}
            <article className="appt-card appt-card-auto">
              <header>
                <span className="appt-chip appt-chip-teal">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px rgba(34,197,94,0.7)' }} />
                  Calendar connected
                </span>
                <h3 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', margin: '0 0 8px' }}>
                  Book it automatically
                </h3>
                <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>
                  When your calendar is connected, BellAveGo checks your availability, confirms the time, and adds the job automatically.
                </p>
              </header>

              {/* iPhone — auto mode confirmation */}
              <div className="appt-phone" style={{
                position: 'relative',
                background: '#FFFFFF',
                borderRadius: 36,
                padding: '12px 0 16px',
                border: '7px solid #1C1C1E',
                maxWidth: 330,
                margin: '0 auto',
                width: '100%',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 6px', fontSize: 12.5, fontWeight: 600, color: '#000' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>11:42</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="16" height="10" viewBox="0 0 16 10" fill="#000"><rect x="0" y="6" width="3" height="4" rx="0.5"/><rect x="4" y="4" width="3" height="6" rx="0.5"/><rect x="8" y="2" width="3" height="8" rx="0.5"/><rect x="12" y="0" width="3" height="10" rx="0.5"/></svg>
                    <svg width="14" height="10" viewBox="0 0 16 12" fill="#000"><path d="M8 11.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4zM4.2 7.7a5.5 5.5 0 017.6 0l-1.1 1.1a4 4 0 00-5.4 0L4.2 7.7zM1 4.5a10 10 0 0114 0l-1.1 1.1a8.5 8.5 0 00-11.8 0L1 4.5z"/></svg>
                    <div style={{ width: 22, height: 10, border: '1px solid #000', borderRadius: 2.5, position: 'relative', padding: 1, marginLeft: 1 }}>
                      <div style={{ width: '78%', height: '100%', background: '#000', borderRadius: 1 }} />
                      <div style={{ position: 'absolute', right: -3, top: 2, width: 1.5, height: 4, background: '#000', borderRadius: 1 }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 22px 12px', borderBottom: '1px solid #E5E5EA' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(232,116,43,0.32)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#000' }}>BellAveGo</div>
                </div>

                <div style={{ padding: '12px 14px 4px' }}>
                  <div style={{ textAlign: 'center', fontSize: 10.5, color: '#8E8E93', margin: '0 0 10px', fontWeight: 600 }}>
                    <span style={{ fontWeight: 700 }}>Text Message</span>
                    <span> · Today 11:43 AM</span>
                  </div>

                  <div style={{
                    background: '#E9E9EB',
                    color: '#000',
                    borderRadius: 17,
                    borderBottomLeftRadius: 4,
                    padding: '10px 14px',
                    fontSize: 13.5,
                    lineHeight: 1.42,
                    maxWidth: '92%',
                    letterSpacing: '-0.2px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, color: '#0B7A3A' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B7A3A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                      Appointment booked
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13 }}>
                      <strong>Sarah Chen</strong><br />
                      AC repair<br />
                      Today, 2:30 PM<br />
                      4218 Cedar Lake Rd
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12.5, color: '#3C3C43', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="4.5" width="18" height="16.5" rx="2" fill="#fff" stroke="#3C3C43" strokeWidth="1.6"/>
                        <rect x="3" y="4.5" width="18" height="4" rx="2" fill="#4285F4"/>
                        <line x1="8" y1="2.5" x2="8" y2="6.5" stroke="#3C3C43" strokeWidth="1.6" strokeLinecap="round"/>
                        <line x1="16" y1="2.5" x2="16" y2="6.5" stroke="#3C3C43" strokeWidth="1.6" strokeLinecap="round"/>
                      </svg>
                      Added to Google Calendar
                    </div>
                  </div>
                </div>
              </div>

              {/* Google Calendar event card */}
              <div style={{
                background: '#FFFFFF',
                borderRadius: 14,
                border: '1px solid #E1E5EA',
                boxShadow: '0 8px 22px rgba(11,31,58,0.08)',
                overflow: 'hidden',
                maxWidth: 330,
                width: '100%',
                margin: '0 auto',
                fontFamily: '"Google Sans", Roboto, system-ui, sans-serif',
              }}>
                {/* Calendar header strip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid #E8EAED', background: '#F8FAFC' }}>
                  {/* Google Calendar logo */}
                  <div style={{ position: 'relative', width: 22, height: 22, borderRadius: 4, overflow: 'hidden', flexShrink: 0, boxShadow: '0 1px 3px rgba(11,31,58,0.18)' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '50%', height: '50%', background: '#4285F4' }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '50%', background: '#EA4335' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: '50%', height: '50%', background: '#34A853' }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: '50%', height: '50%', background: '#FBBC04' }} />
                    <div style={{ position: 'absolute', inset: 3.5, background: '#fff', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, fontWeight: 800, color: '#1F2937' }}>17</div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#202124' }}>Google Calendar</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5F6368' }}>Today</div>
                </div>

                {/* Event card */}
                <div style={{ display: 'flex', gap: 11, padding: '14px 14px 16px' }}>
                  <div style={{ width: 4, borderRadius: 2, background: '#33B679', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#202124', letterSpacing: '-0.1px', marginBottom: 4, lineHeight: 1.25 }}>
                      AC Repair &mdash; Sarah Chen
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#3C4043', marginBottom: 4 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      Today, 2:30 PM &ndash; 3:30 PM
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, color: '#3C4043', marginBottom: 10 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2, flexShrink: 0 }}>
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span>4218 Cedar Lake Rd</span>
                    </div>
                    <div style={{ paddingTop: 10, borderTop: '1px solid #E8EAED', fontSize: 12, color: '#5F6368', lineHeight: 1.5 }}>
                      Customer says AC is not blowing cold. Kids are home from school. High urgency.
                    </div>
                  </div>
                </div>
              </div>

              {/* 3-step flow */}
              <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  'BellAveGo checks your calendar',
                  'Customer picks an open time',
                  'Appointment is booked and added to your calendar',
                ].map((s, i) => (
                  <li key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span className="appt-step-num teal">{i + 1}</span>
                    <span style={{ fontSize: 13.5, color: '#0B1F3A', lineHeight: 1.5, fontWeight: 500 }}>{s}</span>
                  </li>
                ))}
              </ol>
            </article>
          </div>

          {/* Trust copy — closer for the section. Pricing section follows. */}
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px', margin: '0 0 6px' }}>
              Start manual. Connect your calendar later.
            </p>
            <p style={{ fontSize: 14, color: '#4A6670', margin: 0, lineHeight: 1.55 }}>
              BellAveGo works whether you want full control or full automation.
            </p>
          </div>
        </div>
      </section>

      {/* ROI CALCULATOR + FOUNDER SECTION both moved to /founder per Peter —
          homepage is now Hero → Consulting → Appointments (2-mode) → Industries → Pricing → CTA. */}

      {/* PRICING — Grand Slam Hormozi single offer card (mirrors /pricing) */}
      <section style={{ padding: '72px 24px 40px', background: '#F2F9F5', borderBottom: '1px solid #D4E6DC', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ background: 'rgba(220,38,38,0.10)', color: '#DC2626', fontSize: 12, fontWeight: 800, padding: '6px 14px', borderRadius: 999, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
            🔥 Founding-100 · $297 locked for life
          </div>
          <div style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', fontSize: 12, fontWeight: 800, padding: '6px 14px', borderRadius: 999, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
            🎯 30-day money back
          </div>
        </div>
        <h2 style={{ fontSize: 'clamp(32px, 4.4vw, 52px)', fontWeight: 900, marginBottom: 14, letterSpacing: '-1.5px', color: '#0B1F3A', lineHeight: 1.05 }}>
          Never miss another job.<br/>
          <span style={{ background: 'linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 50%, #0AA89F 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Try risk-free for 30 days.</span>
        </h2>
        <p style={{ color: '#4A6670', fontSize: 16, marginBottom: 36, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
          Use it 30 days. If you don&apos;t love it, click one button in your dashboard. Full refund. No questions.
        </p>

        <div style={{
          maxWidth: 720, margin: '0 auto',
          background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)',
          borderRadius: 24,
          padding: 'clamp(28px, 4vw, 44px)',
          color: '#fff',
          position: 'relative',
          boxShadow: '0 32px 80px rgba(11,31,58,0.32)',
          textAlign: 'left',
        }}>
          <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#0B1F3A', fontSize: 11, fontWeight: 900, padding: '6px 18px', borderRadius: 20, letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(232,116,43,0.38)' }}>
            🔥 The Whole Thing
          </div>

          {/* Price */}
          <div style={{ textAlign: 'center', marginBottom: 22, marginTop: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: 'rgba(255,255,255,0.45)', marginTop: 18 }}>$</span>
              <span style={{ fontSize: 86, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-3px' }}>297</span>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600, alignSelf: 'flex-end', marginBottom: 18, marginLeft: 6 }}>/mo</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '4px 0 0', fontWeight: 600 }}>
              Or $2,970/yr (save $594). Cancel anytime.
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '6px 0 0' }}>
              Lifetime price lock — your rate never goes up.
            </p>
          </div>

          {/* Value stack */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '20px 22px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 900, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 14px' }}>
              📦 Here&apos;s everything you get
            </p>
            {[
              { item: '24/7 AI receptionist · UNLIMITED calls answered', val: '$200/mo' },
              { item: 'Auto-books appointments to your calendar live', val: '$97/mo' },
              { item: '5 fresh neighborhood leads delivered every Monday', val: '$500/mo' },
              { item: 'AI pitch script for every lead', val: '$50/mo' },
              { item: 'FREE dedicated phone number', val: '$50/mo' },
              { item: 'FREE white-glove onboarding (<10 min)', val: '$500 once' },
              { item: 'Lifetime price lock — never raised', val: 'priceless' },
              { item: "Performance guarantee — refund if it doesn't work", val: 'risk-free' },
            ].map((row) => (
              <div key={row.item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                <div style={{ width: 18, height: 18, background: '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 8.5l3.5 3.5 6.5-7" />
                  </svg>
                </div>
                <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5, flex: 1 }}>{row.item}</span>
                <span style={{ fontSize: 11, color: 'rgba(94,234,212,0.85)', fontWeight: 800, whiteSpace: 'nowrap' }}>{row.val}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed rgba(255,255,255,0.18)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>Total equivalent value:</span>
                <span style={{ fontSize: 18, color: '#fff', fontWeight: 900, textDecoration: 'line-through', textDecorationColor: 'rgba(220,38,38,0.7)' }}>$847/mo + $500</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, color: '#22C55E', fontWeight: 800 }}>Your price today:</span>
                <span style={{ fontSize: 22, color: '#5EEAD4', fontWeight: 900 }}>$297/mo</span>
              </div>
            </div>
          </div>

          <Link href="/pricing" style={{
            display: 'block', textAlign: 'center',
            padding: '18px',
            background: '#22C55E',
            borderRadius: 12,
            color: '#fff',
            fontWeight: 900,
            fontSize: 17,
            textDecoration: 'none',
            boxShadow: '0 12px 32px rgba(34,197,94,0.42)',
            letterSpacing: '-0.01em',
          }}>
            Start now — $297/mo →
          </Link>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
            Card collected upfront. Cancel anytime in 1 click.
          </p>
        </div>

        {/* Performance guarantee block — mirror /pricing */}
        <div style={{
          maxWidth: 720,
          margin: '32px auto 0',
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
          border: '3px solid #F59E0B',
          borderRadius: 20,
          padding: '28px 32px',
          textAlign: 'center',
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)', background: '#F59E0B', color: '#fff', fontSize: 12, fontWeight: 900, padding: '6px 16px', borderRadius: 20, letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            🏆 Our Guarantee
          </div>
          <h3 style={{ fontSize: 24, fontWeight: 900, color: '#92400E', letterSpacing: '-0.5px', marginBottom: 10, marginTop: 12 }}>
            30 days. Full refund. Zero hoops.
          </h3>
          <p style={{ fontSize: 14, color: '#78350F', lineHeight: 1.55, maxWidth: 560, margin: '0 auto' }}>
            If BellAveGo isn&apos;t working for your shop in the first 30 days, cancel from your dashboard in one click. We refund your most recent payment immediately. Same-week back on your card.
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '88px 48px', background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 50px)', fontWeight: 900, marginBottom: 16, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.1 }}>
          Stop letting missed calls<br />become missed jobs.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 17, maxWidth: 460, margin: '0 auto 40px', lineHeight: 1.8 }}>
          Sign up in 5 minutes. The AI is live before you finish your next job.
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
          <a href="tel:+16514677829" style={{ padding: '16px 30px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none' }} title="Tap to dial on mobile · live AI demo">
            📞 (651) 467-7829
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '44px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Image src="/logo.png" alt="BellAveGo" width={300} height={100} style={{ objectFit: 'contain' }} />
          <p style={{ margin: 0, fontSize: 14, color: '#7AAAB2', fontStyle: 'italic' }}>We don&apos;t just answer calls. We grow your business.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>AI receptionist for HVAC, plumbing, electrical, roofing, and handyman pros · $297/mo · 30-day money-back guarantee · Cancel anytime</p>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: '#3D5A62' }}>
            <Link href="/privacy" style={{ color: '#7AAAB2', textDecoration: 'none' }}>Privacy</Link>
            {' · '}
            <Link href="/terms" style={{ color: '#7AAAB2', textDecoration: 'none' }}>Terms</Link>
            {' · '}
            © 2026 BellAveGo LLC
          </p>
        </div>
      </footer>

      {/* Sticky "Hear the AI live" CTA — bottom-right pill desktop, full-width strip mobile */}
      <StickyDemoCta />

    </main>
  )
}
