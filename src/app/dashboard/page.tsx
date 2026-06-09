'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

/**
 * /dashboard — 2026-06-09 LEADS-ONLY SIMPLIFIED.
 *
 * Per Peter: dashboard should ONLY surface:
 *   - This week's leads
 *   - This month's leads
 *   - All past leads
 *   - "Buy more leads manually" — custom-amount input (any qty × $25)
 *
 * Removed every other widget (call_logs, calendar, Vapi status,
 * outreach prompt status, etc). Customer lands here, sees their leads,
 * can buy more if they need more, opens any lead for full detail.
 */

type LeadStub = {
  id: string
  street_address: string | null
  zip: string | null
  city: string | null
  trade_match: string[] | null
  source: string | null
  source_event_date: string | null
  created_at: string | null
}

type SimplifiedSummary = {
  ok: boolean
  this_week_count: number
  this_month_count: number
  all_count: number
  this_week_leads: LeadStub[]
  this_month_leads: LeadStub[]
  all_leads: LeadStub[]
}

type Profile = {
  business_name?: string | null
  owner_first_name?: string | null
  setup_complete?: boolean | null
}

type Tab = 'week' | 'month' | 'all'

const SIGNAL_LABEL: Record<string, string> = {
  permit: '🏗️ Permit',
  aging_hvac: '🌡️ Aged HVAC',
  storm: '⛈️ Storm',
  move_in: '🏠 New owner',
}

export default function DashboardSimplified() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [summary, setSummary] = useState<SimplifiedSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('week')
  const [customQty, setCustomQty] = useState<number>(5)
  const [buying, setBuying] = useState(false)
  const [buyErr, setBuyErr] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { router.replace('/sign-in?redirect_url=/dashboard'); return }
    ;(async () => {
      try {
        const [p, s] = await Promise.all([
          fetch('/api/profile').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/dashboard/leads-summary').then((r) => (r.ok ? r.json() : null)),
        ])
        if (p) {
          setProfile(p)
          if (!p.setup_complete) {
            router.replace('/dashboard/setup')
            return
          }
        }
        if (s) setSummary(s)
      } catch {/* */}
      setLoading(false)
    })()
  }, [isLoaded, isSignedIn, router])

  async function buyCustom() {
    if (customQty < 1) { setBuyErr('Pick at least 1 lead'); return }
    if (customQty > 200) { setBuyErr('Max 200 per purchase. Buy multiple if you need more.'); return }
    setBuying(true); setBuyErr(null)
    try {
      const r = await fetch('/api/stripe/checkout-alacarte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty: customQty }),
      })
      const j = await r.json()
      if (!r.ok) { setBuyErr(j.error || 'Checkout failed'); setBuying(false); return }
      if (j.url) window.location.href = j.url
    } catch (e) { setBuyErr((e as Error).message); setBuying(false) }
  }

  if (loading || !isLoaded) {
    return <main style={loadingStyle}><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Loading…</div></main>
  }

  const currentLeads = tab === 'week' ? summary?.this_week_leads
    : tab === 'month' ? summary?.this_month_leads
    : summary?.all_leads
  const currentCount = tab === 'week' ? summary?.this_week_count
    : tab === 'month' ? summary?.this_month_count
    : summary?.all_count
  const customTotal = customQty * 25

  return (
    <div style={{ color: '#0B1F3A' }}>
      <section style={{ padding: '32px clamp(16px, 4vw, 40px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
              {profile?.business_name || 'Your dashboard'}
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 3.4vw, 40px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>
              {profile?.owner_first_name ? `Hey ${profile.owner_first_name} —` : 'Your leads'}
            </h1>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 26 }}>
            <StatCard
              label="This week"
              value={summary?.this_week_count ?? 0}
              active={tab === 'week'}
              onClick={() => setTab('week')}
            />
            <StatCard
              label="This month"
              value={summary?.this_month_count ?? 0}
              active={tab === 'month'}
              onClick={() => setTab('month')}
            />
            <StatCard
              label="All past"
              value={summary?.all_count ?? 0}
              active={tab === 'all'}
              onClick={() => setTab('all')}
            />
          </div>

          {/* Leads list */}
          <section style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#C84B26', margin: 0 }}>
                {tab === 'week' ? 'This week' : tab === 'month' ? 'This month' : 'All past leads'} · {currentCount ?? 0}
              </h2>
              <Link href="/dashboard/leads" style={ctaSecondary}>Open lead manager →</Link>
            </div>
            {currentLeads && currentLeads.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {currentLeads.slice(0, 25).map((l) => <LeadRow key={l.id} l={l} />)}
              </div>
            ) : (
              <div style={emptyState}>
                {tab === 'week'
                  ? 'No leads delivered this week yet. Next drop fires Monday morning.'
                  : tab === 'month'
                    ? 'No leads this month yet.'
                    : 'No leads delivered yet. Your first drop arrives within 24 hrs of finishing onboarding.'}
              </div>
            )}
          </section>

          {/* Buy more leads */}
          <section style={{
            padding: 'clamp(24px, 3vw, 32px)',
            borderRadius: 18,
            background: 'linear-gradient(165deg, #FFFFFF 0%, #FFF8F0 100%)',
            border: '1.5px solid rgba(232,116,43,0.22)',
            boxShadow: '0 14px 36px rgba(11,31,58,0.08)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1 1 280px', minWidth: 280 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Need more leads this week?
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
                  Buy extra leads — any amount
                </h3>
                <p style={{ fontSize: 13.5, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>
                  $25 per extra lead. Same exclusive territory. Delivered within 24 hrs. One-time charge — no subscription changes.
                </p>
              </div>

              <div style={{ flex: '0 1 320px', minWidth: 280 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#4A6670', letterSpacing: '0.10em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                  How many?
                </label>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 10 }}>
                  <button
                    onClick={() => setCustomQty(Math.max(1, customQty - 5))}
                    style={qtyBtn}
                  >−5</button>
                  <input
                    type="number" min={1} max={200}
                    value={customQty}
                    onChange={(e) => setCustomQty(Math.max(1, Math.min(200, parseInt(e.target.value || '1', 10))))}
                    style={qtyInput}
                  />
                  <button
                    onClick={() => setCustomQty(Math.min(200, customQty + 5))}
                    style={qtyBtn}
                  >+5</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: '#4A6670' }}>{customQty} × $25</span>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#C84B26', letterSpacing: '-0.5px' }}>${customTotal}</span>
                </div>
                <button
                  onClick={buyCustom}
                  disabled={buying}
                  style={{
                    width: '100%', padding: '14px 18px', borderRadius: 12,
                    background: buying ? 'rgba(11,31,58,0.3)' : 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
                    color: '#fff', border: 'none', cursor: buying ? 'wait' : 'pointer',
                    fontSize: 14, fontWeight: 900,
                    boxShadow: '0 10px 28px rgba(232,116,43,0.40)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {buying ? 'Redirecting to Stripe…' : `Buy ${customQty} ${customQty === 1 ? 'lead' : 'leads'} for $${customTotal} →`}
                </button>
                {buyErr && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#991B1B', fontSize: 12 }}>{buyErr}</div>
                )}
                <div style={{ fontSize: 10.5, color: '#7AAAB2', marginTop: 8, textAlign: 'center' }}>
                  Min 1 · Max 200 per purchase
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '18px 22px', borderRadius: 14, textAlign: 'left',
        background: active ? 'linear-gradient(135deg, #FFD9A8 0%, #FFFFFF 100%)' : '#FFFFFF',
        border: active ? '2px solid #E8742B' : '1.5px solid rgba(232,116,43,0.22)',
        boxShadow: active ? '0 10px 24px rgba(232,116,43,0.20)' : '0 6px 18px rgba(11,31,58,0.05)',
        cursor: 'pointer', transition: 'all 180ms ease',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: active ? '#C84B26' : '#4A6670', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 32, fontWeight: 900, letterSpacing: '-1.2px',
        background: 'linear-gradient(135deg, #FF9D5A, #C84B26)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        lineHeight: 1.05,
      }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 4, fontWeight: 600 }}>
        {value === 1 ? 'lead' : 'leads'}
      </div>
    </button>
  )
}

