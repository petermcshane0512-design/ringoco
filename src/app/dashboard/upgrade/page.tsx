'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TIER_METADATA, TIER_FEATURES, type Tier } from '@/lib/pricing'

/**
 * Plan management — upgrade, downgrade, switch billing cycle, or cancel.
 *
 * Lives at /dashboard/upgrade for backward-compat with existing CTAs, but
 * really handles ALL plan-change actions in one place:
 *
 *   - Customer NOT subscribed → shows tier picker → /api/stripe/checkout
 *   - Customer on Starter   → shows Pro/Elite as upgrades → /api/stripe/change-tier
 *   - Customer on Pro       → shows Starter (downgrade) + Elite (upgrade)
 *   - Customer on Elite     → top-tier confirmation
 *   - Every paid customer   → "Manage billing / Cancel" link → Stripe portal
 *
 * Tier change endpoint:
 *   /api/stripe/change-tier — UPDATES existing subscription (proration auto)
 *   /api/stripe/checkout    — CREATES new subscription (signup only)
 *   /api/stripe/portal      — Stripe billing portal (cancel / payment method)
 */

const TIER_ORDER: Tier[] = ['receptionist', 'officemgr', 'concierge']

export default function PlanManagementPage() {
  const router = useRouter()
  const [currentTier, setCurrentTier] = useState<Tier | null>(null)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [interval, setInterval] = useState<'monthly' | 'annual'>('annual')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((p) => {
        if (p && !p.error) {
          setCurrentTier((p.plan_tier as Tier) || null)
          setHasSubscription(!!p.stripe_subscription_id)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const currentIdx = currentTier ? TIER_ORDER.indexOf(currentTier) : -1

  async function handleChangePlan(targetTier: Tier, action: 'upgrade' | 'downgrade' | 'switch') {
    if (targetTier === 'concierge') {
      window.location.href = '/waitlist?tier=concierge&from=dashboard-plan'
      return
    }
    const targetMeta = TIER_METADATA[targetTier]
    const confirmMsg =
      action === 'downgrade'
        ? `Downgrade to ${targetMeta.name} ($${targetMeta.monthly}/mo)?\n\nStripe will credit your unused time on Pro and apply the new price next billing cycle.`
        : action === 'upgrade'
        ? `Upgrade to ${targetMeta.name} ($${targetMeta.monthly}/mo)?\n\nYou'll be charged the prorated difference today. New features unlock instantly.`
        : `Switch to ${interval} billing on ${targetMeta.name}?\n\nProration applies automatically.`
    if (!window.confirm(confirmMsg)) return

    setActionLoading(targetTier)
    setStatusMsg(null)
    try {
      // Existing subscriber → in-app tier change
      if (hasSubscription) {
        const res = await fetch('/api/stripe/change-tier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: targetTier, interval }),
        })
        const data = await res.json()
        if (!res.ok) {
          if (data.redirect_to_checkout) {
            // Fall back to fresh checkout
            return startCheckout(targetTier)
          }
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        setStatusMsg({ type: 'success', text: data.message || `You're now on ${targetMeta.name}.` })
        setCurrentTier(targetTier)
        // Refresh profile to sync any other fields the webhook updated
        setTimeout(() => router.refresh(), 800)
      } else {
        // No subscription yet → fresh checkout
        await startCheckout(targetTier)
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: (e as Error).message })
    } finally {
      setActionLoading(null)
    }
  }

  async function startCheckout(targetTier: Tier) {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: targetTier, interval }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      throw new Error(data.error || 'Checkout failed')
    }
  }

  async function openBillingPortal() {
    setActionLoading('portal')
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Could not open billing portal')
      }
    } catch (e) {
      setStatusMsg({ type: 'error', text: (e as Error).message })
      setActionLoading(null)
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

      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/dashboard"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4A6670', textDecoration: 'none', marginBottom: 16 }}
        >
          ← Back to dashboard
        </Link>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.04em' }}>
          Manage your{' '}
          <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            plan
          </span>
        </h1>
        <p style={{ color: '#4A6670', fontSize: 14, margin: '6px 0 0' }}>
          Upgrade, downgrade, switch billing cycle, or cancel — all instant. Proration applied automatically.
        </p>
      </div>

      {/* CURRENT PLAN BADGE */}
      {currentTier && TIER_METADATA[currentTier] && (
        <div style={{
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F0FBF8 100%)',
          border: '1.5px solid rgba(10,168,159,0.22)',
          borderRadius: 16,
          padding: '18px 22px',
          marginBottom: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              Current plan
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>
                {TIER_METADATA[currentTier].name}
              </span>
              <span style={{ fontSize: 14, color: '#4A6670', fontWeight: 600 }}>
                · ${TIER_METADATA[currentTier].monthly}/mo
              </span>
              <span style={{ fontSize: 12, color: '#4A6670' }}>
                · {TIER_FEATURES[currentTier].callCap}
              </span>
            </div>
          </div>
          {hasSubscription && (
            <button
              onClick={openBillingPortal}
              disabled={actionLoading === 'portal'}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1.5px solid rgba(10,168,159,0.25)',
                background: '#fff',
                color: '#0AA89F',
                fontSize: 13,
                fontWeight: 800,
                cursor: actionLoading === 'portal' ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {actionLoading === 'portal' ? 'Opening…' : 'Manage billing / Cancel'}
            </button>
          )}
        </div>
      )}

      {/* STATUS MESSAGE */}
      {statusMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          marginBottom: 22,
          background: statusMsg.type === 'success' ? '#ECFDF5' : statusMsg.type === 'error' ? '#FEF2F2' : '#FFFBEB',
          border: `1px solid ${statusMsg.type === 'success' ? '#A7F3D0' : statusMsg.type === 'error' ? '#FECACA' : '#FDE68A'}`,
          color: statusMsg.type === 'success' ? '#065F46' : statusMsg.type === 'error' ? '#991B1B' : '#92400E',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {statusMsg.text}
        </div>
      )}

      {/* BILLING CYCLE TOGGLE */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
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

      {/* TIER CARDS — show ALL 3 with appropriate CTA based on current tier */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        {TIER_ORDER.map((tier) => {
          const meta = TIER_METADATA[tier]
          const features = TIER_FEATURES[tier]
          const tierIdx = TIER_ORDER.indexOf(tier)
          const isCurrent = currentTier === tier
          const isUpgrade = currentIdx >= 0 && tierIdx > currentIdx
          const isDowngrade = currentIdx >= 0 && tierIdx < currentIdx
          const isElite = tier === 'concierge'
          const isPro = tier === 'officemgr'
          const isCheckout = actionLoading === tier
          const price = interval === 'annual' ? meta.annual : meta.monthly
          const annualTotal = meta.annual * 12

          // CTA logic
          let ctaLabel: string
          let ctaAction: 'upgrade' | 'downgrade' | 'switch' | 'none' = 'none'
          let ctaDisabled = false
          if (isElite) {
            ctaLabel = 'Join Elite Waitlist →'
            ctaAction = 'upgrade'
          } else if (isCurrent) {
            ctaLabel = '✓ Your current plan'
            ctaDisabled = true
          } else if (isUpgrade) {
            ctaLabel = `Upgrade to ${meta.name} →`
            ctaAction = 'upgrade'
          } else if (isDowngrade) {
            ctaLabel = `Downgrade to ${meta.name}`
            ctaAction = 'downgrade'
          } else {
            ctaLabel = `Get ${meta.name} →`
            ctaAction = 'upgrade'
          }

          return (
            <div
              key={tier}
              style={{
                background: isCurrent
                  ? 'linear-gradient(160deg, #ECFDF5 0%, #FFFFFF 100%)'
                  : isPro
                  ? 'linear-gradient(160deg, #FFFFFF 0%, #FFF7EE 100%)'
                  : isElite
                  ? 'linear-gradient(160deg, #FFFFFF 0%, #F0FBF8 100%)'
                  : '#fff',
                border: `2px solid ${isCurrent ? '#22C55E' : isPro ? '#FF9D5A' : isElite ? '#0AA89F' : '#E8DFCF'}`,
                borderRadius: 18,
                padding: 22,
                position: 'relative',
                boxShadow: isCurrent
                  ? '0 8px 24px rgba(34,197,94,0.18)'
                  : isPro
                  ? '0 12px 32px rgba(232,116,43,0.18)'
                  : '0 6px 18px rgba(11,31,58,0.06)',
              }}
            >
              {isCurrent && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: '#22C55E',
                  color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em',
                  textTransform: 'uppercase', padding: '5px 14px', borderRadius: 99,
                  boxShadow: '0 4px 12px rgba(34,197,94,0.32)',
                }}>
                  Current
                </div>
              )}
              {isPro && !isCurrent && (
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
              {isElite && !isCurrent && (
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

              <div style={{ fontSize: 13, fontWeight: 800, color: isCurrent ? '#22C55E' : isPro ? '#C84B26' : isElite ? '#0AA89F' : '#4A6670', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                {meta.name}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 34, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.04em' }}>
                  ${price}
                </span>
                <span style={{ fontSize: 13, color: '#4A6670', fontWeight: 600 }}>/mo</span>
              </div>
              {interval === 'annual' && (
                <div style={{ fontSize: 11, color: '#4A6670', marginBottom: 12 }}>
                  ${annualTotal.toLocaleString()} billed yearly · save 17%
                </div>
              )}
              {interval === 'monthly' && (
                <div style={{ fontSize: 11, color: '#4A6670', marginBottom: 12 }}>
                  Cancel anytime · 7-day free trial
                </div>
              )}

              <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A', marginBottom: 4 }}>
                {features.tagline}
              </div>
              <div style={{ fontSize: 11, color: '#4A6670', marginBottom: 14 }}>
                {features.callCap} · {features.reportsCadence}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {features.highlights.map((h, i) => (
                  <li key={i} style={{ fontSize: 12.5, color: '#0B1F3A', display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
                    <span style={{ color: isCurrent ? '#22C55E' : isPro ? '#E8742B' : isElite ? '#0AA89F' : '#22C55E', fontWeight: 900, flexShrink: 0, fontSize: 12, marginTop: 1 }}>✓</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => ctaAction !== 'none' && handleChangePlan(tier, ctaAction)}
                disabled={ctaDisabled || isCheckout}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: 'none',
                  background: ctaDisabled
                    ? '#ECFDF5'
                    : isDowngrade
                    ? '#fff'
                    : isElite
                    ? 'linear-gradient(135deg, #0AA89F, #088A82)'
                    : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  color: ctaDisabled ? '#065F46' : isDowngrade ? '#4A6670' : '#fff',
                  fontSize: 14, fontWeight: 900,
                  letterSpacing: '-0.01em',
                  cursor: ctaDisabled ? 'default' : isCheckout ? 'wait' : 'pointer',
                  boxShadow: ctaDisabled
                    ? 'none'
                    : isDowngrade
                    ? 'none'
                    : isElite
                    ? '0 6px 18px rgba(10,168,159,0.32)'
                    : '0 6px 18px rgba(232,116,43,0.32)',
                  outline: isDowngrade ? '1.5px solid #E8DFCF' : 'none',
                  transition: 'transform 120ms ease',
                }}
              >
                {isCheckout ? 'Processing…' : ctaLabel}
              </button>
            </div>
          )
        })}
      </div>

      {/* CANCEL / BILLING PORTAL */}
      {hasSubscription && (
        <div style={{
          background: '#F5F1EA',
          borderRadius: 14,
          padding: '20px 22px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', marginBottom: 4 }}>
              Need to cancel or update payment?
            </div>
            <div style={{ fontSize: 12, color: '#4A6670' }}>
              Manage billing, update your card, view invoices, or cancel — all from the Stripe portal.
            </div>
          </div>
          <button
            onClick={openBillingPortal}
            disabled={actionLoading === 'portal'}
            style={{
              padding: '12px 20px',
              borderRadius: 10,
              border: '1.5px solid #0B1F3A',
              background: '#fff',
              color: '#0B1F3A',
              fontSize: 13,
              fontWeight: 800,
              cursor: actionLoading === 'portal' ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {actionLoading === 'portal' ? 'Opening…' : 'Open billing portal →'}
          </button>
        </div>
      )}

      {/* FAQ */}
      <div style={{ background: '#F5F1EA', borderRadius: 14, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', marginBottom: 12 }}>
          Questions before changing?
        </div>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {[
            { q: 'When does the new plan start?', a: 'Upgrades: instantly. Downgrades: at next billing cycle (you keep current features until then).' },
            { q: 'Will my number change?', a: 'No — your BellAveGo number stays the same on any tier change.' },
            { q: 'How is proration handled?', a: 'Stripe auto-prorates. Upgrades charge the difference today. Downgrades credit your account.' },
            { q: 'Lock-in?', a: 'None. Month-to-month even on annual plans (refund prorated if cancelled early).' },
          ].map((item) => (
            <div key={item.q}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0B1F3A', marginBottom: 3 }}>{item.q}</div>
              <div style={{ fontSize: 12, color: '#4A6670', lineHeight: 1.5 }}>{item.a}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: '#4A6670' }}>
        Need help? Text Peter at{' '}
        <a href="sms:+17737109565" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>
          (773) 710-9565
        </a>
        {' '}— real human, replies fast.
      </div>
    </div>
  )
}
