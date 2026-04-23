'use client'
import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 64 }}>
        <span style={{ fontWeight: 700, fontSize: 20 }}>RingoCo</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/sign-in" style={{ padding: '8px 16px', border: '1px solid #ccc', borderRadius: 8, textDecoration: 'none', color: '#000', fontSize: 14 }}>Sign in</Link>
          <Link href="/sign-up" style={{ padding: '8px 16px', background: '#000', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>Start free trial</Link>
        </div>
      </nav>
      <section style={{ textAlign: 'center', marginBottom: 80 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', marginBottom: 12 }}>FOR HVAC, PLUMBING + ELECTRICAL</p>
        <h1 style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.15, marginBottom: 20 }}>
          Stop losing jobs<br />to missed calls
        </h1>
        <p style={{ fontSize: 20, color: '#555', marginBottom: 32, lineHeight: 1.6 }}>
          RingoCo answers your phone 24/7, books appointments automatically,
          and runs your whole operation — for $99/month.
        </p>
        <Link href="/sign-up" style={{ padding: '14px 28px', background: '#000', color: '#fff', borderRadius: 10, textDecoration: 'none', fontSize: 16, fontWeight: 600 }}>
          Start 14-day free trial
        </Link>
        <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>No credit card. No contract. Cancel anytime.</p>
      </section>
    </main>
  )
}