function LeadRow({ l }: { l: LeadStub }) {
  const sig = l.source ? SIGNAL_LABEL[l.source] || `🔔 ${l.source}` : ''
  return (
    <Link href={`/dashboard/leads/${l.id}`} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14,
      padding: '14px 18px', borderRadius: 12,
      background: '#FFFFFF',
      border: '1px solid rgba(232,116,43,0.14)',
      boxShadow: '0 4px 12px rgba(11,31,58,0.04)',
      textDecoration: 'none', color: 'inherit',
      transition: 'transform 120ms ease, box-shadow 120ms ease',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A' }}>
          {l.street_address || `ZIP ${l.zip ?? '—'}`}
        </div>
        <div style={{ fontSize: 11.5, color: '#4A6670', marginTop: 3 }}>
          {(l.trade_match || []).join(' · ')}
          {sig && ` · ${sig}`}
          {l.source_event_date && ` · ${new Date(l.source_event_date).toLocaleDateString()}`}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#E8742B' }}>Open →</div>
    </Link>
  )
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh', background: '#FFF8F0', color: '#0B1F3A',
  fontFamily: "'Inter', system-ui, sans-serif",
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
const ctaSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 9,
  background: 'rgba(232,116,43,0.10)',
  border: '1px solid rgba(232,116,43,0.30)',
  color: '#C84B26', textDecoration: 'none',
  fontWeight: 800, fontSize: 12.5,
}
const emptyState: React.CSSProperties = {
  padding: 28, textAlign: 'center', borderRadius: 14,
  background: '#FFFFFF',
  border: '1px dashed rgba(232,116,43,0.30)',
  color: '#4A6670', fontSize: 14,
}
const qtyBtn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10,
  background: '#FFFFFF',
  border: '1.5px solid rgba(232,116,43,0.30)',
  color: '#0B1F3A', cursor: 'pointer',
  fontSize: 13, fontWeight: 800,
}
const qtyInput: React.CSSProperties = {
  flex: 1, padding: '10px 14px', borderRadius: 10,
  border: '1.5px solid rgba(232,116,43,0.30)',
  background: '#FFFFFF', color: '#0B1F3A',
  fontSize: 18, fontWeight: 800, textAlign: 'center',
  outline: 'none',
}
