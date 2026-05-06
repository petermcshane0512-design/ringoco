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
      <section style={{ background: 'linear-gradient(160deg, #E8F7F2 0%, #F5FCF8 55%, #EAF5F0 100%)', paddingTop: 140, paddingBottom: 88, paddingLeft: 48, paddingRight: 48, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Aqua wave blobs */}
        <div style={{ position: 'absolute', bottom: -30, left: -80, width: 420, height: 260, background: 'radial-gradient(ellipse at 40% 60%, rgba(32,178,170,0.22) 0%, transparent 65%)', borderRadius: '58% 42% 34% 66% / 56% 32% 68% 44%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 20, left: 120, width: 300, height: 180, background: 'radial-gradient(ellipse at 50% 50%, rgba(32,178,170,0.13) 0%, transparent 70%)', borderRadius: '42% 58% 68% 32% / 38% 54% 46% 62%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -10, right: -20, width: 320, height: 220, background: 'radial-gradient(ellipse at 55% 45%, rgba(20,195,185,0.16) 0%, transparent 65%)', borderRadius: '52% 48% 42% 58% / 36% 62% 38% 64%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 90, right: -30, width: 220, height: 220, background: 'radial-gradient(ellipse, rgba(32,178,170,0.09) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 60, left: -40, width: 180, height: 180, background: 'radial-gradient(ellipse, rgba(32,178,170,0.07) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 780, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(32,178,170,0.1)', border: '1px solid rgba(32,178,170,0.28)', borderRadius: 20, padding: '7px 16px', marginBottom: 28 }}>
            <span style={{ width: 7, height: 7, background: '#20B2AA', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ color: '#0B1F3A', fontSize: 13, fontWeight: 500 }}>AI answering calls right now</span>
          </div>

          <h1 style={{ fontSize: 'clamp(38px, 5.5vw, 66px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-2px', color: '#0B1F3A', margin: '0 0 20px' }}>
            Stop losing jobs to<br />
            <span style={{ color: '#20B2AA' }}>missed calls.</span>
          </h1>

          <p style={{ fontSize: 18, color: '#3D5A62', lineHeight: 1.75, maxWidth: 520, margin: '0 auto 36px' }}>
            BellAveGo answers calls 24/7, books jobs, and texts customers automatically — so you can focus on the work, not the phone.
          </p>

          {isSignedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              <Link href="/dashboard" style={{ padding: '16px 60px', background: '#22C55E', color: '#fff', fontWeight: 900, fontSize: 19, borderRadius: 12, textDecoration: 'none', boxShadow: '0 6px 32px rgba(34,197,94,0.35)', letterSpacing: '-0.3px' }}>
                Open Dashboard
              </Link>
              <p style={{ color: '#5A7A82', fontSize: 13, margin: 0 }}>Your AI receptionist is ready — start capturing calls and booking jobs</p>
              <a href="tel:+17623713351" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 26px', background: '#fff', color: '#0B1F3A', fontWeight: 700, fontSize: 15, borderRadius: 10, textDecoration: 'none', border: '1.5px solid #C8DDD6', boxShadow: '0 2px 10px rgba(11,31,58,0.07)' }}>
                📞 Call the AI Demo
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              <Link href="/sign-up" style={{ padding: '16px 40px', background: '#22C55E', color: '#fff', fontWeight: 900, fontSize: 16, borderRadius: 12, textDecoration: 'none', boxShadow: '0 4px 22px rgba(34,197,94,0.35)' }}>
                Start Free Trial — 14 Days →
              </Link>
              <a href="tel:+17623713351" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 28px', background: '#fff', color: '#0B1F3A', fontWeight: 700, fontSize: 16, borderRadius: 12, textDecoration: 'none', border: '1.5px solid #C8DDD6', boxShadow: '0 2px 10px rgba(11,31,58,0.07)' }}>
                📞 Call the AI Demo
              </a>
            </div>
          )}

          <p style={{ fontSize: 13, color: '#7AAAB2', marginTop: 8 }}>No credit card required · Setup in 15 minutes · Cancel anytime</p>
        </div>

        {/* Stats — light theme */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, maxWidth: 660, width: '100%', margin: '56px auto 0', background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #DCE9E2', boxShadow: '0 4px 20px rgba(11,31,58,0.07)', position: 'relative', zIndex: 1 }}>
          {[
            { num: '62%', label: "of callers won't leave a voicemail" },
            { num: '$54K', label: 'in potential yearly revenue lost from missed calls' },
            { num: '1 in 3', label: 'calls go unanswered at small businesses' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '24px 18px', textAlign: 'center', borderLeft: i > 0 ? '1px solid #DCE9E2' : 'none' }}>
              <p style={{ fontSize: 30, fontWeight: 900, color: '#20B2AA', margin: '0 0 5px', letterSpacing: '-1px' }}>{s.num}</p>
              <p style={{ fontSize: 12, color: '#6A8A92', margin: 0, lineHeight: 1.5 }}>{s.label}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9ABEC4', marginTop: 10, textAlign: 'center', position: 'relative', zIndex: 1 }}>Based on common small business call-answering benchmarks and missed-call revenue estimates.</p>
      </section>

      {/* PRODUCT VISUAL CARD */}
      <section style={{ padding: '36px 28px 40px', background: '#F2F9F5', position: 'relative' }}>
        {/* Decorative dots — left */}
        <div style={{ position: 'absolute', left: 28, top: 52, opacity: 0.4, pointerEvents: 'none' }}>
          {[0,1,2,3,4].map(row => (
            <div key={row} style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
              {[0,1,2,3,4].map(col => (
                <div key={col} style={{ width: 4, height: 4, borderRadius: '50%', background: '#20B2AA' }} />
              ))}
            </div>
          ))}
        </div>

        {/* Decorative palm leaf — right */}
        <div style={{ position: 'absolute', right: 18, top: 24, pointerEvents: 'none', opacity: 0.65 }}>
          <svg width="90" height="110" viewBox="0 0 90 110" fill="none">
            <path d="M45 105 C45 105 18 68 27 38 C32 22 45 12 45 12 C45 12 58 22 63 38 C72 68 45 105 45 105Z" fill="rgba(32,178,170,0.28)" />
            <path d="M45 105 C45 105 8 76 13 46 C18 28 36 18 45 12 C36 32 31 57 45 105Z" fill="rgba(32,178,170,0.18)" />
            <path d="M45 105 C45 105 82 76 77 46 C72 28 54 18 45 12 C54 32 59 57 45 105Z" fill="rgba(32,178,170,0.14)" />
            <line x1="45" y1="12" x2="45" y2="105" stroke="rgba(32,178,170,0.35)" strokeWidth="1.5" />
          </svg>
        </div>

        <style>{`
          .pvs-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }
          .pvs-pillar { flex: 1; max-width: 330px; min-width: 0; }
          .pvs-arrow {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 30px;
            color: #F97B4B;
            width: 36px;
            font-weight: 700;
          }
          .pvs-arrow-down { display: none; }
          @media (max-width: 700px) {
            .pvs-row { flex-direction: column; align-items: center; gap: 0; }
            .pvs-pillar { max-width: 290px; width: 100%; }
            .pvs-arrow { width: auto; padding: 4px 0; font-size: 26px; }
            .pvs-arrow-right { display: none; }
            .pvs-arrow-down { display: inline; }
          }
          @media (max-width: 940px) and (min-width: 701px) {
            .pvs-pillar { max-width: 240px; }
            .pvs-arrow { font-size: 24px; width: 28px; }
          }
          @keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        `}</style>

        <div style={{ maxWidth: 1160, margin: '0 auto', background: '#fff', borderRadius: 22, border: '1px solid #D4E6DC', boxShadow: '0 10px 50px rgba(11,31,58,0.09)', padding: '22px 20px 16px', overflow: 'hidden' }}>
          {/* Banner */}
          <div style={{ marginBottom: 14, textAlign: 'center' }}>
            <Image
              src="/Workflow 0.png"
              alt="3 Core Pillars — One Powerful Platform"
              width={1100}
              height={200}
              style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 10 }}
              priority
            />
          </div>

          {/* Three pillar cards with coral arrows */}
          <div className="pvs-row">
            <div className="pvs-pillar">
              <Image src="/workflow 1.png" alt="AI Receptionist" width={330} height={400} style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 10 }} />
            </div>
            <div className="pvs-arrow">
              <span className="pvs-arrow-right">→</span>
              <span className="pvs-arrow-down">↓</span>
            </div>
            <div className="pvs-pillar">
              <Image src="/workflow2.png" alt="Invoicing" width={330} height={400} style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 10 }} />
            </div>
            <div className="pvs-arrow">
              <span className="pvs-arrow-right">→</span>
              <span className="pvs-arrow-down">↓</span>
            </div>
            <div className="pvs-pillar">
              <Image src="/workflow 3.png" alt="BellAveGo Consulting" width={330} height={400} style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 10 }} />
            </div>
          </div>

          {/* Workflow strip */}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Image
              src="/workflow 4.png"
              alt="Complete Workflow"
              width={1160}
              height={135}
              style={{ width: '100%', maxHeight: 135, objectFit: 'contain', borderRadius: 10 }}
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
