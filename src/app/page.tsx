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
              <Link href="/sign-up" className="cta-pulse" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
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
        <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1440/480', overflow: 'hidden' }}>
            <HeroShowcase />

            {/* Left vignette — darkens sky/foam so white text reads cleanly */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(4,18,42,0.78) 0%, rgba(4,18,42,0.55) 30%, rgba(4,18,42,0.20) 55%, rgba(4,18,42,0) 75%)', zIndex: 1, pointerEvents: 'none' }} />

            {/* Headline column */}
            <div style={{ position: 'absolute', top: '18%', left: '4%', width: '44%', zIndex: 2, lineHeight: 1.2 }}>
              <p style={{ fontSize: 'clamp(10px, 0.85vw, 13px)', fontWeight: 700, color: 'rgba(255,196,76,0.95)', letterSpacing: '2.5px', textTransform: 'uppercase', margin: '0 0 clamp(10px, 1.4vw, 20px) 0' }}>
                AI Receptionist · 24/7
              </p>
              <h1 style={{ fontSize: 'clamp(20px, 3.0vw, 50px)', fontWeight: 900, color: '#5EEAD4', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 clamp(12px, 1.8vw, 26px) 0', textShadow: '0 2px 30px rgba(0,0,0,0.85), 0 0 28px rgba(10,168,159,0.55)' }}>
                Stop losing jobs<br />to missed calls.
              </h1>
              <p style={{ fontSize: 'clamp(11px, 1.0vw, 16px)', color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: '0 0 clamp(16px, 2.2vw, 28px) 0', textShadow: '0 1px 8px rgba(0,0,0,0.55)' }}>
                BellAveGo answers when you can&apos;t, books the job,<br />and texts your customer — automatically.
              </p>
              <Link href={isSignedIn ? '/dashboard' : '/sign-up'} className="hero-cta">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {isSignedIn ? 'Open Dashboard' : 'Get started'}
                <svg className="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
            </div>

            {/* Notification stack — right side */}
            <div style={{ position: 'absolute', top: '5%', right: '2.5%', width: '28%', height: '90%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', zIndex: 2 }}>

              <div className="notif-card" style={{ animationDelay: '0.1s' }}>
                <div className="notif-icon" style={{ background: 'linear-gradient(135deg,#EF4444,#B91C1C)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    <line x1="23" y1="1" x2="17" y2="7"/><line x1="17" y1="1" x2="23" y2="7"/>
                  </svg>
                </div>
                <div className="notif-body">
                  <p className="notif-title"><span className="pulse-dot"></span>Missed call</p>
                  <p className="notif-sub">Customer · (612) 555‑0142</p>
                </div>
                <span className="notif-time">now</span>
              </div>

              <div className="notif-arrow">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.4))' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <div className="notif-card" style={{ animationDelay: '0.35s' }}>
                <div className="notif-icon" style={{ background: 'linear-gradient(135deg,#0AA89F,#0D8F87)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div className="notif-body">
                  <p className="notif-title">BellAveGo answered</p>
                  <p className="notif-sub">12 seconds · transcribed live</p>
                </div>
                <span className="notif-time">12s</span>
              </div>

              <div className="notif-arrow">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.4))' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <div className="notif-card" style={{ animationDelay: '0.6s' }}>
                <div className="notif-icon" style={{ background: 'linear-gradient(135deg,#3B82F6,#1E40AF)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div className="notif-body">
                  <p className="notif-title">Job booked: HVAC tune‑up</p>
                  <p className="notif-sub">Tomorrow · 10:00 AM · Confirmed by SMS</p>
                </div>
                <span className="notif-time">1m</span>
              </div>

              <div className="notif-arrow">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.4))' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>

              <div className="notif-card" style={{ animationDelay: '0.85s' }}>
                <div className="notif-icon" style={{ background: 'linear-gradient(135deg,#22C55E,#15803D)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                    <polyline points="17 6 23 6 23 12"/>
                  </svg>
                </div>
                <div className="notif-body">
                  <p className="notif-title">+$487 added to pipeline</p>
                  <p className="notif-sub">Average ticket value · auto‑logged</p>
                </div>
                <span className="notif-time">2m</span>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <div id="lp-preview"><DashboardPreview /></div>

      {/* CONSULTING PREVIEW */}
      <section style={{ background: 'linear-gradient(180deg, #EBF7F3 0%, #F5FCFA 100%)', padding: '72px 48px 80px', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Included in your plan</p>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-1px', marginBottom: 12 }}>
              5 expert consulting reports a year.
            </h2>
            <p style={{ fontSize: 16, color: '#4A7A80', maxWidth: 520, margin: '0 auto' }}>
              AI-powered market research and local intelligence — delivered as a polished PDF — to help your business grow faster.
            </p>
          </div>
          <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(7,27,58,0.12)', border: '1px solid rgba(10,168,159,0.14)' }}>
            <Image
              src="/Consulting1.png"
              alt="BellAveGo Consulting Report"
              width={1400}
              height={900}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
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
              { icon: '📞', title: 'BellAveGo answers', desc: 'Every call, every time — 24/7' },
              { icon: '📅', title: 'Job gets booked', desc: 'Added to your schedule instantly' },
              { icon: '💬', title: 'Customer texted', desc: 'Confirmation + reminder, automatic' },
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
            { name: 'Solo', price: 147, setup: 197, calls: 150, desc: 'Solo contractors under $100K revenue.', popular: false },
            { name: 'Growth', price: 297, setup: 497, calls: 500, desc: '2–10 employees. $100K–$500K revenue.', popular: true },
            { name: 'Scale', price: 597, setup: 997, calls: 1500, desc: '10+ employees. Established shops.', popular: false },
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
                <span style={{ fontSize: 20, fontWeight: 900, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#4A7A80', marginTop: 10 }}>$</span>
                <span style={{ fontSize: 56, fontWeight: 900, color: plan.popular ? '#fff' : '#0B1F3A', lineHeight: 1, letterSpacing: '-2px' }}>{plan.price}</span>
              </div>
              <div style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.38)' : '#7AAAB2', marginBottom: 6 }}>per month · cancel anytime</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2', marginBottom: 12 }}>+ ${plan.setup} one-time onboarding</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: plan.popular ? '#18AFA8' : '#0AA89F', marginBottom: 16 }}>{plan.calls.toLocaleString()} calls / month</div>
              <div style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.6)' : '#4A7A80', marginBottom: 24, lineHeight: 1.6 }}>{plan.desc}</div>
              <div style={{ marginBottom: 24 }}>
                {['AI answers every missed call 24/7', 'Job booking + SMS confirmation', 'Quarterly AI consulting reports', 'Local market intelligence', '30-day money-back guarantee'].map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${plan.popular ? 'rgba(255,255,255,0.07)' : 'rgba(10,168,159,0.08)'}` }}>
                    <div style={{ width: 17, height: 17, background: plan.popular ? '#18AFA8' : '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>
                    </div>
                    <span style={{ fontSize: 13, color: plan.popular ? 'rgba(255,255,255,0.78)' : '#0B1F3A' }}>{f}</span>
                  </div>
                ))}
              </div>
              {isSignedIn ? (
                <Link href="/dashboard" style={{ display: 'block', textAlign: 'center', padding: '13px', background: plan.popular ? 'linear-gradient(135deg,#0AA89F,#0D8F87)' : 'rgba(10,168,159,0.08)', borderRadius: 10, textDecoration: 'none', color: plan.popular ? '#fff' : '#0AA89F', fontWeight: 800, fontSize: 14, border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.2)' }}>
                  Dashboard →
                </Link>
              ) : (
                <Link href="/sign-up" style={{ display: 'block', textAlign: 'center', padding: '13px', background: plan.popular ? '#22C55E' : 'rgba(10,168,159,0.08)', borderRadius: 10, textDecoration: 'none', color: plan.popular ? '#fff' : '#0AA89F', fontWeight: 800, fontSize: 14, border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.2)' }}>
                  Get started →
                </Link>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#7AAAB2', marginTop: 16, lineHeight: 1.6 }}>
          30-day money-back guarantee · Cancel anytime · Pay annually, get 12 months for the price of 10.<br />
          Multi-location? <a href="mailto:peter@bellavego.com" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>Contact us</a> for franchise + 3+ location pricing.
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
            <Link href="/sign-up" className="cta-pulse" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
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
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>Built for home service businesses · From $147/mo · 30-day money-back · Cancel anytime</p>
        </div>
      </footer>

    </main>
  )
}
