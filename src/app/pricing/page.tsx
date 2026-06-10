'use client'

/**
 * /pricing — 2026-06-09 leads-only rewrite.
 *
 * Single plan. $97 first month via FIRST400 → $497/mo flat from month 2.
 * Annual $4,997/yr saves $968. 80 leads/mo. AI auto-outreach included.
 * Performance guarantee: 1 paying job in 30 days or full refund.
 *
 * Stripe price IDs come from src/lib/pricing.ts (PRICE_IDS_V2.officemgr).
 * That file points at the new v9 Stripe prices (price_1TgUZF... monthly,
 * price_1TgUan... annual). FIRST400 promo code applied at checkout.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import Image from 'next/image'
import { GUARANTEE_SHORT, LEADS_PER_WEEK, LEADS_PER_MONTH, PRICE_PER_LEAD_USD, PRICE_PER_LEAD_INTRO_USD } from '@/lib/offer'
// LiveActivityMarquee import removed 2026-06-09 per brief rule "no invented customer counts / activity".

// 2026-06-09 — Annual toggle removed per P3 of pricing-fix brief. One
// plan, one price, no decision-paralysis switcher. Interval type kept as
// a literal for back-compat w/ checkout body shape (always 'monthly').
type Interval = 'monthly'

const FOUNDER_PHONE = '(773) 710-9565'
const FOUNDER_PHONE_HREF = 'tel:+17737109565'

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  // Force interval to monthly always — annual price archived in Stripe
  // (see docs/stripe-coupon-config-2026-06-09.md follow-up).
  const interval: Interval = 'monthly'

  // Auto-resume checkout after sign-up redirect: /pricing?autocheckout=1
  // 2026-06-09 — annual toggle removed; legacy ?interval=annual URL params
  // coerced to 'monthly' so the checkout body shape stays correct.
  useEffect(() => {
    if (!isLoaded) return
    const params = new URLSearchParams(window.location.search)
    const autoCheckout = params.get('autocheckout') === '1'
    if (autoCheckout && isSignedIn) {
      fetch('/api/profile')
        .then(r => r.json())
        .then(p => {
          if (p?.onboarding_complete || p?.setup_complete) {
            handleCheckout('monthly')
          } else {
            router.push(`/dashboard/setup?redirect_url=${encodeURIComponent('/pricing?autocheckout=1')}`)
          }
        })
        .catch(() => {
          router.push(`/dashboard/setup?redirect_url=${encodeURIComponent('/pricing?autocheckout=1')}`)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

  async function handleCheckout(intv: Interval) {
    if (!isSignedIn) {
      const next = encodeURIComponent(`/pricing?autocheckout=1`)
      router.push(`/sign-up?redirect_url=${next}`)
      return
    }
    setLoading(true)
    try {
      const urlPromo = new URLSearchParams(window.location.search).get('promo') || ''
      const cookiePromo = document.cookie.match(/bavg_promo=([^;]+)/)?.[1] || ''
      const promoCode = (urlPromo || cookiePromo).trim().toUpperCase() || 'FIRST400'
      // Forward biz_id (from /free-lead cold-email landing) so Stripe
      // webhook can attribute conversion back to prospect_free_leads.
      const urlBiz = new URLSearchParams(window.location.search).get('b') || ''
      const cookieBiz = document.cookie.match(/bavg_biz_id=([^;]+)/)?.[1] || ''
      const bizId = (urlBiz || cookieBiz).trim().slice(0, 64)
      // 2026-06-10 — T3 territory: forward zip + trade picked at
      // /start/area so the webhook can call claimTerritory() on
      // checkout.session.completed.
      const urlZip = new URLSearchParams(window.location.search).get('zip') || ''
      const urlTrade = new URLSearchParams(window.location.search).get('trade') || ''
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'officemgr',
          interval: intv,
          creatorCode: promoCode,
          bizId: bizId || undefined,
          zip: urlZip || undefined,
          trade: urlTrade || undefined,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else {
        setLoading(false)
        alert(`Checkout failed: ${data?.error ?? 'Unknown error'}\nText us at 773-710-9565.`)
      }
    } catch {
      setLoading(false)
      alert('Network error. Try again.')
    }
  }

  // 2026-06-09 — annual toggle removed; only monthly $497.
  const monthlyPrice = 497

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', minHeight: '100vh' }}>
      {/* NAV — bumped to match homepage */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px clamp(16px, 4vw, 56px)',
        background: 'rgba(255,248,240,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(232,116,43,0.18)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/logo.png" alt="BellAveGo" width={380} height={118} style={{ objectFit: 'contain', maxWidth: 'min(52vw, 380px)', height: 'auto' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Link href="/founder" style={navLinkBig}>Founder</Link>
          <a href={FOUNDER_PHONE_HREF} style={{ ...navLinkBig, color: '#C84B26', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            📞 {FOUNDER_PHONE}
          </a>
          {isSignedIn ? (
            <Link href="/dashboard" style={navCTABig}>Dashboard →</Link>
          ) : (
            <>
              <Link href="/sign-in" style={navLinkBig}>Sign in</Link>
              <Link href="/start?promo=FIRST400" style={navCTABig}>Get my first month — $97 →</Link>
            </>
          )}
        </div>
      </nav>

      {/* LiveActivityMarquee removed 2026-06-09 per brief rule "no invented activity / customer counts" until we have real signups to render. */}

      {/* PRICE TIER FIRST — per Peter, price is the first thing the page shows.
          Compact pill above + the offer card directly below. No verbose hero. */}
      <section style={{ padding: 'clamp(24px, 4vw, 44px) clamp(16px, 5vw, 48px) 28px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderRadius: 99,
          background: '#FFE9D2',
          border: '1.5px solid #FFC58A',
          fontSize: 12, fontWeight: 800, color: '#A33C18',
          marginBottom: 14,
        }}>Founding-100 price — $497/mo locked for life</span>
        <h1 style={{
          fontSize: 'clamp(28px, 3.8vw, 42px)',
          fontWeight: 900, letterSpacing: '-0.04em',
          lineHeight: 1.05, margin: '0 0 8px',
          color: '#0B1F3A',
        }}>
          <span style={{
            background: 'linear-gradient(135deg, #22C55E 0%, #16803F 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>{LEADS_PER_MONTH} fresh exclusive leads</span> for <span style={{
            background: 'linear-gradient(135deg, #22C55E 0%, #16803F 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>$97</span> first month.
        </h1>
        <p style={{ fontSize: 14, color: '#4A6670', margin: '0 auto', maxWidth: 540, lineHeight: 1.5 }}>
          ${PRICE_PER_LEAD_INTRO_USD.toFixed(2)} per lead first month. HomeAdvisor charges $40-300 shared with 4 other shops. We don&rsquo;t.
        </p>
      </section>

      {/* PRICING CARD — now directly under the small hero */}
      <section style={{ padding: '0 clamp(16px, 5vw, 48px) 48px' }}>
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          {/* Monthly/Annual toggle removed 2026-06-09 per P3 — one plan, one price. */}

          {/* Card */}
          <div style={{
            background: 'linear-gradient(165deg, #FFFFFF 0%, #FFF8F0 100%)',
            borderRadius: 22,
            border: '2px solid rgba(232,116,43,0.30)',
            padding: 'clamp(28px, 3.4vw, 38px)',
            boxShadow: '0 22px 60px rgba(11,31,58,0.10)',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 99,
              background: 'linear-gradient(135deg, #22C55E, #16803F)',
              color: '#fff', fontSize: 10.5, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase',
              marginBottom: 14,
            }}>First month · code FIRST400</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
              <span style={{
                fontSize: 'clamp(64px, 9vw, 96px)', fontWeight: 900,
                letterSpacing: '-0.04em', lineHeight: 0.95,
                background: 'linear-gradient(135deg, #22C55E 0%, #16803F 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>$97</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#4A6670' }}>first month</span>
            </div>
            <div style={{ fontSize: 13.5, color: '#0B1F3A', marginBottom: 6, fontWeight: 600 }}>
              &mdash; <strong>${monthlyPrice}/mo</strong> starting month 2. Didn&rsquo;t book a job in your first 30 days? Full refund and month 2 free.
            </div>
            <div style={{ fontSize: 11.5, color: '#7AAAB2', marginBottom: 18 }}>
              Cancel anytime · No setup · The 1-Job Guarantee covers your first 30 days
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 22px', display: 'grid', gap: 9 }}>
              {[
                `${LEADS_PER_WEEK} exclusive homeowner leads every week — ${LEADS_PER_MONTH}/month, your area only`,
                'Verified phone number on every lead (skip-traced, not guessed)',
                'Ready-to-send outreach script per lead — call, text, or email',
                'Need more? Extra leads $25 each',
                GUARANTEE_SHORT,
                'Cancel anytime · No setup · Leads land in your inbox Monday morning',
              ].map((line) => (
                <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                  <span style={{
                    flexShrink: 0, marginTop: 3,
                    width: 18, height: 18, borderRadius: 6,
                    background: 'linear-gradient(135deg, #22C55E, #14B8A6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.5l3.5 3.5 6.5-7" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.5, fontWeight: 500 }}>{line}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleCheckout(interval)}
              disabled={loading}
              style={{
                width: '100%', padding: '16px', borderRadius: 13,
                background: loading
                  ? 'rgba(11,31,58,0.3)'
                  : 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
                color: '#fff', border: 'none', cursor: loading ? 'wait' : 'pointer',
                fontSize: 15.5, fontWeight: 900, letterSpacing: '-0.02em',
                boxShadow: '0 14px 36px rgba(232,116,43,0.40)',
              }}
            >
              {loading ? 'Loading…' : 'Get my first month — $97'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 14, fontSize: 11.5, color: '#7AAAB2' }}>
              <span>🔒 Secure Stripe checkout</span>
              <span>·</span>
              <span>Card collected upfront</span>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section style={{ padding: '40px clamp(16px, 5vw, 48px)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 900, letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 12px', color: '#0B1F3A' }}>
            Way cheaper than the alternatives.{' '}
            <span style={{ color: '#E8742B' }}>And the leads are exclusive to you.</span>
          </h2>
          <p style={{ fontSize: 15, color: '#4A6670', textAlign: 'center', maxWidth: 580, margin: '0 auto 28px', lineHeight: 1.6 }}>
            HomeAdvisor charges per lead AND shares it with 4 other shops. We don&rsquo;t.
          </p>
          <div style={{ overflowX: 'auto', borderRadius: 16, background: '#FFFFFF', border: '1px solid rgba(232,116,43,0.18)', boxShadow: '0 14px 40px rgba(11,31,58,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'rgba(232,116,43,0.06)' }}>
                  <th style={th}>Source</th>
                  <th style={th}>Price / lead</th>
                  <th style={th}>Exclusive?</th>
                  <th style={th}>Outreach?</th>
                </tr>
              </thead>
              <tbody>
                <tr style={trStyle}>
                  <td style={td}>HomeAdvisor / Angi</td>
                  <td style={td}>$40-300</td>
                  <td style={tdMuted}>❌ shared 3-5 ways</td>
                  <td style={tdMuted}>❌ You call em</td>
                </tr>
                <tr style={trStyle}>
                  <td style={td}>Yelp leads</td>
                  <td style={td}>$20-100</td>
                  <td style={tdMuted}>❌ shared</td>
                  <td style={tdMuted}>❌ You call em</td>
                </tr>
                <tr style={trStyle}>
                  <td style={td}>Networx</td>
                  <td style={td}>$20-80</td>
                  <td style={tdMuted}>❌ shared</td>
                  <td style={tdMuted}>❌ You call em</td>
                </tr>
                <tr style={{ background: 'linear-gradient(90deg, rgba(255,217,168,0.40) 0%, rgba(255,157,90,0.20) 100%)', borderTop: '2px solid rgba(232,116,43,0.40)' }}>
                  <td style={{ ...td, fontWeight: 900, color: '#C84B26' }}>BellAveGo</td>
                  <td style={{ ...td, fontWeight: 900, color: '#C84B26' }}>${PRICE_PER_LEAD_USD.toFixed(2)}</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0B1F3A' }}>✓ EXCLUSIVE per zip</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0B1F3A' }}>✓ AI texts + emails as you</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#4A6670' }}>
            ${PRICE_PER_LEAD_USD.toFixed(2)}/lead at {LEADS_PER_MONTH} leads/mo ({LEADS_PER_WEEK}/wk) for $497. Extra leads $25 each when you want more.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '48px clamp(16px, 5vw, 48px) 64px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: 900, letterSpacing: '-0.02em', textAlign: 'center', margin: '0 0 26px', color: '#0B1F3A' }}>
            Quick answers
          </h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {[
              { q: 'What if my zip code is already locked?', a: 'Enter your zip at signup — we tell you instantly if it&rsquo;s open. If it&rsquo;s gone, we hold your spot for the next 7 days as backup. No charge to check.' },
              { q: 'Where do the names + phones come from? Is this legal?', a: 'Public records. Building permits (filed at city hall), county property records, MLS sold data, NOAA storm data, USPS move-in data. All public. A paid skip-trace pulls verified phone. All compliant — same data Angi + HomeAdvisor use, except we don&rsquo;t share it.' },
              { q: `Do I have to cold-call all ${LEADS_PER_MONTH} leads?`, a: 'No. AI sends a friendly intro text + email to each one from your number, signed by you, mentioning your shop. You only call back the people who reply YES.' },
              { q: 'What does the performance guarantee mean exactly?', a: 'If you don&rsquo;t book at least 1 paying job from leads we delivered in the first 30 days, we refund every dollar charged. Just open a refund request from the dashboard. No call required.' },
              { q: 'What if I cancel — do I lose the leads?', a: 'Keep every lead we ever sent you. No clawback. Cancel in dashboard in 2 clicks.' },
              { q: 'How is this different from HomeAdvisor / Angi?', a: `HomeAdvisor: $40-300/lead, sold to 4-5 shops, you cold-call. Us: $${PRICE_PER_LEAD_USD.toFixed(2)}/lead, exclusive to you, AI sends the intro for you. Opposite product, opposite model.` },
            ].map((f) => (
              <details key={f.q} style={{
                padding: '18px 22px',
                background: '#FFFFFF',
                border: '1.5px solid rgba(232,116,43,0.18)',
                borderRadius: 14,
              }}>
                <summary style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', cursor: 'pointer', listStyle: 'none' }}>
                  {f.q}
                </summary>
                <p style={{ fontSize: 14, color: '#3D5A66', lineHeight: 1.65, margin: '10px 0 0' }}
                   dangerouslySetInnerHTML={{ __html: f.a }} />
              </details>
            ))}
          </div>
          <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: '#7AAAB2' }}>
            Other questions? Text us at <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 700, textDecoration: 'none' }}>{FOUNDER_PHONE}</a>.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '36px 24px', background: '#FFF7EE', borderTop: '1px solid rgba(232,116,43,0.18)', textAlign: 'center' }}>
        <Image src="/logo.png" alt="BellAveGo" width={200} height={62} style={{ objectFit: 'contain', marginBottom: 10 }} />
        <p style={{ margin: 0, fontSize: 11, color: '#7AAAB2' }}>Exclusive homeowner lead-gen for HVAC, plumbing, electrical, roofing, and handyman pros · Cancel anytime</p>
        <p style={{ margin: '12px 0 0', fontSize: 11, color: '#7AAAB2' }}>
          <Link href="/founder" style={{ color: '#C84B26', textDecoration: 'none' }}>Founder</Link>
          {' · '}
          <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</Link>
          {' · '}
          <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</Link>
          {' · '}© 2026 BellAveGo LLC
        </p>
      </footer>
    </main>
  )
}

const navLink: React.CSSProperties = { color: '#4A6670', textDecoration: 'none', fontWeight: 700, fontSize: 14 }
const navCTA: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 13,
  boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
}
const navLinkBig: React.CSSProperties = {
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 800, fontSize: 16,
  padding: '8px 4px', letterSpacing: '-0.01em',
}
const navCTABig: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '14px 24px', borderRadius: 12,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 16,
  letterSpacing: '-0.01em',
  boxShadow: '0 10px 26px rgba(232,116,43,0.40)',
}
// tabBtn helper removed 2026-06-09 — annual toggle gone.
const th: React.CSSProperties = {
  textAlign: 'left', padding: '14px 18px 10px',
  fontSize: 11, fontWeight: 800, letterSpacing: '0.10em',
  textTransform: 'uppercase' as const, color: '#C84B26',
}
const td: React.CSSProperties = {
  padding: '14px 18px', fontSize: 13.5, color: '#0B1F3A',
  verticalAlign: 'middle' as const,
}
const tdMuted: React.CSSProperties = { ...td, color: '#7AAAB2' }
const trStyle: React.CSSProperties = { borderTop: '1px solid rgba(232,116,43,0.10)' }
