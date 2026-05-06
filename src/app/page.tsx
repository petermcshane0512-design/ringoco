'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'

export default function HomePage() {
  const { isSignedIn } = useAuth()

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <Image src="/logo.png" alt="BellAveGo" width={380} height={120} style={{ objectFit: 'contain' }} />
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

        <style>{`
          @keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @media (max-width: 720px) {
            .pvs-cards { flex-direction: column !important; align-items: center !important; gap: 0 !important; }
            .pvs-card { flex: none !important; width: 280px !important; transform: none !important; }
            .pvs-arrow-h { display: none !important; }
            .pvs-arrow-v { display: flex !important; }
          }
        `}</style>

        {/* BG: soft white glow centred behind cards */}
        <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 860, height: 460, background: 'radial-gradient(ellipse, rgba(255,255,255,0.44) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />

        {/* BG: wave SVG layer 1 — mid */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', pointerEvents: 'none', zIndex: 0, display: 'block' }} viewBox="0 0 1440 100" preserveAspectRatio="none" height="100">
          <path d="M0,55 C300,15 600,78 900,50 C1100,32 1280,62 1440,46 L1440,100 L0,100 Z" fill="rgba(24,175,168,0.18)" />
          <path d="M0,70 C340,38 680,82 1020,65 C1200,55 1360,72 1440,68 L1440,100 L0,100 Z" fill="rgba(24,175,168,0.10)" />
          <path d="M0,84 C400,62 800,90 1200,78 C1320,73 1400,84 1440,84 L1440,100 L0,100 Z" fill="rgba(24,175,168,0.07)" />
        </svg>

        {/* BG: palm leaf — top right */}
        <div style={{ position: 'absolute', top: -6, right: 52, pointerEvents: 'none', opacity: 0.40, zIndex: 0 }}>
          <svg width="88" height="130" viewBox="0 0 88 130" fill="none">
            <path d="M44 124 C44 124 16 84 24 50 C30 28 44 16 44 16 C44 16 58 28 64 50 C72 84 44 124 44 124Z" fill="rgba(24,175,168,0.36)" />
            <path d="M44 124 C44 124 6 94 12 58 C17 36 32 24 44 16 C36 38 30 66 44 124Z" fill="rgba(24,175,168,0.20)" />
            <path d="M44 124 C44 124 82 94 76 58 C71 36 56 24 44 16 C52 38 58 66 44 124Z" fill="rgba(24,175,168,0.15)" />
            <line x1="44" y1="16" x2="44" y2="124" stroke="rgba(24,175,168,0.28)" strokeWidth="1.2" />
          </svg>
        </div>

        {/* BG: palm leaf — bottom left (inverted) */}
        <div style={{ position: 'absolute', bottom: -4, left: 48, pointerEvents: 'none', opacity: 0.30, zIndex: 0, transform: 'rotate(175deg)' }}>
          <svg width="68" height="102" viewBox="0 0 68 102" fill="none">
            <path d="M34 98 C34 98 12 66 18 40 C22 24 34 14 34 14 C34 14 46 24 50 40 C56 66 34 98 34 98Z" fill="rgba(24,175,168,0.34)" />
            <path d="M34 98 C34 98 6 74 10 48 C14 30 26 20 34 14 C27 34 22 58 34 98Z" fill="rgba(24,175,168,0.18)" />
            <line x1="34" y1="14" x2="34" y2="98" stroke="rgba(24,175,168,0.24)" strokeWidth="1" />
          </svg>
        </div>

        {/* BG: dot grid — top left */}
        <div style={{ position: 'absolute', top: 18, left: 22, opacity: 0.28, pointerEvents: 'none', zIndex: 0 }}>
          {[0,1,2,3,4].map(r => (
            <div key={r} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[0,1,2,3,4].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
            </div>
          ))}
        </div>

        {/* BG: dot grid — bottom right */}
        <div style={{ position: 'absolute', bottom: 18, right: 22, opacity: 0.20, pointerEvents: 'none', zIndex: 0 }}>
          {[0,1,2,3].map(r => (
            <div key={r} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[0,1,2,3].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
            </div>
          ))}
        </div>

        {/* COMPOSITION */}
        <div style={{ maxWidth: 1060, margin: '0 auto', position: 'relative', zIndex: 2, paddingTop: 22 }}>

          {/* Banner — compact glass label */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ display: 'inline-block', background: 'rgba(255,255,255,0.68)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: 12, padding: '5px 14px', boxShadow: '0 4px 16px rgba(7,27,58,0.09)', border: '1px solid rgba(255,255,255,0.82)' }}>
              <Image
                src="/Workflow 0.png"
                alt="3 Core Pillars — One Powerful Platform"
                width={480}
                height={64}
                style={{ width: 'auto', maxWidth: 480, height: 64, objectFit: 'contain', display: 'block' }}
                priority
              />
            </div>
          </div>

          {/* Three pillar cards — asymmetric stagger */}
          <div className="pvs-cards" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>

            {/* Left card — lower */}
            <div className="pvs-card" style={{ flex: 1, maxWidth: 318, minWidth: 0, transform: 'translateY(14px)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 10px 38px rgba(7,27,58,0.14)', background: 'rgba(255,255,255,0.96)' }}>
              <Image src="/workflow 1.png" alt="AI Receptionist" width={318} height={256} style={{ width: '100%', height: 256, objectFit: 'contain', display: 'block' }} />
            </div>

            {/* Arrow 1 */}
            <div className="pvs-arrow-h" style={{ flexShrink: 0, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF6F4F', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>→</div>
            <div className="pvs-arrow-v" style={{ display: 'none', color: '#FF6F4F', fontSize: 22, padding: '6px 0' }}>↓</div>

            {/* Center card — elevated, stronger shadow */}
            <div className="pvs-card" style={{ flex: 1, maxWidth: 318, minWidth: 0, transform: 'translateY(-10px)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 52px rgba(7,27,58,0.20)', background: '#fff', position: 'relative', zIndex: 3 }}>
              <Image src="/workflow2.png" alt="Invoicing" width={318} height={256} style={{ width: '100%', height: 256, objectFit: 'contain', display: 'block' }} />
            </div>

            {/* Arrow 2 */}
            <div className="pvs-arrow-h" style={{ flexShrink: 0, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FF6F4F', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>→</div>
            <div className="pvs-arrow-v" style={{ display: 'none', color: '#FF6F4F', fontSize: 22, padding: '6px 0' }}>↓</div>

            {/* Right card — lower */}
            <div className="pvs-card" style={{ flex: 1, maxWidth: 318, minWidth: 0, transform: 'translateY(14px)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 10px 38px rgba(7,27,58,0.14)', background: 'rgba(255,255,255,0.96)' }}>
              <Image src="/workflow 3.png" alt="BellAveGo Consulting" width={318} height={256} style={{ width: '100%', height: 256, objectFit: 'contain', display: 'block' }} />
            </div>

          </div>

          {/* Workflow strip — glass, embedded under cards */}
          <div style={{ margin: '32px auto 0', maxWidth: 940, background: 'rgba(255,255,255,0.66)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', borderRadius: 12, padding: '5px', boxShadow: '0 6px 24px rgba(7,27,58,0.10)', border: '1px solid rgba(255,255,255,0.80)' }}>
            <Image
              src="/workflow 4.png"
              alt="Complete Workflow"
              width={930}
              height={80}
              style={{ width: '100%', height: 80, objectFit: 'contain', display: 'block', borderRadius: 8 }}
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
              <Image src="/electrician.png" alt="Contractor on the job" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📍 Contractor can&apos;t answer</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Phone rings while you&apos;re on the job.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/customer.png" alt="Customer getting confirmation" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>💬 Customer gets handled instantly</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Booked, confirmed, and reminded automatically.</p>
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

      {/* DEMO */}
      <section style={{ padding: '64px 48px', background: '#fff', borderBottom: '1px solid #D4E6DC', textAlign: 'center' }}>
        <div style={{ maxWidth: 580, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Try it live</p>
          <h2 style={{ fontSize: 34, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-1px', marginBottom: 14 }}>Call the AI before your customers do.</h2>
          <p style={{ color: '#4A6670', fontSize: 16, lineHeight: 1.7, marginBottom: 32 }}>
            Hear exactly how BellAveGo handles a real customer call. It collects the name, service needed, address, and preferred time — then sends a confirmation text.
          </p>
          <a href="tel:+17623713351" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 38px', background: '#20B2AA', color: '#fff', fontWeight: 900, fontSize: 16, borderRadius: 12, textDecoration: 'none', boxShadow: '0 4px 20px rgba(32,178,170,0.28)' }}>
            📞 Call the AI Demo
          </a>
          <p style={{ color: '#7AAAB2', fontSize: 13, marginTop: 14 }}>+1 (762) 371-3351 · Free to call · Picks up within 15 seconds</p>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '72px 48px', background: '#F2F9F5', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Everything included</p>
            <h2 style={{ fontSize: 38, fontWeight: 900, marginBottom: 10, letterSpacing: '-1px', color: '#0B1F3A' }}>Everything your front desk would do, without hiring one.</h2>
            <p style={{ color: '#4A6670', fontSize: 16, maxWidth: 500, margin: '0 auto' }}>Calls, texts, bookings, reminders, invoices, and revenue tracking in one simple system.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
            {[
              { icon: '📞', title: 'AI receptionist 24/7', desc: 'Answers missed calls, after-hours calls, and overflow calls.' },
              { icon: '📅', title: 'Auto scheduling', desc: 'Books jobs directly to your calendar.' },
              { icon: '👤', title: 'Customer database', desc: 'Every caller and job detail saved automatically.' },
              { icon: '💬', title: 'SMS confirmations', desc: 'Customers get confirmation and reminder texts.' },
              { icon: '🧾', title: 'Instant invoicing', desc: 'Send invoices fast and get paid sooner.' },
              { icon: '⭐', title: 'Google review requests', desc: 'Automatically ask happy customers for reviews.' },
              { icon: '📊', title: 'Revenue dashboard', desc: 'See calls, booked jobs, and revenue in one place.' },
              { icon: '👥', title: 'Team access', desc: 'Let up to 5 team members stay in the loop.' },
            ].map(f => (
              <div key={f.title} style={{ background: '#fff', border: '1px solid #D4E6DC', borderRadius: 14, padding: '22px 18px', boxShadow: '0 2px 12px rgba(32,178,170,0.05)' }}>
                <div style={{ fontSize: 30, marginBottom: 10 }}>{f.icon}</div>
                <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 5, color: '#0B1F3A' }}>{f.title}</p>
                <p style={{ color: '#4A6670', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section style={{ padding: '72px 48px', background: '#fff', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8, letterSpacing: '-1px', color: '#0B1F3A' }}>Built for real service businesses, not tech teams.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
            {[
              { icon: '⚡', title: '15-minute setup', desc: 'Connect your number, calendar, and text alerts fast. No IT required.' },
              { icon: '📱', title: 'No new hardware', desc: 'BellAveGo works with your existing phone workflow.' },
              { icon: '📊', title: 'Owner-friendly dashboard', desc: 'See calls, jobs, customers, and revenue without spreadsheets.' },
              { icon: '🔓', title: 'Cancel anytime', desc: 'No long-term contracts. Try it, test it, keep it only if it helps.' },
            ].map(t => (
              <div key={t.title} style={{ background: '#F2F9F5', border: '1px solid #D4E6DC', borderRadius: 16, padding: '26px 22px', textAlign: 'center', boxShadow: '0 2px 12px rgba(32,178,170,0.06)' }}>
                <div style={{ fontSize: 34, marginBottom: 12 }}>{t.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 14, marginBottom: 7, color: '#0B1F3A' }}>{t.title}</p>
                <p style={{ color: '#4A6670', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
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
              'AI receptionist 24/7',
              'Missed call + after-hours answering',
              'Auto job booking + calendar',
              'SMS confirmations + reminders',
              'Customer database',
              'Invoicing + same-day payments',
              'Google review requests',
              'Revenue dashboard',
              'Up to 5 team members',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 19, height: 19, background: '#22C55E', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{f}</span>
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
