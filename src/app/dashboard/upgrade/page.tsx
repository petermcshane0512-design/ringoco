'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TIER_METADATA, type Tier } from '@/lib/pricing'

/**
 * Logged-in upgrade flow.
 *
 * Lives at /dashboard/upgrade (NOT /pricing — that's the public marketing
 * page for prospects). Shows current tier badge, the upgrade options that
 * are actually higher than what they have today, what each tier unlocks
 * in plain terms, and the ROI math.
 *
 * Clicking an upgrade button hits /api/stripe/checkout which returns the
 * Stripe-hosted checkout URL; we redirect. On success Stripe webhook flips
 * profile.plan_tier + sends them back here.
 */

const TIER_FEATURES: Record<Tier, {
  tagline: string
  highlights: string[]
  callCap: string
  reports: string
  vibe: 'starter' | 'pro' | 'elite'
}> = {
  receptionist: {
    tagline: 'Never miss a call. Capture every lead.',
    callCap: '60 calls/mo',
    reports: '6 AI consulting reports/yr',
    highlights: [
      '24/7 AI receptionist in your business name',
      'Lead alerts via email + push within 20 sec',
      'Tap-to-call back from your phone',
      'Emergency outbound voice call to your cell',
      'Full call transcripts + recordings',
    ],
    vibe: 'starter',
  },
  officemgr: {
    tagline: 'Receptionist + the full back office, on autopilot.',
    callCap: '300 calls/mo',
    reports: '12 AI consulting reports/yr (monthly)',
    highlights: [
      'Everything in Starter, plus:',
      '🎯 AI Quote Hunter — auto-follow-up SMS on day 2, 7, 14',
      '💰 AI Collections — chases past-due invoices with pay-by-text',
      '⭐ AI Reputation — auto-asks happy customers for Google reviews',
      '💡 Smart Call-Summary Insights — sales tips with every alert',
      'Priority email support — 24-hour SLA',
    ],
    vibe: 'pro',
  },
  concierge: {
    tagline: 'AI runs your back office AND your marketing.',
    callCap: 'UNLIMITED calls',
    reports: '24 bi-weekly reports + 4 quarterly McKinsey-style deep dives',
    highlights: [
      'Everything in Pro, plus:',
      '🎨 AI Ad Creative Generator — Google + Meta copy weekly',
      '📡 AI Lead Sourcing — permits + storm alerts → outbound SMS',
      '🔄 AI Past-Customer Reactivation — drip campaigns to dormant customers',
      '🕵️ AI Competitor Watcher — weekly intel on 5 local competitors',
      '🌐 AI Local SEO — weekly blog posts auto-published',
      '📸 AI Job-Site Photo Studio — text a photo, get social posts',
      '4-hour priority SLA + direct founder access',
    ],
    vibe: 'elite',
  },
}

const TIER_ORDER: Tier[] = ['receptionist', 'officemgr', 'concierge']

