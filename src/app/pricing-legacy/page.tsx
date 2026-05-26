'use client'

import { useEffect, useState } from 'react'
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
  features: string[]
  reportCadence: string
  comingSoon?: boolean        // when true, disables checkout + shows "Join waitlist"
  comingSoonLabel?: string    // e.g., "Coming September 2026"
}

const PLANS: Plan[] = [
  {
    tier: 'receptionist',
    name: 'Front Desk',
    monthly: 179,
    annual: 149,
    setup: 50,
    tagline: 'AI answers every call + your welcome consulting report.',
    popular: false,
    features: [
      '24/7 AI call answering',
      'AI captures caller name, phone, service, address, preferred time',
      'Instant text summary to your phone after every call',
      'One-tap: confirm appointment · send invoice · call back · acknowledge',
      'Emergency routing to your cell',
      'Up to 50 AI-booked appointments / month',
      'Live dashboard with call log + full transcripts',
      'Welcome AI consulting report at activation',
    ],
    reportCadence: 'Welcome report · 1/year',
  },
  {
    tier: 'officemgr',
    name: 'AI Office Manager',
    monthly: 497,
    annual: 414,
    setup: 247,
    tagline: 'Four AIs running your back office on autopilot.',
    popular: true,
    features: [
      'Everything in Front Desk, plus:',
      'Unlimited AI-booked appointments',
      'AI Quote Hunter — auto follow-ups day 2 / 7 / 14',
      'AI Collections — past-due invoice chase via SMS + Stripe pay-by-text',
      'AI Reviews — daily drafts reply to every Google review for one-tap approval',
      'Smart call-summary insights (sales tips per booking)',
      'Spanish-language receptionist mode',
      'Google Reviews automation post-job',
      '6 bi-monthly AI consulting reports/year',
    ],
    reportCadence: 'Bi-monthly · 6/year',
  },
  {
    tier: 'concierge',
    name: 'Concierge',
    monthly: 997,
    annual: 831,
    setup: 497,
    tagline: 'White-glove. Multi-location ready. Founder direct.',
    popular: false,
    comingSoon: true,
    comingSoonLabel: 'Coming September 2026',
    features: [
      'Everything in AI Office Manager, plus:',
      'Auto-confirm mode — AI books without your approval after trust period',
      'Multi-location support (up to 5 locations, separate phone numbers each)',
      'Custom AI prompt tuning to your shop’s exact voice',
      'AI Photo Estimator — customer texts a photo, AI quotes',
      'AI Financing Closer — Wisetack / GreenSky integration',
      'AI Recruiter — post jobs + screen technicians automatically',
      'Jobber / HousecallPro / ServiceTitan native integration',
      'White-glove onboarding (Peter wires up your CRM live on call)',
      'Priority support — 24h SLA, dedicated Slack',
      'API access for custom integrations',
      '12 monthly AI consulting reports/year',
    ],
    reportCadence: 'Monthly · 12/year',
  },
]

