'use client'

/**
 * Live pricing page — v8 (Starter $147 / Pro $297 / Elite $597 / Multi-Loc $2,497/loc).
 *
 * Display + price values come from this file directly but are wired to the
 * v8 Stripe prices via src/lib/pricing.ts (PRICE_IDS_V2).
 *
 * Rollback: set PRICING_VERSION=v1_legacy in Vercel + redeploy.
 * That flips the underlying price IDs back to v7 ($397/$797/$1,997). For
 * full label rollback (Mission Control / Operator / Concierge), this page
 * needs a manual edit — see docs/pricing-rollback.md.
 *
 * Older $179/$497/$997 page preserved at /pricing-legacy for deeper reference.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import Image from 'next/image'

type Tier = 'receptionist' | 'officemgr' | 'concierge'
type Interval = 'monthly' | 'annual'

type Plan = {
  tier: Tier
  name: string
  monthly: number
  annual: number
  setup: number
  tagline: string
  popular: boolean
  features: { label: string; auto: boolean }[]
}

const PLANS: Plan[] = [
  {
    tier: 'receptionist',
    name: 'Starter',
    monthly: 147,
    annual: 122,
    setup: 0,
    tagline: 'AI answers every call. You close it in one tap.',
    popular: false,
    features: [
      { label: 'YOUR OWN dedicated AI receptionist — not a shared bot. Yours is trained on your business name, services, and rules from day one. (Most competitors run every customer through one shared assistant.)', auto: true },
      { label: 'A2P 10DLC SMS compliance handled — we attach you to our verified messaging service at signup and submit your brand to the carriers. During the 1–14 day brand-approval window, lead alerts route through our backup line so you never miss a notification while waiting.', auto: true },
      { label: '6 AI Consulting Reports / year — bi-monthly revenue intelligence: missed calls, top services, quote-to-close ratio, what to fix. ($5K–$15K value if you hired a consultant.)', auto: true },
      { label: '24/7 AI call answering — never miss a job again', auto: true },
      { label: 'Up to 60 inbound calls / month (≈2 per day) — upgrade to Pro for 300/mo, or Elite for unlimited, when you outgrow it', auto: true },
      { label: '📅 Live calendar booking — your AI auto-books to your Google Calendar, Outlook, or Calendly (when connected and auto-booking enabled in settings)', auto: true },
      { label: 'Auto-provisioned local number in your area code (~30 seconds at signup)', auto: true },
      { label: 'AI captures name · callback # · what they need · preferred time (if mentioned) · urgency', auto: true },
      { label: 'Instant text summary to your phone in 20 seconds', auto: true },
      { label: 'One-tap actions on every lead text: tap-to-call back · reply YES to confirm · reply NO to decline', auto: true },
      { label: 'Emergency routing — outbound voice call to your cell on urgent jobs', auto: true },
      { label: 'Live dashboard with full call transcripts + audio', auto: true },
      { label: 'Welcome AI business diagnostic within 24 hours of signup', auto: true },
      { label: 'Self-serve Stripe billing portal · 30-day money-back guarantee', auto: true },
    ],
  },
  {
    tier: 'officemgr',
    name: 'Pro',
    monthly: 297,
    annual: 248,
    setup: 0,
    tagline: 'Five AIs running your back office while you turn wrenches.',
    popular: true,
    features: [
      { label: 'Everything in Starter, plus:', auto: false },
      { label: 'Dual-channel lead alerts — every lead arrives as SMS AND email. You won\'t miss a job because your phone died, you were on vacation, or your carrier filtered the text.', auto: true },
      { label: '12 AI Consulting Reports / year — monthly revenue intelligence: sales coaching from your actual call transcripts, lead-source attribution, customer lifetime value trends, AI-recommended price increases.', auto: true },
      { label: 'Up to 300 inbound calls / month (≈10 per day) — fits the vast majority of multi-truck operations. Upgrade to Elite for unlimited when you scale past it.', auto: true },
      { label: 'AI Quote Hunter — auto follow-up SMS day 2 / 7 / 14 on every open quote you log', auto: true },
      { label: 'AI Collections — auto-chase past-due invoices you flag, with pay-by-text Stripe links auto-generated', auto: true },
      { label: 'AI Reputation — auto-SMS past customers asking for Google reviews (Google Business Profile link required)', auto: true },
      { label: 'Smart Call-Summary Insights — sales tip with every callback alert', auto: true },
      { label: 'Priority email support — 24-hour SLA', auto: true },
    ],
  },
  {
    tier: 'concierge',
    name: 'Elite',
    monthly: 597,
    annual: 498,
    setup: 0,
    tagline: 'AI runs your back office AND your marketing. You just close the work.',
    popular: false,
    features: [
      { label: 'Everything in Pro, plus:', auto: false },
      { label: 'Unlimited inbound calls — no monthly cap', auto: true },
      { label: '24 AI Consulting Reports / year (bi-weekly) + 4 quarterly McKinsey-style deep-dives', auto: true },
      { label: 'AI Marketing Operations — the full growth stack:', auto: false },
      { label: 'AI Ad Creative Generator — Google + Meta ad copy weekly from your own call transcripts', auto: true },
      { label: 'AI Lead Sourcing — permits + severe-weather alerts → outbound SMS', auto: true },
      { label: 'AI Past-Customer Reactivation — drip campaigns to dormant customers', auto: true },
      { label: 'AI Competitor Watcher — weekly intel on 5 competitors in your service area', auto: true },
      { label: 'AI Local SEO — weekly blog posts auto-published to your site', auto: true },
      { label: 'AI Job-Site Photo Studio — text us a completed-job photo, AI generates ready-to-post Instagram + Facebook + Google Business Profile updates with caption, hashtags, and a one-tap review request to the customer', auto: true },
      { label: '4-hour priority SLA on all support tickets', auto: true },
      { label: 'Custom AI prompt tuning — your shop’s voice, service catalog, pricing rules', auto: true },
    ],
  },
]

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [interval, setInterval] = useState<Interval>('monthly')
  const [loading, setLoading] = useState<Tier | null>(null)
  const isAnnual = interval === 'annual'

  // Auto-resume checkout after sign-up redirect: /pricing?tier=X&interval=Y&autocheckout=1
  useEffect(() => {
    if (!isLoaded) return
    const params = new URLSearchParams(window.location.search)
    const autoTier = params.get('tier') as Tier | null
    const autoInterval = params.get('interval') as Interval | null
    const autoCheckout = params.get('autocheckout') === '1'
    if (autoCheckout && autoTier && isSignedIn) {
      handleCheckout(autoTier, autoInterval ?? 'monthly')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

  async function handleCheckout(tier: Tier, intv: Interval) {
    // Concierge is waitlist-only until Q3 2026 launch
    if (tier === 'concierge') {
      router.push('/waitlist?tier=concierge')
      return
    }
    if (!isSignedIn) {
      const next = encodeURIComponent(`/pricing?tier=${tier}&interval=${intv}&autocheckout=1`)
      router.push(`/sign-up?redirect_url=${next}`)
      return
    }
    setLoading(tier)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval: intv }),
      })
      const data = await res.json()
      if (data.waitlist && data.redirect) {
        router.push(data.redirect)
        return
      }
      if (data.url) {
        window.location.href = data.url
      } else {
        setLoading(null)
        alert(`Checkout failed: ${data?.error ?? 'Unknown error'}\n\nText our team at 773-710-9565.`)
      }
    } catch {
      setLoading(null)
      alert('Network error. Please try again.')
    }
  }

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh' }}>

      <nav className="bavg-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 clamp(14px, 4vw, 48px)', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" className="bavg-top-nav-logo" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ objectFit: 'contain', marginTop: 10 }} />
        </Link>
        <div className="bavg-top-nav-actions" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn && (
            <Link href="/dashboard" className="nav-cta"><span className="nav-cta-text">Dashboard</span></Link>
          )}
          <Link href="/founder" className="why-pulse"><span className="why-pulse-text">Why BellAveGo?</span></Link>
          <Link href="/pricing" className="price-pulse">Pricing</Link>
          {!isSignedIn && (
            <>
              <Link href="/sign-in" className="signin-link">Sign In</Link>
              <Link href="/sign-up" className="nav-cta"><span className="nav-cta-text">Create Account</span></Link>
            </>
          )}
        </div>
      </nav>

      <section style={{ padding: '72px 24px 32px', textAlign: 'center', maxWidth: 1200, margin: '0 auto' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Pricing</p>
        <h1 style={{ fontSize: 'clamp(34px, 4.4vw, 56px)', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 16 }}>
          AI answers every call.<br/>
          <span style={{ background: 'linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 50%, #0AA89F 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>You close it in one tap.</span>
        </h1>
        <p style={{ fontSize: 17, color: '#4A6670', maxWidth: 680, margin: '0 auto 28px', lineHeight: 1.6 }}>
          One subscription replaces voicemail, your office manager, your collections agent, and your reputation manager. Every feature runs on autopilot — your AI does the work, you just close.
        </p>

        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #DCE9E2', borderRadius: 999, padding: 4, gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setInterval('monthly')}
            style={{
              padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: !isAnnual ? 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)' : 'transparent',
              color: !isAnnual ? '#fff' : '#4A6670',
              transition: 'all 0.18s ease',
            }}
          >Monthly</button>
          <button
            onClick={() => setInterval('annual')}
            style={{
              padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: isAnnual ? 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)' : 'transparent',
              color: isAnnual ? '#fff' : '#4A6670',
              transition: 'all 0.18s ease',
            }}
          >Annual <span style={{ fontSize: 10, padding: '2px 6px', background: isAnnual ? 'rgba(255,255,255,0.22)' : 'rgba(34,197,94,0.16)', color: isAnnual ? '#fff' : '#16A34A', borderRadius: 4, marginLeft: 6, fontWeight: 800 }}>SAVE 17%</span></button>
        </div>
        <p style={{ fontSize: 12, color: '#7AAAB2', margin: 0 }}>{isAnnual ? '12 months for the price of 10. Billed once.' : 'Cancel anytime.'}</p>

      </section>

      <section style={{ padding: '0 24px 32px' }}>
        <div className="pricing-tier-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, maxWidth: 1200, margin: '0 auto' }}>
          {PLANS.map(plan => {
            const price = isAnnual ? plan.annual : plan.monthly
            return (
              <div key={plan.tier} id={`plan-${plan.tier}`} style={{
                background: plan.popular ? 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)' : '#fff',
                borderRadius: 20,
                padding: '36px 28px',
                border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.18)',
                boxShadow: plan.popular ? '0 24px 60px rgba(11,31,58,0.26)' : '0 2px 16px rgba(7,27,58,0.06)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                scrollMarginTop: 100,
              }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#22C55E', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Most Popular
                  </div>
                )}
                {plan.tier === 'concierge' && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(232,116,43,0.32)' }}>
                    Coming Soon
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#7AAAB2', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, marginBottom: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#4A7A80', marginTop: 12 }}>$</span>
                  <span style={{ fontSize: 60, fontWeight: 900, color: plan.popular ? '#fff' : '#0B1F3A', lineHeight: 1, letterSpacing: '-2px' }}>{price.toLocaleString()}</span>
                  <span style={{ fontSize: 14, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#7AAAB2', fontWeight: 600, alignSelf: 'flex-end', marginBottom: 12, marginLeft: 4 }}>/mo</span>
                </div>
                <div style={{ fontSize: 12, color: plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2', marginBottom: 14, fontWeight: 600 }}>
                  {isAnnual
                    ? `Billed once a year as $${(plan.annual * 12).toLocaleString()} · saves $${((plan.monthly - plan.annual) * 12).toLocaleString()}/yr`
                    : 'Billed monthly · No contract'}
                </div>
                <div style={{ fontSize: 14, color: plan.popular ? 'rgba(255,255,255,0.78)' : '#4A7A80', marginBottom: 22, lineHeight: 1.5, fontStyle: 'italic' }}>
                  {plan.tagline}
                </div>
                <div style={{ flex: 1, marginBottom: 24 }}>
                  {plan.features.map((f, idx) => {
                    const isHeader = f.label.endsWith(':') || f.label.endsWith('plus:')
                    return (
                      <div key={f.label + idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                        {!isHeader && (
                          <div style={{ width: 18, height: 18, background: plan.popular ? '#18AFA8' : '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M3 8.5l3.5 3.5 6.5-7" />
                            </svg>
                          </div>
                        )}
                        <span style={{ fontSize: 13, color: isHeader ? (plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2') : (plan.popular ? 'rgba(255,255,255,0.86)' : '#0B1F3A'), fontWeight: isHeader ? 700 : 500, fontStyle: isHeader ? 'italic' : 'normal', lineHeight: 1.45 }}>{f.label}</span>
                      </div>
                    )
                  })}
                </div>
                {plan.tier === 'concierge' ? (
                  <Link
                    href="/waitlist?tier=concierge"
                    style={{
                      padding: '14px',
                      background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                      borderRadius: 10, border: 'none',
                      color: '#0B1F3A',
                      fontWeight: 900, fontSize: 14,
                      cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'center', display: 'block', width: '100%',
                      transition: 'all 0.18s ease',
                      boxShadow: '0 8px 24px rgba(232,116,43,0.42)',
                      textDecoration: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    Join Email Waitlist →
                  </Link>
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.tier, interval)}
                    disabled={loading === plan.tier}
                    style={{
                      padding: '14px',
                      background: plan.popular ? '#22C55E' : 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
                      borderRadius: 10,
                      border: 'none',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: loading === plan.tier ? 'wait' : 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'center',
                      display: 'block',
                      width: '100%',
                      opacity: loading === plan.tier ? 0.7 : 1,
                      transition: 'all 0.18s ease',
                      boxShadow: plan.popular ? '0 8px 24px rgba(34,197,94,0.32)' : '0 4px 14px rgba(10,168,159,0.24)',
                    }}
                  >
                    {loading === plan.tier ? 'Loading…' : isSignedIn ? `Start with ${plan.name} →` : 'Get Started →'}
                  </button>
                )}
                <p style={{ fontSize: 11, color: plan.popular ? 'rgba(255,255,255,0.45)' : '#7AAAB2', textAlign: 'center', marginTop: 10, marginBottom: 0, fontWeight: 500 }}>
                  {plan.tier === 'concierge'
                    ? 'Launches Q3 2026 · Early-access pricing for waitlist'
                    : '30-day full refund · Cancel anytime'}
                </p>
              </div>
            )
          })}
        </div>

        {/* Availability disclaimer right under the tier cards */}
        <div style={{ maxWidth: 1080, margin: '24px auto 0', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', fontSize: 12.5, color: '#4A7A80', lineHeight: 1.6, padding: '14px 18px', background: 'rgba(255,251,235,0.6)', border: '1px solid rgba(232,116,43,0.18)', borderRadius: 12 }}>
            <strong style={{ color: '#0B1F3A' }}>Starter + Pro available now.</strong>{' '}
            Elite and Multi-Location launch <strong>Q3 2026</strong>. <Link href="/waitlist?tier=concierge" style={{ color: '#C84B26', fontWeight: 700, textDecoration: 'underline' }}>Join the waitlist for early-access pricing →</Link>
          </div>
        </div>
      </section>

      {/* Multi-Location enterprise card */}
      <section style={{ padding: '0 24px 80px' }}>
        <div className="pricing-multiloc" style={{
          maxWidth: 1200,
          margin: '0 auto',
          background: 'linear-gradient(135deg, #0B1F3A 0%, #1E3A5F 100%)',
          borderRadius: 24,
          padding: '48px 56px',
          color: '#fff',
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 48,
          alignItems: 'center',
          border: '2px solid rgba(94, 234, 212, 0.3)',
        }}>
          <div>
            <div style={{ display: 'inline-block', background: 'rgba(94, 234, 212, 0.16)', color: '#5EEAD4', fontSize: 11, fontWeight: 800, padding: '4px 14px', borderRadius: 999, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              Multi-Location · Enterprise
            </div>
            <h2 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 14 }}>
              For franchises, chains, &amp; roll-ups
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, marginBottom: 24 }}>
              5+ locations? Every shop gets its own AI receptionist, its own number, its own custom prompt — under one HQ dashboard. Built for Apex, Authority Brands, Neighborly partners, and PE-backed service companies.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
              {[
                'Per-location AI prompts (one shop ≠ another)',
                'Local area-code number per location',
                'HQ roll-up dashboard (calls/jobs/revenue/location)',
                'Native CRM integrations: ServiceTitan, HCP, Jobber',
                'Dedicated CSM — direct line to the BellAveGo team for first 5 partner logos',
                'White-glove onboarding for every location',
                'Quarterly QBR with the BellAveGo team + your COO/CFO',
                'Volume pricing at 25+ locations',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.45 }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#5EEAD4" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
                    <path d="M3 8.5l3.5 3.5 6.5-7" />
                  </svg>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <a
              href="mailto:peter@bellavego.com?subject=Multi-Location%20BellAveGo&body=Hi%20Peter%2C%0A%0AI%27m%20looking%20at%20Multi-Location%20BellAveGo%20for%3A%0A%0ACompany%3A%20%0ANumber%20of%20locations%3A%20%0AIndustry%2Fbrand%3A%20%0ABest%20time%20to%20talk%3A%20%0A%0AThanks."
              style={{ display: 'inline-block', padding: '14px 28px', background: '#5EEAD4', color: '#0B1F3A', fontWeight: 900, fontSize: 14, borderRadius: 10, textDecoration: 'none' }}
            >
              Book a 20-min intro call →
            </a>
            <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 10, fontWeight: 500 }}>
              Founder-led. Direct line: <a href="mailto:peter@bellavego.com" style={{ color: '#5EEAD4', textDecoration: 'none', fontWeight: 700 }}>peter@bellavego.com</a>
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(94, 234, 212, 0.2)', borderRadius: 16, padding: '32px 28px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'rgba(94, 234, 212, 0.85)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>Starts at</p>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: 'rgba(255,255,255,0.6)', verticalAlign: 'top' }}>$</span>
              <span style={{ fontSize: 64, fontWeight: 900, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>2,497</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 24px' }}>per location / month</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, marginBottom: 0 }}>
              + <strong style={{ color: '#fff' }}>$25K</strong> one-time platform setup<br/>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Volume discounts at 25+ locations</span>
            </p>
          </div>
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#F2F9F5', borderTop: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.8px', marginBottom: 24, textAlign: 'center' }}>How hands-off is BellAveGo really?</h2>
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: '28px 32px' }}>
            <p style={{ fontSize: 12, fontWeight: 900, color: '#16A34A', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 14 }}>⚡ Every feature in every tier — fully automated</p>
            <p style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.65, marginBottom: 12 }}>
              No "Slack with the founder" tax. No "monthly call with the founder" charade. From the moment your card hits Stripe, every part of BellAveGo runs itself — call answering, bookings, follow-ups, collections, reviews, ads, lead-gen. The AI does the work. You do the close.
            </p>
            <p style={{ fontSize: 13, color: '#4A7A80', fontStyle: 'italic', margin: 0 }}>
              The only time a human at BellAveGo touches your account is if you email support — answered in &lt;24 hrs (Pro) or &lt;4 hrs (Elite).
            </p>
          </div>
        </div>
      </section>

      {/* Common questions — single concise block, no accordion. Five
          load-bearing answers contractors ask before signing up. */}
      <section style={{ padding: '60px 24px', background: '#F2F9F5', borderTop: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.8px', marginBottom: 24, textAlign: 'center' }}>Common questions</h2>
          <div className="pricing-faq" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              {
                q: 'Can I keep my current business number?',
                a: 'Yes. You forward your existing line to the BellAveGo number we auto-provision at signup. Customers still call your old number — BellAveGo answers anything you can\'t pick up. Two-minute setup, walked-through on screen.',
              },
              {
                q: 'What if the AI says something wrong?',
                a: 'Every call is recorded + transcribed in your dashboard. You can customize Emma\'s instructions (services, hours, tone) at any time. 30-day full-refund guarantee if she\'s not pulling her weight — no questions asked.',
              },
              {
                q: 'Do I have to sign a contract?',
                a: 'No. Month-to-month, cancel anytime from your Stripe billing portal. Annual plans save 17% but are not required.',
              },
              {
                q: 'How fast is setup?',
                a: 'About 5 minutes. Sign up → pay → we auto-buy your local number → you forward your existing line → AI is live answering calls in your business name. We walk you through each step.',
              },
              {
                q: 'Will it auto-book appointments without my approval?',
                a: 'Only if you turn auto-booking ON. Default is OFF — Emma takes a message and texts/emails it to you. When you opt in, you can also restrict the AI to only book inside a time window (e.g. "only after 5pm").',
              },
              {
                q: 'Who owns my data?',
                a: 'You do. We never sell, share, or use your call data to train third-party AI models. Full details in our privacy policy.',
              },
            ].map(({ q, a }) => (
              <div key={q} style={{ background: '#fff', border: '1px solid #DCE9E2', borderRadius: 14, padding: '20px 22px' }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.2px', margin: '0 0 8px' }}>{q}</h3>
                <p style={{ fontSize: 13.5, color: '#4A6670', lineHeight: 1.6, margin: 0 }}>{a}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, color: '#7AAAB2', textAlign: 'center', marginTop: 22 }}>
            Other questions? Email <a href="mailto:peter@bellavego.com" style={{ color: '#C84B26', fontWeight: 700, textDecoration: 'none' }}>peter@bellavego.com</a> or call the demo line at <a href="tel:+16514677829" style={{ color: '#C84B26', fontWeight: 700, textDecoration: 'none' }}>(651) 467-7829</a>.
          </p>
        </div>
      </section>

      {/* Elite waitlist — transparency about what's available now */}
      <section style={{ padding: '60px 24px', background: '#F2F9F5', borderTop: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', marginBottom: 8, textAlign: 'center' }}>What's live today</h2>
          <p style={{ fontSize: 14, color: '#4A6670', textAlign: 'center', marginBottom: 24, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            Radical transparency. Every Starter and Pro feature listed above is shipping today — sign up and you'll be live in 5 minutes.
          </p>
          <div style={{ background: '#fff', border: '1px solid #DCE9E2', borderRadius: 14, padding: '24px 28px' }}>
            <p style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.75, margin: 0 }}>
              <strong>Elite is on the waitlist</strong> until we've validated Pro with 3 paying customers. When it opens: custom integrations into Jobber, Housecall Pro, and ServiceTitan; bi-weekly AI consulting reports; 4-hour priority SLA; and direct founder text/call access for your first 90 days. <Link href="/waitlist?tier=concierge" style={{ color: '#C84B26', fontWeight: 700, textDecoration: 'underline' }}>Join the Elite waitlist →</Link>
            </p>
          </div>
        </div>
      </section>

      <footer style={{ padding: '36px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>BellAveGo · AI Receptionist + AI Marketing for home services pros · 30-day money-back · Cancel anytime</p>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#3D5A62' }}>
          <Link href="/privacy" style={{ color: '#7AAAB2', textDecoration: 'none' }}>Privacy</Link>
          {' · '}
          <Link href="/terms" style={{ color: '#7AAAB2', textDecoration: 'none' }}>Terms</Link>
          {' · '}
          © 2026 BellAveGo LLC
        </p>
      </footer>
    </main>
  )
}
