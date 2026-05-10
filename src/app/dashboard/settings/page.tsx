'use client'
import { useState, useEffect } from 'react'
import { useUser, SignOutButton } from '@clerk/nextjs'

const card: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid rgba(10,168,159,0.14)',
  borderRadius: 14,
  overflow: 'hidden',
  marginBottom: 16,
  boxShadow: '0 2px 16px rgba(7,27,58,0.06)',
}
const cardHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid rgba(10,168,159,0.1)',
}
const cardBody: React.CSSProperties = { padding: '20px 18px' }
const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#4A7A80',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
  display: 'block',
}
const input: React.CSSProperties = {
  width: '100%',
  background: '#F5FDFB',
  border: '1.5px solid rgba(10,168,159,0.2)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: '#0B1F3A',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}
const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }

const TIER_LABELS: Record<string, { label: string; calls: string; price: string }> = {
  foundation: { label: 'Foundation', calls: 'Unlimited calls', price: '$79/mo' },
  growth:     { label: 'Growth',     calls: 'Unlimited calls', price: '$179/mo' },
  multiloc:   { label: 'Multi-location', calls: 'Custom', price: 'Custom' },
  cancelled:  { label: 'Cancelled', calls: '—', price: '—' },
  // Legacy tiers (existing customers — keep for back-compat)
  solo:    { label: 'Solo (legacy)',   calls: '150 calls/mo',   price: '$147/mo' },
  scale:   { label: 'Scale (legacy)',  calls: '1,500 calls/mo', price: '$597/mo' },
  starter: { label: 'Starter (legacy)', calls: '200 calls/mo',  price: '$49/mo' },
}

export default function SettingsPage() {
  const { user } = useUser()
  const [profile, setProfile] = useState<any>(null)
  const [businessName, setBusinessName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [billingLoading, setBillingLoading] = useState(false)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const res = await fetch('/api/profile')
    if (!res.ok) return
    const data = await res.json()
    setProfile(data)
    setBusinessName(data?.business_name || '')
    setOwnerPhone(data?.owner_phone || '')
  }

  async function save() {
    setSaving(true)
    setSaveStatus('idle')
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_name: businessName, owner_phone: ownerPhone }),
    })
    setSaving(false)
    setSaveStatus(res.ok ? 'saved' : 'error')
    if (res.ok) setTimeout(() => setSaveStatus('idle'), 2500)
  }

  async function openBillingPortal() {
    setBillingLoading(true)
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const { url } = await res.json()
    setBillingLoading(false)
    if (url) window.location.href = url
  }

  const tier = profile?.plan_tier || 'starter'
  const tierInfo = TIER_LABELS[tier] || TIER_LABELS.starter

  return (
    <div style={{ padding: '24px 28px 60px', color: '#0B1F3A', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Account
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0B1F3A', letterSpacing: '-0.5px', marginBottom: 4 }}>Settings</h1>
        <p style={{ fontSize: 13, color: '#4A7A80' }}>Manage your account, business info, and billing.</p>
      </div>

      {/* Business Info */}
      <div style={card}>
        <div style={cardHead}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A' }}>Business Info</div>
        </div>
        <div style={cardBody}>
          <div style={row}>
            <div>
              <span style={label}>Business Name</span>
              <input
                style={input}
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="Mike's HVAC"
              />
            </div>
            <div>
              <span style={label}>Your Phone (SMS approvals go here)</span>
              <input
                style={input}
                value={ownerPhone}
                onChange={e => setOwnerPhone(e.target.value)}
                placeholder="+17737109565"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ fontSize: 12, color: '#7AAAB2' }}>
              Your AI receptionist number: <span style={{ fontWeight: 700, color: '#0AA89F', fontFamily: 'monospace' }}>{profile?.twilio_number || 'Provisioning...'}</span>
            </div>
            <button
              onClick={save}
              disabled={saving}
              style={{
                fontSize: 13,
                fontWeight: 700,
                padding: '9px 22px',
                borderRadius: 9,
                border: 'none',
                background: saveStatus === 'saved' ? '#22C55E' : saveStatus === 'error' ? '#DC2626' : 'linear-gradient(135deg,#0AA89F,#0D8F87)',
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s',
              }}
            >
              {saving ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div style={card}>
        <div style={cardHead}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A' }}>Account</div>
        </div>
        <div style={cardBody}>
          <div style={row}>
            <div>
              <span style={label}>Email</span>
              <div style={{ ...input, color: '#7AAAB2', cursor: 'default', background: 'rgba(10,168,159,0.04)' }}>
                {user?.primaryEmailAddress?.emailAddress || '—'}
              </div>
            </div>
            <div>
              <span style={label}>Account ID</span>
              <div style={{ ...input, color: '#7AAAB2', cursor: 'default', background: 'rgba(10,168,159,0.04)', fontFamily: 'monospace', fontSize: 12 }}>
                {user?.id || '—'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <SignOutButton>
              <button style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid rgba(220,38,38,0.2)',
                background: '#FEF2F2',
                color: '#DC2626',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
                Sign Out
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>

      {/* Plan & Billing */}
      <div style={card}>
        <div style={cardHead}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A' }}>Plan & Billing</div>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 20,
            background: tier === 'cancelled' ? '#FEF2F2' : 'rgba(10,168,159,0.08)',
            color: tier === 'cancelled' ? '#DC2626' : '#0AA89F',
            border: `1px solid ${tier === 'cancelled' ? '#FECACA' : 'rgba(10,168,159,0.2)'}`,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {tierInfo.label}
          </span>
        </div>
        <div style={cardBody}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Current Plan', value: tierInfo.label },
              { label: 'Included Calls', value: tierInfo.calls },
              { label: 'Monthly Price', value: tierInfo.price },
            ].map(({ label: l, value }) => (
              <div key={l} style={{ background: 'rgba(10,168,159,0.04)', border: '1px solid rgba(10,168,159,0.12)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1F3A' }}>{value}</div>
              </div>
            ))}
          </div>

          {tier !== 'cancelled' ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={openBillingPortal}
                disabled={billingLoading}
                style={{ fontSize: 13, fontWeight: 700, padding: '9px 22px', borderRadius: 9, border: '1px solid rgba(10,168,159,0.2)', background: 'rgba(10,168,159,0.06)', color: '#0AA89F', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {billingLoading ? 'Loading...' : 'Manage Billing'}
              </button>
            </div>
          ) : (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#DC2626' }}>
              Your subscription has been cancelled. <a href="/pricing" style={{ color: '#DC2626', fontWeight: 700 }}>Resubscribe →</a>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