export default function UpgradePage() {
  const router = useRouter()
  const [currentTier, setCurrentTier] = useState<Tier | null>(null)
  const [interval, setInterval] = useState<'monthly' | 'annual'>('annual')
  const [checkoutLoading, setCheckoutLoading] = useState<Tier | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((p) => {
        if (p && !p.error) {
          setCurrentTier((p.plan_tier as Tier) || null)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const currentIdx = currentTier ? TIER_ORDER.indexOf(currentTier) : -1
  const upgradeOptions = TIER_ORDER.slice(Math.max(0, currentIdx + 1))

  async function handleUpgrade(targetTier: Tier) {
    if (targetTier === 'concierge') {
      // Elite is waitlist-only per CLAUDE.md
      window.location.href = '/waitlist?tier=concierge&from=dashboard-upgrade'
      return
    }
    setCheckoutLoading(targetTier)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: targetTier, interval }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(`Checkout failed: ${data.error || 'unknown error'}`)
        setCheckoutLoading(null)
      }
    } catch (e) {
      alert(`Checkout failed: ${(e as Error).message}`)
      setCheckoutLoading(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#4A6670', fontFamily: 'system-ui, sans-serif' }}>
        Loading your plan…
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ marginBottom: 28 }}>
        <Link
          href="/dashboard"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4A6670', textDecoration: 'none', marginBottom: 16 }}
        >
          ← Back to dashboard
        </Link>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.04em' }}>
          Upgrade your{' '}
          <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            plan
          </span>
        </h1>
        {currentTier && TIER_METADATA[currentTier] && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px',
              background: '#FFF7EE', borderRadius: 99,
              border: '1px solid rgba(232,116,43,0.22)',
            }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                You're on
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0B1F3A' }}>
                {TIER_METADATA[currentTier].name}
              </span>
              <span style={{ fontSize: 12, color: '#7AAAB2' }}>
                · ${TIER_METADATA[currentTier].monthly}/mo
              </span>
            </div>
            {upgradeOptions.length === 0 && (
              <span style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>
                ✅ You're on our top tier — nothing to upgrade.
              </span>
            )}
          </div>
        )}
      </div>

      {upgradeOptions.length === 0 ? (
        <div style={{
          background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 14,
          padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#065F46', marginBottom: 6 }}>
            You're on the top tier.
          </div>
          <div style={{ fontSize: 14, color: '#0B1F3A' }}>
            Need something custom? Email <a href="mailto:peter@bellavego.com" style={{ color: '#0AA89F', fontWeight: 700 }}>peter@bellavego.com</a> — we&apos;ll build it.
          </div>
        </div>
      ) : (
        <>
          {/* ── BILLING CYCLE TOGGLE ── */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <div style={{
              display: 'inline-flex',
              background: '#fff',
              border: '1.5px solid #E8DFCF',
              borderRadius: 12,
              padding: 4,
              fontSize: 13, fontWeight: 700,
            }}>
              {(['annual', 'monthly'] as const).map((cycle) => {
                const isActive = interval === cycle
                return (
                  <button
                    key={cycle}
                    onClick={() => setInterval(cycle)}
                    style={{
                      padding: '8px 18px', borderRadius: 8, border: 'none',
                      cursor: 'pointer',
                      background: isActive ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'transparent',
                      color: isActive ? '#fff' : '#4A6670',
                      textTransform: 'capitalize',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    {cycle}{cycle === 'annual' && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.95 }}>save 17%</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── TIER CARDS ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: upgradeOptions.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
            marginBottom: 28,
          }}>
            {upgradeOptions.map((tier) => {
              const meta = TIER_METADATA[tier]
              const features = TIER_FEATURES[tier]
              const isCheckout = checkoutLoading === tier
              const isElite = tier === 'concierge'
              const isPro = tier === 'officemgr'
              const price = interval === 'annual' ? meta.annual : meta.monthly
              const annualTotal = meta.annual * 12

              return (
                <div
                  key={tier}
                  style={{
                    background: isPro
                      ? 'linear-gradient(160deg, #FFFFFF 0%, #FFF7EE 100%)'
                      : isElite
                      ? 'linear-gradient(160deg, #FFFFFF 0%, #F0FBF8 100%)'
                      : '#fff',
                    border: `2px solid ${isPro ? '#FF9D5A' : isElite ? '#0AA89F' : '#E8DFCF'}`,
                    borderRadius: 18,
                    padding: 24,
                    position: 'relative',
                    boxShadow: isPro ? '0 12px 32px rgba(232,116,43,0.18)' : '0 6px 18px rgba(11,31,58,0.06)',
                  }}
                >
                  {isPro && (
                    <div style={{
                      position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                      color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
                      textTransform: 'uppercase', padding: '5px 14px', borderRadius: 99,
                      boxShadow: '0 4px 12px rgba(232,116,43,0.32)',
                    }}>
                      Most Popular
                    </div>
                  )}
                  {isElite && (
                    <div style={{
                      position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                      background: 'linear-gradient(135deg, #0AA89F, #088A82)',
                      color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
                      textTransform: 'uppercase', padding: '5px 14px', borderRadius: 99,
                      boxShadow: '0 4px 12px rgba(10,168,159,0.32)',
                    }}>
                      Waitlist
                    </div>
                  )}

                  <div style={{ fontSize: 13, fontWeight: 800, color: isPro ? '#C84B26' : isElite ? '#0AA89F' : '#4A6670', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {meta.name}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 38, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.04em' }}>
                      ${price}
                    </span>
                    <span style={{ fontSize: 14, color: '#4A6670', fontWeight: 600 }}>/mo</span>
                  </div>
                  {interval === 'annual' && (
                    <div style={{ fontSize: 11, color: '#4A6670', marginBottom: 14 }}>
                      ${annualTotal.toLocaleString()} billed yearly · 2 months free vs monthly
                    </div>
                  )}
                  {interval === 'monthly' && (
                    <div style={{ fontSize: 11, color: '#4A6670', marginBottom: 14 }}>
                      Cancel anytime · 30-day money-back
                    </div>
                  )}

                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A', marginBottom: 4 }}>
                    {features.tagline}
                  </div>
                  <div style={{ fontSize: 12, color: '#4A6670', marginBottom: 16 }}>
                    {features.callCap} · {features.reports}
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {features.highlights.map((h, i) => (
                      <li key={i} style={{ fontSize: 13, color: '#0B1F3A', display: 'flex', alignItems: 'flex-start', gap: 7, lineHeight: 1.45 }}>
                        <span style={{ color: isPro ? '#E8742B' : isElite ? '#0AA89F' : '#22C55E', fontWeight: 900, flexShrink: 0, fontSize: 13, marginTop: 1 }}>✓</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>

                  {/* ROI math — only show for paid tiers */}
                  <div style={{
                    background: isPro ? 'rgba(232,116,43,0.08)' : isElite ? 'rgba(10,168,159,0.08)' : '#F5F1EA',
                    border: `1px solid ${isPro ? 'rgba(232,116,43,0.16)' : isElite ? 'rgba(10,168,159,0.16)' : 'rgba(0,0,0,0.06)'}`,
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 16,
                    fontSize: 12, color: '#0B1F3A', lineHeight: 1.5,
                  }}>
                    <strong>The math:</strong> avg service ticket = ~$350. {tier === 'officemgr' ? 'Pro pays for itself if it saves you ONE callback per month.' : tier === 'concierge' ? 'Elite pays for itself with TWO saved jobs per month — usually covers itself in the first week.'  : 'Pays for itself with ONE saved job.'}
                  </div>

                  <button
                    onClick={() => handleUpgrade(tier)}
                    disabled={isCheckout}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: 12,
                      border: 'none',
                      background: isElite
                        ? 'linear-gradient(135deg, #0AA89F, #088A82)'
                        : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                      color: '#fff',
                      fontSize: 15, fontWeight: 900,
                      letterSpacing: '-0.01em',
                      cursor: isCheckout ? 'wait' : 'pointer',
                      boxShadow: isElite ? '0 6px 18px rgba(10,168,159,0.32)' : '0 6px 18px rgba(232,116,43,0.32)',
                      transition: 'transform 120ms ease',
                    }}
                    onMouseEnter={(e) => !isCheckout && (e.currentTarget.style.transform = 'translateY(-2px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    {isCheckout ? 'Redirecting to checkout…' : isElite ? `Join Elite Waitlist →` : `Upgrade to ${meta.name} →`}
                  </button>

                  {!isElite && (
                    <div style={{ fontSize: 11, color: '#4A6670', marginTop: 10, textAlign: 'center' }}>
                      Secure checkout via Stripe · Cancel anytime
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── FAQ / TRUST ── */}
          <div style={{ background: '#F5F1EA', borderRadius: 14, padding: 22, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', marginBottom: 12 }}>
              Questions before upgrading?
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {[
                { q: 'When does the new plan start?', a: 'The moment payment clears. Your AI gets the new features within 60 sec.' },
                { q: 'Will my number change?', a: 'No — your BellAveGo number stays the same. Only the features expand.' },
                { q: 'Can I downgrade later?', a: 'Yes, anytime from your Stripe billing portal. No long contracts.' },
                { q: 'What about my current billing cycle?', a: 'Stripe auto-prorates. You only pay the difference for the rest of the cycle.' },
              ].map((item) => (
                <div key={item.q}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#0B1F3A', marginBottom: 3 }}>{item.q}</div>
                  <div style={{ fontSize: 12, color: '#4A6670', lineHeight: 1.5 }}>{item.a}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 12, color: '#4A6670' }}>
            Need help deciding? Text Peter at{' '}
            <a href="sms:+17737109565" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>
              (773) 710-9565
            </a>
            {' '}— real human, replies fast.
          </div>
        </>
      )}
    </div>
  )
}