export default function PricingPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const router = useRouter()
  const [interval, setInterval] = useState<Interval>('monthly')
  const [loading, setLoading] = useState<Tier | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    const params = new URLSearchParams(window.location.search)
    const autoTier = params.get('tier') as Tier | null
    const autoInterval = params.get('interval') as Interval | null
    const autoCheckout = params.get('autocheckout') === '1'
    if (autoCheckout && autoTier && isSignedIn) {
      handleCheckout(autoTier, autoInterval ?? 'monthly')
    }
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
        console.error('checkout error', data)
        setLoading(null)
        const reason = data?.error || 'Unknown error'
        alert(`Checkout failed: ${reason}\n\nText Peter at 773-710-9565 with this message.`)
      }
    } catch (err) {
      console.error(err)
      setLoading(null)
      alert('Network error. Please try again.')
    }
  }

  const isAnnual = interval === 'annual'

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh' }}>

      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'sticky', top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={220} height={70} style={{ objectFit: 'contain', marginTop: 8 }} />
        </Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn ? (
            <Link href="/dashboard" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/sign-in" style={{ padding: '10px 22px', border: '1.5px solid #DCE9E2', borderRadius: 8, textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 500 }}>Sign in</Link>
              <Link href="/sign-up" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>Get started</Link>
            </>
          )}
        </div>
      </nav>

      <section style={{ padding: '72px 24px 48px', textAlign: 'center', maxWidth: 1100, margin: '0 auto' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Pricing</p>
        <h1 style={{ fontSize: 'clamp(34px, 4.4vw, 56px)', fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 16 }}>
          AI answers every call.<br/>
          <span style={{ background: 'linear-gradient(135deg, #5EEAD4 0%, #2DD4BF 50%, #0AA89F 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>You close it in one tap.</span>
        </h1>
        <p style={{ fontSize: 17, color: '#4A6670', maxWidth: 640, margin: '0 auto 28px', lineHeight: 1.6 }}>
          One subscription replaces voicemail, your office manager, your collections agent, and your reputation manager. Pick a tier. 7-day free trial, cancel anytime.
        </p>

        {/* Toggle */}
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

      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 1100, margin: '0 auto' }}>
          {PLANS.map(plan => {
            const price = isAnnual ? plan.annual : plan.monthly
            const isLoading = loading === plan.tier
            return (
              <div key={plan.tier} style={{
                background: plan.popular ? 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)' : '#fff',
                borderRadius: 20,
                padding: '36px 28px',
                border: plan.popular ? 'none' : '1px solid rgba(10,168,159,0.18)',
                boxShadow: plan.popular ? '0 24px 60px rgba(11,31,58,0.26)' : '0 2px 16px rgba(7,27,58,0.06)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#22C55E', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 700, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#7AAAB2', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2, marginBottom: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#4A7A80', marginTop: 12 }}>$</span>
                  <span style={{ fontSize: 60, fontWeight: 900, color: plan.popular ? '#fff' : '#0B1F3A', lineHeight: 1, letterSpacing: '-2px' }}>{price}</span>
                  <span style={{ fontSize: 14, color: plan.popular ? 'rgba(255,255,255,0.5)' : '#7AAAB2', fontWeight: 600, alignSelf: 'flex-end', marginBottom: 12, marginLeft: 4 }}>/mo</span>
                </div>
                <div style={{ fontSize: 12, color: plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2', marginBottom: 14, fontWeight: 600 }}>
                  {isAnnual ? `Billed annually · $${(plan.annual * 12).toLocaleString()}/yr` : 'Billed monthly · No contract'}
                </div>
                <div style={{ fontSize: 14, color: plan.popular ? 'rgba(255,255,255,0.78)' : '#4A7A80', marginBottom: 22, lineHeight: 1.5, fontStyle: 'italic' }}>
                  {plan.tagline}
                </div>
                <div style={{ flex: 1, marginBottom: 24 }}>
                  {plan.features.map((f, idx) => {
                    const isHeader = f.endsWith(':') || f.endsWith('plus:')
                    return (
                      <div key={f + idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0' }}>
                        {!isHeader && (
                          <div style={{ width: 16, height: 16, background: plan.popular ? '#18AFA8' : '#22C55E', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 3 }}>
                            <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>{f.includes('Q3 2026') ? '·' : '✓'}</span>
                          </div>
                        )}
                        <span style={{ fontSize: 13, color: isHeader ? (plan.popular ? 'rgba(255,255,255,0.55)' : '#7AAAB2') : (plan.popular ? 'rgba(255,255,255,0.86)' : '#0B1F3A'), fontWeight: isHeader ? 700 : 500, fontStyle: isHeader ? 'italic' : 'normal', lineHeight: 1.45, opacity: f.includes('Q3 2026') ? 0.7 : 1 }}>{f}</span>
                      </div>
                    )
                  })}
                </div>
                {plan.comingSoon ? (
                  <>
                    <a
                      href="mailto:peter@bellavego.com?subject=Concierge%20waitlist%20-%20BellAveGo"
                      style={{
                        padding: '14px',
                        background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)',
                        borderRadius: 10,
                        border: 'none',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 14,
                        textDecoration: 'none',
                        textAlign: 'center',
                        display: 'block',
                        boxShadow: '0 4px 14px rgba(11,31,58,0.32)',
                      }}
                    >
                      Join waitlist →
                    </a>
                    <p style={{ fontSize: 11, color: plan.popular ? 'rgba(255,255,255,0.45)' : '#7AAAB2', textAlign: 'center', marginTop: 10, marginBottom: 0, fontWeight: 600 }}>
                      {plan.comingSoonLabel} · We&apos;ll email when it&apos;s live
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleCheckout(plan.tier, interval)}
                      disabled={isLoading}
                      style={{
                        padding: '14px',
                        background: plan.popular ? '#22C55E' : 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
                        borderRadius: 10,
                        border: 'none',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: isLoading ? 'wait' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.18s ease',
                        opacity: isLoading ? 0.7 : 1,
                        boxShadow: plan.popular ? '0 8px 24px rgba(34,197,94,0.32)' : '0 4px 14px rgba(10,168,159,0.24)',
                      }}
                    >
                      {isLoading ? 'Loading…' : isSignedIn ? "Let's get started →" : 'Get Started →'}
                    </button>
                    <p style={{ fontSize: 11, color: plan.popular ? 'rgba(255,255,255,0.45)' : '#7AAAB2', textAlign: 'center', marginTop: 10, marginBottom: 0, fontWeight: 500 }}>
                      7-day free trial · Cancel anytime
                    </p>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#fff', borderTop: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.8px', marginBottom: 16 }}>The math, in plain English.</h2>
          <p style={{ fontSize: 16, color: '#4A6670', lineHeight: 1.7, marginBottom: 24 }}>
            A $1M HVAC shop missing 40 calls/month at $385 avg job and 55% book rate is leaving <strong style={{ color: '#0B1F3A' }}>$8,470/month</strong> on the floor. Add unfollowed quotes (~$4,800/mo) and stale AR (~$3,000/mo) and you’re past <strong style={{ color: '#0B1F3A' }}>$16,000/month in lost revenue</strong>.
          </p>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#0AA89F' }}>
            BellAveGo Office Manager: $497/mo. Idiot index in your favor: <span style={{ fontSize: 22 }}>32x.</span>
          </p>
          <p style={{ fontSize: 13, color: '#7AAAB2', marginTop: 16 }}>
            7-day free trial up front — try the full product before any charge fires. <a href="tel:+17737109565" style={{ color: '#0AA89F', textDecoration: 'none', fontWeight: 700 }}>Text our team directly: 773-710-9565</a>
          </p>
        </div>
      </section>

      <section style={{ padding: '60px 24px', background: '#F2F9F5', borderTop: '1px solid #DCE9E2' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h3 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', marginBottom: 28, textAlign: 'center' }}>Common questions</h3>
          {[
            { q: 'How does the 7-day free trial work?', a: 'When you check out we save a payment method but do not charge it for 7 days. We provision your AI receptionist, dedicated number, A2P SMS registration, prompt tuning, and integration setup during the trial. On day 8 the first month bills automatically. Cancel anytime before day 8 from the dashboard — no charge fires, no money owed.' },
            { q: 'Do I have to sign a contract?', a: 'No. All plans are month-to-month. Cancel anytime, your data stays yours.' },
            { q: 'Are there refunds after the trial?', a: 'No. After the first charge fires on day 8, the current cycle is non-refundable. Cancel anytime to stop the next renewal — service continues through the end of the cycle you paid for.' },
            { q: 'What if I want to switch tiers later?', a: 'Upgrade or downgrade anytime in your dashboard. Pro-rated automatically. Annual prepay can be converted to credit if you upgrade.' },
            { q: 'Will the AI sound like a robot?', a: 'Call (651) 467-7829 right now and find out. It’s the live AI — talk to it like you’re a customer with a broken AC. Most people can’t tell.' },
            { q: 'Can I keep my existing business number?', a: 'Yes. We forward your existing number to your dedicated AI number, so customers keep dialing the same number they always have. Or we can port it fully — ask in onboarding.' },
          ].map(({ q, a }) => (
            <div key={q} style={{ background: '#fff', border: '1px solid #DCE9E2', borderRadius: 12, padding: '18px 22px', marginBottom: 12 }}>
              <p style={{ fontWeight: 800, color: '#0B1F3A', marginBottom: 6, fontSize: 14 }}>{q}</p>
              <p style={{ color: '#4A6670', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ padding: '36px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#7AAAB2' }}>AI Office Manager for home service pros · From $179/mo · 7-day free trial · Cancel anytime</p>
      </footer>
    </main>
  )
}
