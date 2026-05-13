'use client'

/**
 * Live pricing page — v7 ($397 / $797 / $1,997 / $2,497-per-location).
 *
 * SMB tier CTAs invoke /api/stripe/checkout against the v7 price IDs in
 * src/lib/pricing.ts. Multi-Location remains mailto (enterprise sale, founder-led).
 *
 * Old $179/$497/$997 page preserved at /pricing-legacy for rollback or reference.
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
    name: 'Receptionist',
    monthly: 397,
    annual: 330,
    setup: 250,
    tagline: 'AI answers every call. You close it in one tap.',
    popular: false,
    features: [
      { label: '6 AI Consulting Reports / year (bi-monthly) — revenue, calls, missed jobs, what to fix', auto: true },
      { label: '24/7 AI call answering — never miss a call again', auto: true },
      { label: 'Up to 250 inbound calls / month', auto: true },
      { label: 'AI captures name, phone, service, address, preferred time', auto: true },
      { label: 'Instant text summary + YES/NO booking approval to your phone', auto: true },
      { label: 'One-tap: confirm · send payment link · call back · decline', auto: true },
      { label: 'Auto-provisioned local number in your area code', auto: true },
      { label: 'Customer + jobs dashboard with full call transcripts', auto: true },
      { label: 'Spanish-language receptionist mode included', auto: true },
      { label: 'Welcome AI business diagnostic at activation', auto: true },
      { label: 'Self-serve Stripe billing portal · 30-day money-back', auto: true },
    ],
  },
  {
    tier: 'officemgr',
    name: 'Office Manager',
    monthly: 797,
    annual: 662,
    setup: 500,
    tagline: 'Five AIs running your back office while you turn wrenches.',
    popular: true,
    features: [
      { label: 'Everything in Receptionist, plus:', auto: false },
      { label: '12 AI Consulting Reports / year (monthly) — conversion, recovery, sales coaching', auto: true },
      { label: 'Unlimited inbound calls', auto: true },
      { label: 'AI Quote Hunter — auto follow-up SMS day 2 / 7 / 14 on open quotes', auto: true },
      { label: 'AI Collections — auto-chase past-due invoices with Stripe pay-by-text', auto: true },
      { label: 'AI Review Manager — Google reviews polled daily, replies drafted for one-tap approval', auto: true },
      { label: 'AI Reputation — auto-SMS past customers asking for Google reviews', auto: true },
      { label: 'Smart Call Summary Insights — sales tip with every booking', auto: true },
      { label: 'Priority email support — 24-hr SLA', auto: true },
    ],
  },
  {
    tier: 'concierge',
    name: 'Concierge',
    monthly: 1997,
    annual: 1660,
    setup: 1000,
    tagline: 'AI runs your back office AND your marketing. You just close the work.',
    popular: false,
    features: [
      { label: 'Everything in Office Manager, plus:', auto: false },
      { label: '52 AI Consulting Reports / year (weekly) + quarterly McKinsey-style deep-dive', auto: true },
      { label: 'AI Marketing Operations — the full growth stack:', auto: false },
      { label: 'AI Ad Creative Generator — Google + Meta ad copy weekly from your own call transcripts', auto: true },
      { label: 'AI Lead Sourcing — permits + severe-weather alerts → outbound SMS', auto: true },
      { label: 'AI Past-Customer Reactivation — drip campaigns to dormant customers', auto: true },
      { label: 'AI Google Business Profile Watcher — reviews, rating drift, local-pack tracking', auto: true },
      { label: 'AI Competitor Watcher — daily intel on 5 competitors in your service area', auto: true },
      { label: 'AI Local SEO — weekly blog posts auto-published to your WordPress site', auto: true },
      { label: 'Custom AI prompt tuning — your shop’s voice, service catalog, pricing rules', auto: true },
      { label: 'AI Account Manager — proactive briefings, issue flagging, 4-hour priority SLA', auto: true },
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
      if (data.url) {
        window.location.href = data.url
      } else {
        setLoading(null)
        alert(`Checkout failed: ${data?.error ?? 'Unknown error'}\n\nText Peter at 773-710-9565.`)
      }
    } catch {
      setLoading(null)
      alert('Network error. Please try again.')
    }
  }

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh' }}>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={220} height={70} style={{ objectFit: 'contain', marginTop: 8 }} />
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn && (
            <Link href="/dashboard" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>Dashboard</Link>
          )}
          <Link href="/founder" style={{ padding: '10px 16px', textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 600 }}>Why BellAveGo?</Link>
          <Link href="/pricing" style={{ padding: '10px 16px', textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 600 }}>Pricing</Link>
          {!isSignedIn && (
            <Link href="/sign-up" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>Sign in / Create Account</Link>
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

        {/* Plan picker — kills the "which one for me?" decision friction */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          marginTop: 28, padding: '10px 18px',
          background: '#fff', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 14,
          boxShadow: '0 4px 20px rgba(7,27,58,0.05)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#0B1F3A', letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 4 }}>
            Not sure which?
          </span>
          {[
            { label: 'Solo', tier: 'receptionist' as Tier },
            { label: '2–10 people', tier: 'officemgr' as Tier },
            { label: '10+ or want marketing', tier: 'concierge' as Tier },
          ].map((x, i) => (
            <span key={x.tier} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: '#DCE9E2', fontSize: 12 }}>·</span>}
              <button
                onClick={() => {
                  document.getElementById(`plan-${x.tier}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }}
                style={{
                  padding: '5px 12px', borderRadius: 8, border: 'none',
                  background: 'rgba(10,168,159,0.08)', color: '#0AA89F',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {x.label} →
              </button>
            </span>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 24px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, maxWidth: 1200, margin: '0 auto' }}>
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
                <p style={{ fontSize: 11, color: plan.popular ? 'rgba(255,255,255,0.45)' : '#7AAAB2', textAlign: 'center', marginTop: 10, marginBottom: 0, fontWeight: 500 }}>
                  + ${plan.setup} onboarding · 30-day money-back · Cancel anytime
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Multi-Location enterprise card */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{
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
                'Dedicated CSM — Peter direct for first 5 partner logos',
                'White-glove onboarding for every location',
                'Quarterly QBR with Peter + your COO/CFO',
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
              href="mailto:peter@bellavego.com?subject=Multi-Location%20-%20BellAveGo%20Enterprise"
              style={{ display: 'inline-block', padding: '14px 28px', background: '#5EEAD4', color: '#0B1F3A', fontWeight: 900, fontSize: 14, borderRadius: 10, textDecoration: 'none' }}
            >
              Talk to Peter →
            </a>
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
              No "Slack with the founder" tax. No "monthly call with Peter" charade. From the moment your card hits Stripe, every part of BellAveGo runs itself — call answering, bookings, follow-ups, collections, reviews, ads, lead-gen. The AI does the work. You do the close.
            </p>
            <p style={{ fontSize: 13, color: '#4A7A80', fontStyle: 'italic', margin: 0 }}>
              The only time a human at BellAveGo touches your account is if you email support — answered in &lt;24 hrs (Office Manager) or &lt;4 hrs (Concierge).
            </p>
          </div>
        </div>
      </section>

      {/* What's live today vs roadmap — transparency footer */}
      <section style={{ padding: '60px 24px', background: '#F2F9F5', borderTop: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', marginBottom: 8, textAlign: 'center' }}>Built today vs. on the roadmap</h2>
          <p style={{ fontSize: 14, color: '#4A6670', textAlign: 'center', marginBottom: 24, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            Radical transparency. Every Concierge feature above is live as of today, with these scoped exceptions launching this summer:
          </p>
          <div style={{ background: '#fff', border: '1px solid #DCE9E2', borderRadius: 14, padding: '24px 28px' }}>
            <ul style={{ margin: 0, paddingLeft: 22, color: '#0B1F3A', fontSize: 14, lineHeight: 1.75 }}>
              <li><strong>Live Google + Meta ad activation</strong> — creatives generate today, sit in your approval queue. Live spend activates the day Google Ads MCC + Meta Business Manager approvals land (we're already in the queue).</li>
              <li><strong>New-homeowner database</strong> — lead sourcing covers permits + severe-weather alerts today. PropStream homeowner data layer adds Q3 2026.</li>
              <li><strong>Auto-reply on Google Business Profile reviews</strong> — we read + track today. Posting and auto-replies require Google Business Profile API OAuth (Q3 2026).</li>
              <li><strong>Webflow SEO publishing</strong> — WordPress sites publish today. Webflow auto-publish Q3 2026 (manual copy/paste workflow until then).</li>
            </ul>
          </div>
        </div>
      </section>

      <footer style={{ padding: '36px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>BellAveGo · AI Receptionist + AI Marketing for home services pros · 30-day money-back · Cancel anytime</p>
      </footer>
    </main>
  )
}
