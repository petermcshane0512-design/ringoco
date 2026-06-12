'use client'

import Link from 'next/link'
import { LEADS_PER_WEEK } from '@/lib/offer'

/**
 * LeadsWaiting — the calm, honest empty state for /dashboard/leads,
 * shown after activation while the first batch is being sourced.
 *
 * 2026-06-11 per Peter ("dashboard is too AI / too futuristic — I like
 * the homepage look"): this REPLACES the radar/agent-log LeadScanConsole.
 * No fake "pulling right now" log, no fabricated counters, no mission-
 * control jargon. Just the homepage LeadsCard look (warm navy + orange +
 * cream), a real status line, and what to do next.
 *
 * Honesty contract: copy says leads are being SOURCED and that we'll text
 * them — it never claims a live scan is mid-flight when it isn't.
 *
 * `firstName` optional — greets by name when we have it.
 */
export default function LeadsWaiting({ firstName }: { firstName?: string | null }) {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 20,
      background: '#ffffff',
      border: '1px solid #E3D8C2',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      padding: 'clamp(24px, 5vw, 40px)',
      maxWidth: 620,
      margin: '0 auto',
      textAlign: 'center',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', borderRadius: 99, marginBottom: 18,
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        fontSize: 11, fontWeight: 700, color: '#15803d', letterSpacing: '0.04em',
      }}>
        <span aria-hidden style={{
          width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
          animation: 'lwPulse 1.6s ease-in-out infinite',
        }} />
        ACCOUNT ACTIVE
      </div>

      <h2 style={{ fontSize: 'clamp(21px, 3vw, 28px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px', color: '#1f2937' }}>
        {firstName ? `You're in, ${firstName}. ` : ''}We're sourcing your first {LEADS_PER_WEEK} leads.
      </h2>
      <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, margin: '0 0 22px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', fontWeight: 500 }}>
        We pull the closest owner-occupied homes around your address, verify
        the owner&apos;s phone, and drop them here. This page updates on its
        own — <strong style={{ color: '#1f2937' }}>we&apos;ll text you the moment they land</strong>.
        No need to wait on this screen.
      </p>

      {/* Three calm what-happens steps — no radar, no live log */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 22, textAlign: 'left' }}>
        {[
          { n: '1', t: 'Closest homes first', s: 'owner-occupied, starting 1 mile from your shop' },
          { n: '2', t: 'Phones verified', s: 'real owner numbers, not guesses' },
          { n: '3', t: 'Ready to call', s: `each lead comes with a pre-written intro` },
        ].map((x) => (
          <div key={x.n} style={{
            padding: '14px 14px', borderRadius: 12,
            background: '#F9F5EC',
            border: '1px solid #E3D8C2',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7, marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#fef3ec', color: '#c2410c',
              fontSize: 12, fontWeight: 900,
            }}>{x.n}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1f2937', marginBottom: 3 }}>{x.t}</div>
            <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.45 }}>{x.s}</div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
        Wrong address or trade? <Link href="/dashboard/settings" style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>Update in Settings →</Link>
      </p>

      <style>{`
        @keyframes lwPulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
      `}</style>
    </div>
  )
}
