'use client'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', background: '#0a0a0a', minHeight: '100vh', color: '#fff' }}>

      {/* Nav */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 40px', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #00c896, #0066ff)', borderRadius: 8 }}></div>
          <span style={{ fontWeight: 700, fontSize: 20, color: '#fff' }}>RingoCo</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/sign-in" style={{ padding: '8px 18px', border: '1px solid #333', borderRadius: 8, textDecoration: 'none', color: '#aaa', fontSize: 14 }}>Sign in</Link>
          <Link href="/sign-up" style={{ padding: '8px 18px', background: 'linear-gradient(135deg, #00c896, #0066ff)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 600 }}>Start free trial</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '100px 40px 80px' }}>
        <div style={{ display: 'inline-block', background: '#111', border: '1px solid #222', borderRadius: 20, padding: '6px 16px', fontSize: 13, color: '#00c896', marginBottom: 24 }}>
          FOR HVAC · PLUMBING · ELECTRICAL
        </div>
        <h1 style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1, marginBottom: 24, background: 'linear-gradient(135deg, #fff 60%, #00c896)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Stop losing jobs<br />to missed calls
        </h1>
        <p style={{ fontSize: 20, color: '#888', marginBottom: 40, maxWidth: 540, margin: '0 auto 40px', lineHeight: 1.7 }}>
          RingoCo answers your phone 24/7, books appointments automatically, and runs your whole operation — for $99/month.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/sign-up" style={{ padding: '16px 32px', background: 'linear-gradient(135deg, #00c896, #0066ff)', borderRadius: 12, textDecoration: 'none', color: '#fff', fontSize: 16, fontWeight: 700 }}>
            Start 14-day free trial →
          </Link>
          <a href="tel:+17623713351" style={{ padding: '16px 32px', border: '1px solid #333', borderRadius: 12, textDecoration: 'none', color: '#fff', fontSize: 16 }}>
            Call our AI demo
          </a>
        </div>
        <p style={{ fontSize: 13, color: '#555', marginTop: 16 }}>No credit card. No contract. Cancel anytime.</p>
      </section>

      {/* Stats bar */}
      <section style={{ background: '#111', border: '1px solid #1a1a1a', margin: '0 40px', borderRadius: 16, padding: '32px 40px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, textAlign: 'center', marginBottom: 80 }}>
        {[
          { num: '$54,000', label: 'avg revenue lost/yr from missed calls' },
          { num: '4x', label: 'cheaper than ServiceTitan' },
          { num: '20 min', label: 'setup time, not 6 months' },
        ].map(s => (
          <div key={s.label}>
            <p style={{ fontSize: 36, fontWeight: 800, background: 'linear-gradient(135deg, #00c896, #0066ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 4px' }}>{s.num}</p>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </section>

      {/* Features */}
      <section style={{ padding: '0 40px 80px' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, textAlign: 'center', marginBottom: 48 }}>Everything you need. Nothing you don't.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { icon: '📞', title: 'AI Receptionist', desc: 'Answers every call 24/7, collects caller info, and books the job — even at 2am while you sleep.' },
            { icon: '📅', title: 'Job Scheduling', desc: 'See your whole week at a glance. Drag and drop to reschedule. No more double bookings.' },
            { icon: '💬', title: 'SMS Reminders', desc: 'Automatic texts to customers before every job. Kills no-shows before they happen.' },
            { icon: '🧾', title: 'Invoicing', desc: 'Send a professional invoice in 30 seconds. Customers pay by link from their phone.' },
            { icon: '⭐', title: 'Review Requests', desc: 'Auto-text happy customers asking for a Google review after each completed job.' },
            { icon: '📊', title: 'Revenue Tracking', desc: 'See exactly how much you made this week, this month, and this year at a glance.' },
          ].map(f => (
            <div key={f.title} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 16, padding: '28px 24px', transition: 'border-color 0.2s' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{f.icon}</div>
              <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: '#fff' }}>{f.title}</p>
              <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: '0 40px 80px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>Simple pricing</h2>
        <p style={{ color: '#666', marginBottom: 48 }}>One plan. Everything included. No surprises.</p>
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 24, padding: '48px 40px', maxWidth: 400, margin: '0 auto', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(135deg, #00c896, #0066ff)' }}></div>
          <p style={{ fontSize: 56, fontWeight: 800, margin: '0 0 4px', color: '#fff' }}>$99</p>
          <p style={{ color: '#666', marginBottom: 32 }}>per month · cancel anytime</p>
          {['AI receptionist 24/7', 'Unlimited jobs + customers', 'SMS reminders', 'Invoicing + payments', 'Review automation', 'Up to 5 techs'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #1a1a1a', textAlign: 'left' }}>
              <span style={{ color: '#00c896', fontWeight: 700 }}>✓</span>
              <span style={{ fontSize: 14, color: '#ccc' }}>{f}</span>
            </div>
          ))}
          <Link href="/sign-up" style={{ display: 'block', marginTop: 32, padding: '16px', background: 'linear-gradient(135deg, #00c896, #0066ff)', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 700, fontSize: 16 }}>
            Start free trial →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '32px 40px', borderTop: '1px solid #1a1a1a', color: '#555', fontSize: 13 }}>
        <p>RingoCo · Built for the trades · $99/mo · No contracts</p>
      </footer>
    </main>
  )
}