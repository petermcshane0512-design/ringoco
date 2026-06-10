'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LEADS_PER_WEEK, LEADS_PER_MONTH, PRICE_PER_LEAD_INTRO_USD } from '@/lib/offer'

/**
 * /free-lead?b={biz_id} — cold-email landing page.
 *
 * Reveals the pre-pulled homeowner lead in 8 seconds (anticipation theater)
 * then asks for the $97 trial. Designed to convert at 25-30% open → click,
 * 30% click → checkout per the 2.7% Hormozi/Elon system target.
 *
 * SINGLE CTA. NO NAV. NO FOOTER. No competing eye paths. Hormozi:
 * "every additional choice on the page costs you 5%."
 *
 * Server-side data flow:
 *   1. Page load → fetch /api/free-lead/claim?b={biz_id}
 *   2. Show "PULLING YOUR LEAD..." spinner for 8 sec (real fetch < 1s)
 *   3. Reveal full lead (name, address, phone, signal, est value, AI script preview)
 *   4. Single ORANGE CTA: "Lock this zip — $97" → Stripe via /start?promo=FIRST400&b={biz_id}
 */

export const dynamic = 'force-dynamic'

const FOUNDER_PHONE = '(773) 710-9565'
const FOUNDER_PHONE_HREF = 'tel:+17737109565'

type LeadDTO = {
  owner: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  email: string | null
  year_built: number | null
  value: number | null
  signal: string | null
  signal_detail: string | null
  est_job_min: number | null
  est_job_max: number | null
  trade: string | null
}

