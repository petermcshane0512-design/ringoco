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
              <Link href="/sign-up" className="cta-pulse" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                Start Free Trial
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 72, position: 'relative' }}>
        <style>{`
          @keyframes ctaGlow {
            0%, 100% { box-shadow: 0 4px 18px rgba(34,197,94,0.42), 0 0 30px rgba(34,197,94,0.24); }
            50%       { box-shadow: 0 6px 32px rgba(34,197,94,0.65), 0 0 56px rgba(34,197,94,0.42); }
          }
          .cta-pulse {
            animation: ctaGlow 2.5s ease-in-out infinite;
            transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.28s ease;
            will-change: transform, box-shadow;
          }
          .cta-pulse:hover {
            animation-play-state: paused;
            transform: scale(1.06) translateY(-3px) !important;
            box-shadow: 0 10px 44px rgba(34,197,94,0.72), 0 0 70px rgba(34,197,94,0.52) !important;
            filter: brightness(1.12) !important;
          }
          .lp-hero-cta {
            position: absolute;
            left: 4%;
            top: 60%;
            width: 15%;
            height: 11%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #22C55E 0%, #15A34A 100%);
            border-radius: 10px;
            text-decoration: none;
            color: #fff;
            font-weight: 800;
            font-size: clamp(10px, 1.15vw, 16px);
            letter-spacing: -0.2px;
            border: none;
            cursor: pointer;
            gap: 6px;
          }
          .lp-hero-cta:hover {
            text-decoration: none;
            color: #fff;
          }
          .lp-card-wrap {
            transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.24s ease;
            position: relative;
            z-index: 1;
          }
          .lp-card-wrap:hover {
            transform: scale(1.07);
            filter: drop-shadow(0 6px 22px rgba(10,168,159,0.52)) drop-shadow(0 0 12px rgba(255,255,255,0.45));
            z-index: 10;
          }
        `}</style>
        <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
          <Image
            src="/Landing Page 1.png"
            alt="BellAveGo — Stop losing jobs to missed calls"
            width={1440}
            height={480}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            priority
          />
          <Link
            href={isSignedIn ? '/dashboard' : '/sign-up'}
            className="cta-pulse lp-hero-cta"
          >
            Start Free Trial
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>

          {/* Notification cards — right side */}
          <div style={{
            position: 'absolute',
            top: '3%',
            right: '2%',
            width: '26%',
            height: '92%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            pointerEvents: 'none',
          }}>
            {[
              { src: '/LP1.png', alt: 'Missed call notification', w: 440, h: 100 },
              { src: '/LP2.png', alt: 'BellAveGo answered in 12s', w: 440, h: 90 },
              { src: '/LP3.png', alt: 'AI text summary', w: 440, h: 140 },
              { src: '/LP4.png', alt: 'Potential revenue', w: 440, h: 100 },
            ].reduce<React.ReactNode[]>((acc, card, i, arr) => {
              acc.push(
                <div key={card.src} className="lp-card-wrap" style={{ pointerEvents: 'auto' }}>
                  <Image src={card.src} alt={card.alt} width={card.w} height={card.h}
                    style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
                </div>
              )
              if (i < arr.length - 1) acc.push(
                <div key={`arrow-${i}`} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              )
              return acc
            }, [])}
          </div>
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
          <Link href="/sign-up" className="cta-pulse" style={{ display: 'block', width: '100%', padding: '17px', textAlign: 'center', background: '#22C55E', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 15 }}>
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
            <Link href="/sign-up" className="cta-pulse" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
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
