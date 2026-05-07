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
      <section style={{ background: 'linear-gradient(160deg, #E8F7F2 0%, #F5FCF8 55%, #EAF5F0 100%)', paddingTop: 98, paddingBottom: 20, paddingLeft: 48, paddingRight: 48, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Aqua wave blobs */}
        <div style={{ position: 'absolute', bottom: -30, left: -80, width: 420, height: 260, background: 'radial-gradient(ellipse at 40% 60%, rgba(32,178,170,0.22) 0%, transparent 65%)', borderRadius: '58% 42% 34% 66% / 56% 32% 68% 44%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 20, left: 120, width: 300, height: 180, background: 'radial-gradient(ellipse at 50% 50%, rgba(32,178,170,0.13) 0%, transparent 70%)', borderRadius: '42% 58% 68% 32% / 38% 54% 46% 62%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -10, right: -20, width: 320, height: 220, background: 'radial-gradient(ellipse at 55% 45%, rgba(20,195,185,0.16) 0%, transparent 65%)', borderRadius: '52% 48% 42% 58% / 36% 62% 38% 64%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 90, right: -30, width: 220, height: 220, background: 'radial-gradient(ellipse, rgba(32,178,170,0.09) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 60, left: -40, width: 180, height: 180, background: 'radial-gradient(ellipse, rgba(32,178,170,0.07) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 820, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(32,178,170,0.1)', border: '1px solid rgba(32,178,170,0.28)', borderRadius: 20, padding: '6px 14px', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, background: '#20B2AA', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ color: '#0B1F3A', fontSize: 12, fontWeight: 500, letterSpacing: '0.02em' }}>AI answering calls right now</span>
          </div>

          <h1 style={{ fontSize: 'clamp(64px, 7vw, 110px)', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.04em', color: '#0B1F3A', margin: '0 0 18px' }}>
            Stop losing jobs to<br />
            <span style={{ color: '#20B2AA' }}>missed calls.</span>
          </h1>

          <p style={{ fontSize: 20, color: '#3D5A62', lineHeight: 1.35, maxWidth: 580, margin: '0 auto 24px' }}>
            BellAveGo answers calls 24/7, books jobs, and texts customers automatically — so you can focus on the work, not the phone.
          </p>

          {isSignedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Link href="/dashboard" style={{ padding: '14px 52px', background: '#22C55E', color: '#fff', fontWeight: 900, fontSize: 17, borderRadius: 11, textDecoration: 'none', boxShadow: '0 6px 28px rgba(34,197,94,0.35)', letterSpacing: '-0.02em' }}>
                Open Dashboard
              </Link>
              <p style={{ color: '#5A7A82', fontSize: 12, margin: 0 }}>Your AI receptionist is ready — start capturing calls and booking jobs</p>
              <a href="tel:+17623713351" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', background: '#fff', color: '#0B1F3A', fontWeight: 700, fontSize: 14, borderRadius: 10, textDecoration: 'none', border: '1.5px solid #C8DDD6', boxShadow: '0 2px 8px rgba(11,31,58,0.07)' }}>
                📞 Call the AI Demo
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
              <Link href="/sign-up" style={{ padding: '14px 36px', background: '#22C55E', color: '#fff', fontWeight: 900, fontSize: 15, borderRadius: 11, textDecoration: 'none', boxShadow: '0 4px 20px rgba(34,197,94,0.35)' }}>
                Start Free Trial — 14 Days →
              </Link>
              <a href="tel:+17623713351" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '14px 24px', background: '#fff', color: '#0B1F3A', fontWeight: 700, fontSize: 15, borderRadius: 11, textDecoration: 'none', border: '1.5px solid #C8DDD6', boxShadow: '0 2px 8px rgba(11,31,58,0.07)' }}>
                📞 Call the AI Demo
              </a>
            </div>
          )}

          <p style={{ fontSize: 12, color: '#7AAAB2', marginTop: 4 }}>No credit card required · Setup in 15 minutes · Cancel anytime</p>
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
      {!isSignedIn && <DashboardPreview />}

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
            <span style={{ fontSize: 88, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-3px' }}>97</span>
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
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>Built for home service businesses · $97/mo · No contracts · Cancel anytime</p>
        </div>
      </footer>

    </main>
  )
}