function FreeLeadInner() {
  const params = useSearchParams()
  const bizId = params.get('b') || ''
  const [lead, setLead] = useState<LeadDTO | null>(null)
  const [phase, setPhase] = useState<'pulling' | 'revealed' | 'missing'>('pulling')
  const [progress, setProgress] = useState(0)
  const fetched = useRef(false)

  useEffect(() => {
    if (!bizId || fetched.current) return
    fetched.current = true

    // Start fetch + 8s theater progress in parallel.
    const start = Date.now()
    fetch(`/api/free-lead/claim?b=${encodeURIComponent(bizId)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((j) => {
        const elapsed = Date.now() - start
        const wait = Math.max(0, 8000 - elapsed)
        setTimeout(() => {
          if (j.ok && j.lead) {
            setLead(j.lead as LeadDTO)
            setPhase('revealed')
          } else {
            setPhase('missing')
          }
        }, wait)
      })
      .catch(() => {
        setTimeout(() => setPhase('missing'), 8000 - (Date.now() - start))
      })

    // Tick progress 0 → 100 over 8 sec.
    const tickStart = Date.now()
    const id = setInterval(() => {
      const p = Math.min(100, ((Date.now() - tickStart) / 8000) * 100)
      setProgress(p)
      if (p >= 100) clearInterval(id)
    }, 80)
    return () => clearInterval(id)
  }, [bizId])

  const checkoutUrl = bizId
    ? `/start?promo=FIRST400&b=${encodeURIComponent(bizId)}`
    : `/start?promo=FIRST400`

  return (
    <main style={shellStyle}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,248,240,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(232,116,43,0.18)', padding: '10px clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/logo.png" alt="BellAveGo" width={220} height={68} priority style={{ objectFit: 'contain', maxWidth: 'min(46vw, 220px)', height: 'auto' }} />
        </Link>
        <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 800, fontSize: 14 }}>
          📞 {FOUNDER_PHONE}
        </a>
      </div>

      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(16px, 5vw, 40px)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {/* PHASE 1 — PULLING */}
          {phase === 'pulling' && (
            <div style={cardPulling}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#16803F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                🔍 Pulling your free homeowner lead…
              </div>
              <h1 style={pullingH1}>Scraping permits + property records in your zip…</h1>
              <p style={{ fontSize: 14, color: '#4A6670', margin: '0 0 26px' }}>
                Cross-referencing BatchData + NOAA + MLS. Skip-tracing the phone.
              </p>

              <div style={progressBarShell}>
                <div style={{ ...progressBarFill, width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 8, textAlign: 'center', fontFamily: 'ui-monospace, monospace' }}>
                {progress < 33 ? 'Querying public records' : progress < 66 ? 'Verifying phone via BatchData' : progress < 95 ? 'Scoring intent' : 'Almost done…'}
              </div>
            </div>
          )}

          {/* PHASE 2 — REVEALED */}
          {phase === 'revealed' && lead && (
            <div>
              <div style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 99, background: 'rgba(34,197,94,0.16)', color: '#16803F', fontSize: 11, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 16 }}>
                ✓ Your free lead is ready
              </div>
              <h1 style={revealH1}>
                Here&rsquo;s 1 real homeowner in <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{lead.zip}</span>.
              </h1>
              <p style={{ fontSize: 15, color: '#4A6670', margin: '0 0 24px', lineHeight: 1.55 }}>
                Yours to call today. No catch. <strong style={{ color: '#0B1F3A' }}>Want {LEADS_PER_MONTH} more like this for $97?</strong> Read on.
              </p>

              {/* Lead card */}
              <div style={leadCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>{lead.owner || 'Homeowner'}</div>
                    <div style={{ fontSize: 13, color: '#4A6670', marginTop: 4 }}>
                      {lead.street ? `${lead.street} · ` : ''}{lead.city} {lead.state} {lead.zip}
                    </div>
                  </div>
                  {lead.trade && (
                    <span style={tradePill}>{lead.trade.toUpperCase()}</span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
                  {lead.phone && (
                    <KV label="Verified phone" value={lead.phone} mono />
                  )}
                  {lead.signal && (
                    <KV label="Signal" value={`${signalEmoji(lead.signal)} ${lead.signal.replace('_', '-')}`} />
                  )}
                  {lead.year_built && (
                    <KV label="Year built" value={`${lead.year_built}`} />
                  )}
                  {lead.value && (
                    <KV label="Est. home value" value={`$${Math.round(Number(lead.value)).toLocaleString()}`} />
                  )}
                </div>

                {lead.signal_detail && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(232,116,43,0.10)', fontSize: 13.5, color: '#C84B26', fontWeight: 700, marginBottom: 14 }}>
                    🔥 {lead.signal_detail}
                  </div>
                )}

                {(lead.est_job_min || lead.est_job_max) && (
                  <div style={{ padding: '14px 16px', borderRadius: 11, background: 'linear-gradient(135deg, #FFD9A8, #FFF8F0)', border: '1.5px solid rgba(232,116,43,0.30)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0B1F3A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Est. job value</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#C84B26' }}>
                      ${(Number(lead.est_job_min) || 0).toLocaleString()} – ${(Number(lead.est_job_max) || 0).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* OFFER STACK */}
              <div style={offerCard}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Your offer
                </div>
                <h2 style={offerH1}>
                  <span style={{ background: 'linear-gradient(135deg, #22C55E, #16803F)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{LEADS_PER_MONTH} leads</span> like this for <span style={{ background: 'linear-gradient(135deg, #22C55E, #16803F)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>$97</span>.
                </h2>
                <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.55, margin: '0 0 18px' }}>
                  {LEADS_PER_WEEK} fresh homeowner leads in {lead.zip || 'your zip'} every week for 4 weeks. Verified phones. Pre-written outreach script per lead. <strong style={{ color: '#0B1F3A' }}>${PRICE_PER_LEAD_INTRO_USD.toFixed(2)} per lead first month</strong> — vs HomeAdvisor at $40-300 shared with 4 other shops.
                </p>

                <ul style={offerBullets}>
                  {[
                    `${LEADS_PER_WEEK} exclusive homeowner leads every week — ${LEADS_PER_MONTH} total month 1`,
                    'Verified phone on every lead (skip-traced)',
                    'Ready-to-send outreach script per lead',
                    'AI-scored 0-100 by intent + ticket size',
                    'The 1-Job Guarantee: book a paying job in 30 days or refund + next month free',
                  ].map((line) => (
                    <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <span style={{ flexShrink: 0, marginTop: 4, width: 14, height: 14, borderRadius: 4, background: 'linear-gradient(135deg, #22C55E, #14B8A6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
                          <path d="M3 8.5l3.5 3.5 6.5-7" />
                        </svg>
                      </span>
                      <span style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.5 }}>{line}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link href={checkoutUrl} style={ctaPrimary}>
                  Lock my zip — $97 →
                </Link>
                <p style={{ fontSize: 12, color: '#7AAAB2', textAlign: 'center', margin: '12px 0 0' }}>
                  90-second checkout · $497/mo starting month 2 · Cancel anytime
                </p>
              </div>

              {/* Founder note */}
              <p style={{ fontSize: 12.5, color: '#4A6670', textAlign: 'center', margin: '28px 0 0', lineHeight: 1.55 }}>
                The lead above is yours regardless. Don&rsquo;t sign up = no follow-up. <br />
                Questions? <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>{FOUNDER_PHONE}</a>
              </p>
            </div>
          )}

          {/* PHASE 3 — MISSING (fallback if no biz_id or no pre-pulled lead) */}
          {phase === 'missing' && (
            <div style={cardPulling}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                Hmm — link expired or invalid
              </div>
              <h1 style={pullingH1}>Want a free homeowner lead in your zip?</h1>
              <p style={{ fontSize: 14, color: '#4A6670', margin: '0 0 22px', lineHeight: 1.55 }}>
                Reply to the email I sent you and I&rsquo;ll pull one fresh — 60 seconds.
                Or skip ahead and lock your zip for $97 first month: {LEADS_PER_MONTH} fresh leads in your service area.
              </p>
              <Link href={checkoutUrl} style={ctaPrimary}>
                Lock my zip — $97 →
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default function FreeLeadPage() {
  return (
    <Suspense fallback={null}>
      <FreeLeadInner />
    </Suspense>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, color: '#7AAAB2', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0B1F3A', marginTop: 2, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}>{value}</div>
    </div>
  )
}

function signalEmoji(s: string): string {
  if (/permit/i.test(s)) return '🏛'
  if (/storm/i.test(s)) return '⛈'
  if (/aged/i.test(s)) return '🌡'
  if (/move/i.test(s)) return '🏠'
  return '🔔'
}

const shellStyle: React.CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  background: '#FFF8F0',
  color: '#0B1F3A',
  minHeight: '100vh',
}

const cardPulling: React.CSSProperties = {
  padding: 'clamp(24px, 4vw, 36px)',
  borderRadius: 18,
  background: '#FFFFFF',
  border: '1.5px solid rgba(232,116,43,0.22)',
  boxShadow: '0 22px 60px rgba(11,31,58,0.10)',
}

const pullingH1: React.CSSProperties = {
  fontSize: 'clamp(22px, 3vw, 32px)',
  fontWeight: 900,
  letterSpacing: '-0.03em',
  lineHeight: 1.15,
  margin: '0 0 8px',
}

const progressBarShell: React.CSSProperties = {
  width: '100%', height: 8, borderRadius: 99,
  background: 'rgba(11,31,58,0.08)', overflow: 'hidden',
}

const progressBarFill: React.CSSProperties = {
  height: '100%',
  background: 'linear-gradient(90deg, #FF9D5A, #E8742B, #C84B26)',
  borderRadius: 99,
  transition: 'width 80ms linear',
}

const revealH1: React.CSSProperties = {
  fontSize: 'clamp(26px, 3.6vw, 38px)',
  fontWeight: 900,
  letterSpacing: '-0.03em',
  lineHeight: 1.1,
  margin: '0 0 10px',
}

const leadCard: React.CSSProperties = {
  padding: 'clamp(20px, 3vw, 28px)',
  borderRadius: 16,
  background: '#FFFFFF',
  border: '2px solid rgba(34,197,94,0.40)',
  boxShadow: '0 22px 56px rgba(11,31,58,0.10)',
  marginBottom: 24,
}

const tradePill: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 7,
  background: 'rgba(11,31,58,0.06)',
  color: '#0B1F3A', fontSize: 11, fontWeight: 800,
  letterSpacing: '0.08em',
}

const offerCard: React.CSSProperties = {
  padding: 'clamp(24px, 4vw, 36px)',
  borderRadius: 18,
  background: 'linear-gradient(165deg, #FFFFFF, #FFF8F0)',
  border: '2px solid #E8742B',
  boxShadow: '0 26px 64px rgba(232,116,43,0.18)',
}

const offerH1: React.CSSProperties = {
  fontSize: 'clamp(26px, 3.8vw, 42px)',
  fontWeight: 900,
  letterSpacing: '-0.04em',
  lineHeight: 1.05,
  margin: '0 0 12px',
}

const offerBullets: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: '0 0 22px',
}

const ctaPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%',
  padding: '20px 32px', borderRadius: 14,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontSize: 18, fontWeight: 900, letterSpacing: '-0.01em',
  boxShadow: '0 14px 36px rgba(232,116,43,0.42)',
}
