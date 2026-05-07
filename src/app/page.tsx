'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import DashboardPreview from '@/components/DashboardPreview'

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
              <Link href="/dashboard" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: '0 4px 14px rgba(34,197,94,0.28)' }}>
                Open Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" style={{ padding: '10px 22px', border: '1.5px solid #DCE9E2', borderRadius: 8, textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 500 }}>
                Sign in
              </Link>
              <Link href="/sign-up" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: '0 4px 14px rgba(34,197,94,0.28)' }}>
                Start Free Trial
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 72, background: '#fff' }}>
        <style>{`
          .h-trial {
            transition: transform 0.17s ease, box-shadow 0.17s ease;
            display: inline-flex; align-items: center;
          }
          .h-trial:hover, .h-trial:active {
            transform: scale(1.07);
            box-shadow: 0 0 0 4px rgba(34,197,94,0.38), 0 10px 38px rgba(34,197,94,0.52) !important;
          }
          .h-demo {
            transition: transform 0.17s ease;
          }
          .h-demo:hover, .h-demo:active {
            transform: scale(1.06);
          }
          .h-demo:hover .h-play {
            box-shadow: 0 0 0 5px rgba(11,31,58,0.12), 0 6px 22px rgba(11,31,58,0.18);
          }
          .h-card {
            transition: transform 0.22s ease, box-shadow 0.22s ease;
            border-radius: 14px;
          }
          .h-card:hover {
            transform: scale(1.038) translateY(-3px);
            box-shadow: 0 0 0 2px rgba(10,168,159,0.42), 0 16px 50px rgba(10,168,159,0.24) !important;
          }
        `}</style>

        <div style={{ position: 'relative', width: '100%', height: '27vw', maxHeight: 410, minHeight: 290, overflow: 'hidden' }}>

          {/* Beach image — right portion visible, compressed height */}
          <Image
            src="/Landing Page 1.png"
            alt="BellAveGo"
            fill
            sizes="100vw"
            style={{ objectFit: 'cover', objectPosition: 'top center' }}
            priority
          />

          {/* Left white wash — covers image text so HTML content takes over */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,0.97) 30%, rgba(255,255,255,0.68) 46%, rgba(255,255,255,0.08) 58%, transparent 65%)' }} />

          {/* Right edge — blur + fade to white */}
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '9%', background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.92) 100%)', backdropFilter: 'blur(5px)' }} />

          {/* Top breathe */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '16%', background: 'linear-gradient(to bottom, rgba(255,255,255,0.55), transparent)' }} />

          {/* Bottom breathe — hides checkmark row in image */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '22%', background: 'linear-gradient(to top, rgba(255,255,255,0.85), transparent)' }} />

          {/* ── LEFT HTML CONTENT ── */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 3% 0 6.5%', zIndex: 4 }}>

            {/* Problem badge */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 'clamp(10px, 1.2vw, 18px)', width: 'fit-content' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(14px,1.3vw,20px)', height: 'clamp(14px,1.3vw,20px)', borderRadius: '50%', background: '#0B1F3A', color: '#fff', fontSize: 'clamp(7px,0.6vw,10px)', fontWeight: 900, flexShrink: 0 }}>1</span>
              <span style={{ fontSize: 'clamp(8px,0.7vw,10px)', fontWeight: 700, color: '#0AA89F', letterSpacing: '0.13em', textTransform: 'uppercase' }}>The Problem</span>
            </div>

            {/* Headline — more negative space */}
            <h1 style={{ fontSize: 'clamp(22px,3.1vw,48px)', fontWeight: 900, color: '#0B1F3A', lineHeight: 1.06, letterSpacing: '-0.03em', margin: '0 0 clamp(10px,1.1vw,16px)', maxWidth: '92%' }}>
              You&apos;re not answering<br />your phone.
            </h1>

            {/* Subtext */}
            <p style={{ fontSize: 'clamp(10px,0.92vw,14px)', color: '#3D5A62', lineHeight: 1.6, maxWidth: 360, margin: '0 0 clamp(12px,1.4vw,22px)' }}>
              BellAveGo&apos;s AI receptionist answers every call, books jobs, and keeps your business growing — automatically.
            </p>

            {/* CTA buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px,1.1vw,16px)', marginBottom: 'clamp(10px,1.1vw,16px)', flexWrap: 'wrap' }}>
              <Link
                href={isSignedIn ? '/dashboard' : '/sign-up'}
                className="h-trial"
                style={{ padding: 'clamp(7px,0.7vw,11px) clamp(14px,1.5vw,24px)', background: '#22C55E', borderRadius: 9, color: '#fff', fontWeight: 800, fontSize: 'clamp(10px,0.95vw,14px)', textDecoration: 'none', boxShadow: '0 4px 18px rgba(34,197,94,0.38)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}
              >
                Start Free Trial
              </Link>
              <button
                className="h-demo"
                onClick={() => document.getElementById('lp-preview')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#0B1F3A', fontWeight: 700, fontSize: 'clamp(10px,0.92vw,14px)', padding: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                <span className="h-play" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'clamp(20px,1.7vw,26px)', height: 'clamp(20px,1.7vw,26px)', borderRadius: '50%', background: '#0B1F3A', color: '#fff', fontSize: 9, flexShrink: 0, transition: 'box-shadow 0.17s ease' }}>▶</span>
                See how it works
              </button>
            </div>

            {/* Checkmarks — compact */}
            <div style={{ display: 'flex', gap: 'clamp(8px,1.2vw,18px)', flexWrap: 'wrap' }}>
              {['Setup in 15 minutes', 'No credit card', 'Cancel anytime'].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'clamp(8px,0.68vw,10px)', color: '#4A7A80', fontWeight: 500 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* ── CARD HOVER OVERLAYS ── */}
          {/* Transparent areas over the image's 4 right-side cards — glow on hover */}
          <div className="h-card" style={{ position: 'absolute', left: '53%', top: '10%', width: '20%', height: '25%', cursor: 'default' }} />
          <div className="h-card" style={{ position: 'absolute', left: '60%', top: '38%', width: '26%', height: '20%', cursor: 'default' }} />
          <div className="h-card" style={{ position: 'absolute', left: '51%', top: '56%', width: '38%', height: '32%', cursor: 'default' }} />
          <div className="h-card" style={{ position: 'absolute', left: '52%', top: '76%', width: '20%', height: '18%', cursor: 'default' }} />
        </div>
      </section>

      {/* 3-PILLARS VISUAL SYSTEM */}
      <section style={{
        background: 'linear-gradient(180deg, #E6F6F1 0%, #D2EEE9 38%, #BEE5E0 68%, #B0DFDA 100%)',
        padding: '0 24px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}>

        <style>{`@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>

        {/* BG: soft white glow */}
        <div style={{ position: 'absolute', top: '45%', left: '50%', transform: 'translate(-50%,-50%)', width: 900, height: 500, background: 'radial-gradient(ellipse, rgba(255,255,255,0.38) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* BG: wave SVG at bottom */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', pointerEvents: 'none', zIndex: 0, display: 'block' }} viewBox="0 0 1440 90" preserveAspectRatio="none" height="90">
          <path d="M0,50 C300,12 600,72 900,46 C1100,28 1300,58 1440,42 L1440,90 L0,90 Z" fill="rgba(24,175,168,0.16)" />
          <path d="M0,68 C360,36 720,78 1080,62 C1260,54 1380,70 1440,66 L1440,90 L0,90 Z" fill="rgba(24,175,168,0.09)" />
        </svg>

        {/* BG: palm leaf — top right */}
        <div style={{ position: 'absolute', top: -6, right: 52, pointerEvents: 'none', opacity: 0.38, zIndex: 0 }}>
          <svg width="88" height="130" viewBox="0 0 88 130" fill="none">
            <path d="M44 124 C44 124 16 84 24 50 C30 28 44 16 44 16 C44 16 58 28 64 50 C72 84 44 124 44 124Z" fill="rgba(24,175,168,0.34)" />
            <path d="M44 124 C44 124 6 94 12 58 C17 36 32 24 44 16 C36 38 30 66 44 124Z" fill="rgba(24,175,168,0.18)" />
            <path d="M44 124 C44 124 82 94 76 58 C71 36 56 24 44 16 C52 38 58 66 44 124Z" fill="rgba(24,175,168,0.13)" />
            <line x1="44" y1="16" x2="44" y2="124" stroke="rgba(24,175,168,0.26)" strokeWidth="1.2" />
          </svg>
        </div>

        {/* BG: palm leaf — bottom left */}
        <div style={{ position: 'absolute', bottom: -4, left: 48, pointerEvents: 'none', opacity: 0.26, zIndex: 0, transform: 'rotate(175deg)' }}>
          <svg width="68" height="102" viewBox="0 0 68 102" fill="none">
            <path d="M34 98 C34 98 12 66 18 40 C22 24 34 14 34 14 C34 14 46 24 50 40 C56 66 34 98 34 98Z" fill="rgba(24,175,168,0.32)" />
            <path d="M34 98 C34 98 6 74 10 48 C14 30 26 20 34 14 C27 34 22 58 34 98Z" fill="rgba(24,175,168,0.16)" />
            <line x1="34" y1="14" x2="34" y2="98" stroke="rgba(24,175,168,0.22)" strokeWidth="1" />
          </svg>
        </div>

        {/* BG: dot grid — top left */}
        <div style={{ position: 'absolute', top: 18, left: 22, opacity: 0.26, pointerEvents: 'none', zIndex: 0 }}>
          {[0,1,2,3,4].map(r => (
            <div key={r} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[0,1,2,3,4].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
            </div>
          ))}
        </div>

        {/* BG: dot grid — bottom right */}
        <div style={{ position: 'absolute', bottom: 18, right: 22, opacity: 0.18, pointerEvents: 'none', zIndex: 0 }}>
          {[0,1,2,3].map(r => (
            <div key={r} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[0,1,2,3].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
            </div>
          ))}
        </div>

        {/* SINGLE FULL IMAGE */}
        <div style={{ maxWidth: 1340, margin: '0 auto', position: 'relative', zIndex: 2, paddingTop: 24, paddingBottom: 8 }}>
          <Image
            src="/Workflow 0.png"
            alt="BellAveGo — 3 Core Pillars, One Powerful Platform"
            width={1340}
            height={700}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 18, filter: 'drop-shadow(0 12px 40px rgba(7,27,58,0.13))' }}
            priority
          />
        </div>

      </section>

      {/* DASHBOARD PREVIEW — non-signed-in only */}
      {!isSignedIn && <div id="lp-preview"><DashboardPreview /></div>}

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
        <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Simple pricing</p>
        <h2 style={{ fontSize: 42, fontWeight: 900, marginBottom: 8, letterSpacing: '-1.5px', color: '#0B1F3A' }}>One price. Everything included.</h2>
        <p style={{ color: '#4A6670', fontSize: 16, marginBottom: 48 }}>Your first booked job pays for the whole month.</p>
        <div style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', borderRadius: 24, padding: '48px 42px', maxWidth: 450, margin: '0 auto', boxShadow: '0 24px 80px rgba(11,31,58,0.22)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>$</span>
            <span style={{ fontSize: 88, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-3px' }}>147</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.38)', marginBottom: 32, fontSize: 14 }}>per month · no contracts</p>
          <div style={{ textAlign: 'left', marginBottom: 32 }}>
            {[
              { text: 'Custom AI receptionist built for your business', highlight: false },
              { text: 'AI answers missed calls after 12 seconds', highlight: false },
              { text: '24/7 call summaries + scheduling', highlight: false },
              { text: 'SMS confirmations, reminders + follow-ups', highlight: false },
              { text: 'Invoicing + same-day payment collection', highlight: false },
              { text: '5 BELLAVEGO CONSULTING REPORTS A YEAR', highlight: true },
              { text: 'Revenue dashboard + business insights', highlight: false },
              { text: 'Customer database + call history', highlight: false },
              { text: 'Google review request automation', highlight: false },
            ].map(f => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', background: f.highlight ? 'rgba(24,175,168,0.08)' : 'transparent', marginLeft: f.highlight ? -8 : 0, marginRight: f.highlight ? -8 : 0, paddingLeft: f.highlight ? 8 : 0, paddingRight: f.highlight ? 8 : 0, borderRadius: f.highlight ? 6 : 0 }}>
                <div style={{ width: 19, height: 19, background: f.highlight ? '#18AFA8' : '#22C55E', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 14, color: f.highlight ? '#18AFA8' : 'rgba(255,255,255,0.8)', fontWeight: f.highlight ? 700 : 400, letterSpacing: f.highlight ? '0.02em' : 'normal' }}>{f.text}</span>
              </div>
            ))}
          </div>
          <Link href="/sign-up" style={{ display: 'block', width: '100%', padding: '17px', textAlign: 'center', background: '#22C55E', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 15, boxShadow: '0 4px 20px rgba(34,197,94,0.35)' }}>
            Start Free Trial — 14 Days →
          </Link>
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 12, marginTop: 12 }}>Cancel before trial ends to avoid billing.</p>
        </div>
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
            <Link href="/dashboard" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16, boxShadow: '0 4px 22px rgba(34,197,94,0.35)' }}>
              Open Your Dashboard →
            </Link>
          ) : (
            <Link href="/sign-up" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16, boxShadow: '0 4px 22px rgba(34,197,94,0.35)' }}>
              Start Free Trial — 14 Days →
            </Link>
          )}
          <a href="tel:+17623713351" style={{ padding: '16px 30px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
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
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>Built for home service businesses · $147/mo · No contracts · Cancel anytime</p>
        </div>
      </footer>

    </main>
  )
}
