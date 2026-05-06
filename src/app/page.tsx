'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'

export default function HomePage() {
  const { isSignedIn } = useAuth()

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#fff', color: '#0F172A', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #E2E8F0', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <Image src="/logo.png" alt="BellAveGo" width={380} height={120} style={{ objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn ? (
            <>
              <SignOutButton redirectUrl="/">
                <button style={{ padding: '8px 16px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: 'transparent', color: '#94A3B8', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Sign out
                </button>
              </SignOutButton>
              <Link href="/dashboard" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
                Open Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" style={{ padding: '10px 22px', border: '1.5px solid #E2E8F0', borderRadius: 8, textDecoration: 'none', color: '#64748B', fontSize: 14, fontWeight: 500 }}>
                Sign in
              </Link>
              <Link href="/sign-up" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800, boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}>
                Start Free Trial
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #1e3a6e 100%)', paddingTop: 140, paddingBottom: 80, paddingLeft: 48, paddingRight: 48, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', opacity: 0.06, zIndex: 0 }}>
          <Image src="/logo2.png" alt="" width={700} height={700} style={{ objectFit: 'contain' }} />
        </div>
        <div style={{ maxWidth: 800, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '8px 16px', marginBottom: 32 }}>
            <span style={{ width: 8, height: 8, background: '#22C55E', borderRadius: '50%', display: 'inline-block' }} />
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500 }}>AI answering calls right now</span>
          </div>
          <h1 style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-2px', color: '#fff', margin: '0 0 24px' }}>
            Stop losing jobs to<br />
            <span style={{ color: '#22C55E' }}>missed calls.</span>
          </h1>
          <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 40px' }}>
            BellAveGo answers calls 24/7, books jobs, and texts customers automatically — so you can focus on the work, not the phone.
          </p>

          {isSignedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <Link href="/dashboard" style={{
                padding: '24px 72px',
                background: '#22C55E',
                color: '#fff',
                fontWeight: 900,
                fontSize: 24,
                borderRadius: 16,
                textDecoration: 'none',
                boxShadow: '0 8px 48px rgba(34,197,94,0.5)',
                letterSpacing: '-0.3px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
              }}>
                Open Dashboard
              </Link>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}>
                Your AI receptionist is ready — start capturing calls and booking jobs
              </p>
              <a href="tel:+17623713351" style={{ padding: '14px 28px', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 15, borderRadius: 12, textDecoration: 'none', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                📞 Call the AI Demo
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              <Link href="/sign-up" style={{ padding: '18px 40px', background: '#22C55E', color: '#fff', fontWeight: 900, fontSize: 17, borderRadius: 12, textDecoration: 'none', boxShadow: '0 4px 28px rgba(34,197,94,0.35)' }}>
                Start Free Trial — 14 Days →
              </Link>
              <a href="tel:+17623713351" style={{ padding: '18px 28px', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 17, borderRadius: 12, textDecoration: 'none', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                📞 Call the AI Demo
              </a>
            </div>
          )}

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>No credit card required · Setup in 15 minutes · Cancel anytime</p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, maxWidth: 680, width: '100%', margin: '64px auto 0', background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', zIndex: 1 }}>
          {[
            { num: '62%', label: "of callers won't leave a voicemail" },
            { num: '$54K', label: 'in potential yearly revenue lost from missed calls' },
            { num: '1 in 3', label: 'calls go unanswered at small businesses' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '28px 20px', textAlign: 'center', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <p style={{ fontSize: 34, fontWeight: 900, color: '#22C55E', margin: '0 0 6px', letterSpacing: '-1px' }}>{s.num}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>{s.label}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 12, textAlign: 'center', position: 'relative', zIndex: 1 }}>Based on common small business call-answering benchmarks and missed-call revenue estimates.</p>
      </section>

      {/* DEMO */}
      <section style={{ padding: '72px 48px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Try it live</p>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: '#0F172A', letterSpacing: '-1px', marginBottom: 16 }}>Call the AI before your customers do.</h2>
          <p style={{ color: '#64748B', fontSize: 17, lineHeight: 1.7, marginBottom: 36 }}>
            Hear exactly how BellAveGo handles a real customer call. It collects the name, service needed, address, and preferred time — then sends a confirmation text.
          </p>
          <a href="tel:+17623713351" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '18px 40px', background: '#2563EB', color: '#fff', fontWeight: 900, fontSize: 17, borderRadius: 12, textDecoration: 'none', boxShadow: '0 4px 20px rgba(37,99,235,0.25)' }}>
            📞 Call the AI Demo
          </a>
          <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 14 }}>+1 (762) 371-3351 · Free to call · Picks up within 15 seconds</p>
        </div>
      </section>

      {/* PILLARS */}
      <section style={{ padding: '60px 48px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Image src="/workflow 0.png" alt="3 Core Pillars - One Powerful Platform" width={1200} height={600} style={{ width: '100%', height: 'auto', borderRadius: 16 }} priority />
        </div>
      </section>

      {/* INDUSTRIES */}
      <section style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '32px 0 0' }}>
        <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#64748B', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>Built for home service businesses</p>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: 'max-content', animation: 'scroll 25s linear infinite', paddingBottom: 28 }}>
            <style>{`@keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }`}</style>
            {[...Array(2)].map((_, repeat) => (
              <div key={repeat} style={{ display: 'flex' }}>
                {[
                  { icon: '❄️', label: 'HVAC' }, { icon: '🪠', label: 'Plumbing' }, { icon: '⚡', label: 'Electrical' },
                  { icon: '🧹', label: 'Cleaning' }, { icon: '🌿', label: 'Landscaping' }, { icon: '🔨', label: 'Handyman' },
                  { icon: '🏠', label: 'Roofing' }, { icon: '🔧', label: 'Appliance Repair' }, { icon: '🚗', label: 'Auto Detailing' },
                  { icon: '🐾', label: 'Pet Services' }, { icon: '💧', label: 'Pool & Spa' }, { icon: '🪟', label: 'Window Cleaning' },
                ].map(s => (
                  <div key={s.label + repeat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px', borderRight: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW IMAGES */}
      <section style={{ padding: '80px 48px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            {/* Image 1 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Image src="/workflow1.png" alt="AI Answering & Booking" width={300} height={400} style={{ width: '100%', height: 'auto', borderRadius: 12 }} />
            </div>

            {/* Arrow 1 */}
            <div style={{ fontSize: 40, color: '#94A3B8', flexShrink: 0 }}>→</div>

            {/* Image 2 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Image src="/workflow2.png" alt="Consulting Reports" width={300} height={400} style={{ width: '100%', height: 'auto', borderRadius: 12 }} />
            </div>

            {/* Arrow 2 */}
            <div style={{ fontSize: 40, color: '#94A3B8', flexShrink: 0 }}>→</div>

            {/* Image 3 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Image src="/workflow 3.png" alt="Invoicing & Payments" width={300} height={400} style={{ width: '100%', height: 'auto', borderRadius: 12 }} />
            </div>
          </div>
        </div>
      </section>

      {/* STORY */}
      <section style={{ padding: '80px 48px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Built for the job site</p>
            <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-1px', color: '#0F172A', marginBottom: 12 }}>
              You stay on the job.<br />
              <span style={{ color: '#2563EB' }}>BellAveGo handles the front desk.</span>
            </h2>
            <p style={{ color: '#64748B', fontSize: 17, maxWidth: 500, margin: '0 auto' }}>
              While you&apos;re working, driving, or finishing a job, BellAveGo answers the call, books the appointment, and texts the customer.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 40 }}>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
              <Image src="/electrician.png" alt="Contractor on the job" width={600} height={420} style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.9) 0%, transparent 100%)', padding: '40px 28px 24px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>📍 Contractor can&apos;t answer</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '6px 0 0' }}>Phone rings while you&apos;re on the job.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
              <Image src="/customer.png" alt="Customer getting confirmation" width={600} height={420} style={{ width: '100%', height: 360, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.9) 0%, transparent 100%)', padding: '40px 28px 24px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>💬 Customer gets handled instantly</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '6px 0 0' }}>Booked, confirmed, and reminded automatically.</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
            {[
              { icon: '📞', title: 'BellAveGo answers', desc: 'Every call, every time — 24/7' },
              { icon: '📅', title: 'Job gets booked', desc: 'Added to your schedule instantly' },
              { icon: '💬', title: 'Customer texted', desc: 'Confirmation + reminder, automatic' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '28px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(37,99,235,0.05)' }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>{s.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: '#0F172A' }}>{s.title}</p>
                <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '80px 48px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Everything included</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, marginBottom: 10, letterSpacing: '-1px', color: '#0F172A' }}>Everything your front desk would do, without hiring one.</h2>
            <p style={{ color: '#64748B', fontSize: 16, maxWidth: 520, margin: '0 auto' }}>Calls, texts, bookings, reminders, invoices, and revenue tracking in one simple system.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
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
              <div key={f.title} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
                <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: '#0F172A' }}>{f.title}</p>
                <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section style={{ padding: '80px 48px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8, letterSpacing: '-1px', color: '#0F172A' }}>Built for real service businesses, not tech teams.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
            {[
              { icon: '⚡', title: '15-minute setup', desc: 'Connect your number, calendar, and text alerts fast. No IT required.' },
              { icon: '📱', title: 'No new hardware', desc: 'BellAveGo works with your existing phone workflow.' },
              { icon: '📊', title: 'Owner-friendly dashboard', desc: 'See calls, jobs, customers, and revenue without spreadsheets.' },
              { icon: '🔓', title: 'Cancel anytime', desc: 'No long-term contracts. Try it, test it, keep it only if it helps.' },
            ].map(t => (
              <div key={t.title} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 24px', textAlign: 'center', boxShadow: '0 2px 12px rgba(37,99,235,0.04)' }}>
                <div style={{ fontSize: 36, marginBottom: 14 }}>{t.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: '#0F172A' }}>{t.title}</p>
                <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '80px 48px', background: '#fff', borderBottom: '1px solid #E2E8F0', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Simple pricing</p>
        <h2 style={{ fontSize: 44, fontWeight: 900, marginBottom: 8, letterSpacing: '-1.5px', color: '#0F172A' }}>One price. Everything included.</h2>
        <p style={{ color: '#64748B', fontSize: 16, marginBottom: 52 }}>Your first booked job pays for the whole month.</p>
        <div style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #1e3a6e 100%)', borderRadius: 24, padding: '52px 44px', maxWidth: 460, margin: '0 auto', boxShadow: '0 24px 80px rgba(11,31,58,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: 'rgba(255,255,255,0.4)', marginTop: 16 }}>$</span>
            <span style={{ fontSize: 90, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-3px' }}>97</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 36, fontSize: 14 }}>per month · no contracts</p>
          <div style={{ textAlign: 'left', marginBottom: 36 }}>
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
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 20, height: 20, background: '#22C55E', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>{f}</span>
              </div>
            ))}
          </div>
          <Link href="/sign-up" style={{ display: 'block', width: '100%', padding: '18px', textAlign: 'center', background: '#22C55E', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16, boxShadow: '0 4px 20px rgba(34,197,94,0.35)' }}>
            Start Free Trial — 14 Days →
          </Link>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 14 }}>Cancel before trial ends to avoid billing.</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '100px 48px', background: 'linear-gradient(135deg, #0B1F3A 0%, #1e3a6e 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, marginBottom: 16, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.1 }}>
          Stop letting missed calls<br />become missed jobs.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 17, maxWidth: 480, margin: '0 auto 44px', lineHeight: 1.8 }}>
          Set up BellAveGo in 15 minutes and let the AI answer, book, and text your next customer.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isSignedIn ? (
            <Link href="/dashboard" style={{ padding: '18px 48px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 17, boxShadow: '0 4px 24px rgba(34,197,94,0.35)' }}>
              Open Your Dashboard →
            </Link>
          ) : (
            <Link href="/sign-up" style={{ padding: '18px 48px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 17, boxShadow: '0 4px 24px rgba(34,197,94,0.35)' }}>
              Start Free Trial — 14 Days →
            </Link>
          )}
          <a href="tel:+17623713351" style={{ padding: '18px 32px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 17, textDecoration: 'none' }}>
            📞 Call the AI Demo
          </a>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 20 }}>No credit card. No contract. No BS.</p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '48px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Image src="/logo.png" alt="BellAveGo" width={320} height={110} style={{ objectFit: 'contain' }} />
          <p style={{ margin: 0, fontSize: 14, color: '#94A3B8', fontStyle: 'italic' }}>We don&apos;t just answer calls. We grow your business.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>Built for home service businesses · $97/mo · No contracts · Cancel anytime</p>
        </div>
      </footer>

    </main>
  )
}