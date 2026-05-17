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
  // v7 active (May 12 2026)
  receptionist: { label: 'Mission Control',   calls: '250 calls/mo',     price: '$397/mo' },
  officemgr:    { label: 'Operator',          calls: 'Unlimited calls',  price: '$797/mo' },
  concierge:    { label: 'Concierge',         calls: 'Unlimited calls',  price: '$1,997/mo' },
  cancelled:    { label: 'Cancelled', calls: '—', price: '—' },
  // Legacy tiers (existing customers — keep for back-compat)
  foundation:   { label: 'Foundation (legacy)', calls: 'Unlimited', price: '$79/mo or $129/mo' },
  growth:       { label: 'Growth (legacy)',     calls: 'Unlimited', price: '$179/mo or $279/mo' },
  premium:      { label: 'Premium (legacy)',    calls: 'Unlimited', price: '$499/mo' },
  multiloc:     { label: 'Multi-location (legacy)', calls: 'Custom', price: 'Custom' },
  solo:         { label: 'Solo (legacy)',       calls: '150 calls/mo',   price: '$147/mo' },
  scale:        { label: 'Scale (legacy)',      calls: '1,500 calls/mo', price: '$597/mo' },
  starter:      { label: 'Starter (legacy)',    calls: '200 calls/mo',   price: '$49/mo' },
}

export default function SettingsPage() {
  const { user } = useUser()
  const [profile, setProfile] = useState<any>(null)
  const [businessName, setBusinessName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [customPromptNotes, setCustomPromptNotes] = useState('')
  const [aiTone, setAiTone] = useState<'friendly' | 'professional' | 'concise'>('friendly')
  const [aiLanguage, setAiLanguage] = useState<'en' | 'es'>('en')
  const [aiVoiceId, setAiVoiceId] = useState<string>('156fb8d2-335b-4950-9cb3-a2d33befec77')
  const [backupOwnerPhone, setBackupOwnerPhone] = useState('')
  const [testCallStatus, setTestCallStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [billingLoading, setBillingLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelStatus, setCancelStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [cancelMessage, setCancelMessage] = useState('')
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState<string>('')
  const [cancelReasonDetail, setCancelReasonDetail] = useState('')

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const res = await fetch('/api/profile')
    if (!res.ok) return
    const data = await res.json()
    setProfile(data)
    setBusinessName(data?.business_name || '')
    setOwnerPhone(data?.owner_phone || '')
    setCustomPromptNotes(data?.custom_prompt_notes || '')
    setAiTone((data?.ai_tone as 'friendly' | 'professional' | 'concise') || 'friendly')
    setAiLanguage((data?.ai_language as 'en' | 'es') || 'en')
    setAiVoiceId(data?.ai_voice_id || '156fb8d2-335b-4950-9cb3-a2d33befec77')
    setBackupOwnerPhone(data?.backup_owner_phone || '')
  }

  async function triggerTestCall() {
    if (testCallStatus === 'sending') return
    setTestCallStatus('sending')
    try {
      const res = await fetch('/api/onboarding/test-call', { method: 'POST' })
      setTestCallStatus(res.ok ? 'sent' : 'error')
      setTimeout(() => setTestCallStatus('idle'), 4000)
    } catch {
      setTestCallStatus('error')
      setTimeout(() => setTestCallStatus('idle'), 4000)
    }
  }

  async function save() {
    setSaving(true)
    setSaveStatus('idle')
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: businessName,
        owner_phone: ownerPhone,
        custom_prompt_notes: customPromptNotes,
        ai_tone: aiTone,
        ai_language: aiLanguage,
        ai_voice_id: aiVoiceId,
        backup_owner_phone: backupOwnerPhone || null,
      }),
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

  function openCancelModal() {
    setCancelReason('')
    setCancelReasonDetail('')
    setCancelStatus('idle')
    setCancelMessage('')
    setCancelModalOpen(true)
  }

  async function submitCancel() {
    if (!cancelReason) return // require a reason picked
    setCancelling(true)
    setCancelStatus('idle')
    const res = await fetch('/api/subscription/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: cancelReason, reasonDetail: cancelReasonDetail }),
    })
    const json = await res.json().catch(() => ({}))
    setCancelling(false)
    if (res.ok) {
      setCancelStatus('success')
      setCancelMessage(json.message || 'Cancelled. Refund (if eligible) will appear in 5–10 business days.')
      setTimeout(() => { setCancelModalOpen(false); loadProfile() }, 2500)
    } else {
      setCancelStatus('error')
      setCancelMessage(json.error || 'Could not cancel — please text Peter at (773) 710-9565.')
    }
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

      {/* AI Voice & Tone */}
      <div style={card}>
        <div style={cardHead}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A' }}>AI Voice &amp; Tone</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(10,168,159,0.08)', color: '#0AA89F', border: '1px solid rgba(10,168,159,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live · ~60s to apply</span>
        </div>
        <div style={cardBody}>
          <p style={{ fontSize: 13, color: '#4A7A80', marginBottom: 16, lineHeight: 1.5 }}>
            Pick how your AI receptionist sounds. Changes go live within a minute. Tap “Test it” to hear it on your phone before saving.
          </p>

          {/* Voice picker */}
          <div style={{ marginBottom: 18 }}>
            <span style={label}>Voice</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {[
                { id: '156fb8d2-335b-4950-9cb3-a2d33befec77', name: 'Helpful Woman', desc: 'Warm, professional — default' },
                { id: 'bf991597-6c13-47e4-8411-91ec2de5c466', name: 'Newslady', desc: 'Polished, news-anchor energy' },
                { id: '421b3369-f63f-4b03-8980-37a44df1d4e8', name: 'Friendly Man', desc: 'Approachable male voice' },
              ].map((v) => {
                const active = aiVoiceId === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => setAiVoiceId(v.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.18)'}`,
                      background: active ? 'rgba(10,168,159,0.08)' : '#F5FDFB',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: active ? '#0AA89F' : '#0B1F3A' }}>
                      {active ? '✓ ' : ''}{v.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 2 }}>{v.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tone */}
          <div style={{ marginBottom: 18 }}>
            <span style={label}>Tone</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                { v: 'friendly', l: 'Friendly', d: 'Warm, conversational' },
                { v: 'professional', l: 'Professional', d: 'Polished, formal' },
                { v: 'concise', l: 'Concise', d: 'Brief, no small talk' },
              ] as const).map((o) => {
                const active = aiTone === o.v
                return (
                  <button
                    key={o.v}
                    onClick={() => setAiTone(o.v)}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 9,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.2)'}`,
                      background: active ? 'rgba(10,168,159,0.08)' : '#F5FDFB',
                      color: active ? '#0AA89F' : '#4A7A80',
                      fontFamily: 'inherit',
                    }}
                  >
                    {active ? '✓ ' : ''}{o.l}
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: active ? '#0AA89F' : '#7AAAB2', marginTop: 2 }}>{o.d}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Language */}
          <div style={{ marginBottom: 18 }}>
            <span style={label}>Language</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { v: 'en', l: 'English only' },
                { v: 'es', l: 'Spanish (Español)' },
              ] as const).map((o) => {
                const active = aiLanguage === o.v
                return (
                  <button
                    key={o.v}
                    onClick={() => setAiLanguage(o.v)}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 9,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.2)'}`,
                      background: active ? 'rgba(10,168,159,0.08)' : '#F5FDFB',
                      color: active ? '#0AA89F' : '#4A7A80',
                      fontFamily: 'inherit',
                    }}
                  >
                    {active ? '✓ ' : ''}{o.l}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Backup escalation phone */}
          <div style={{ marginBottom: 18 }}>
            <span style={label}>Backup escalation number (optional)</span>
            <input
              style={input}
              value={backupOwnerPhone}
              onChange={(e) => setBackupOwnerPhone(e.target.value)}
              placeholder="+15555550100"
            />
            <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 6 }}>
              When a caller flags an emergency and you don&apos;t pick up within 30s, we&apos;ll SMS this number as a backup so the lead doesn&apos;t die. Leave blank to skip.
            </div>
          </div>

          {/* Test call */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid rgba(10,168,159,0.10)' }}>
            <button
              onClick={triggerTestCall}
              disabled={!profile?.twilio_number || testCallStatus === 'sending'}
              style={{
                fontSize: 13,
                fontWeight: 800,
                padding: '10px 22px',
                borderRadius: 10,
                border: 'none',
                background: testCallStatus === 'sent' ? '#10B981' : 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
                color: '#fff',
                cursor: !profile?.twilio_number || testCallStatus === 'sending' ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: !profile?.twilio_number ? 0.5 : 1,
              }}
            >
              {testCallStatus === 'idle' && '📞 Test it on my phone'}
              {testCallStatus === 'sending' && 'Calling…'}
              {testCallStatus === 'sent' && '✓ Test call sent'}
              {testCallStatus === 'error' && '✗ Try again'}
            </button>
            <div style={{ fontSize: 11, color: '#7AAAB2' }}>
              Save changes first, then tap to call your business cell with the new voice.
            </div>
          </div>
        </div>
      </div>

      {/* Custom AI Instructions */}
      <div style={card}>
        <div style={cardHead}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A' }}>Custom AI Instructions</div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'rgba(10,168,159,0.08)', color: '#0AA89F',
            border: '1px solid rgba(10,168,159,0.2)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Beta
          </span>
        </div>
        <div style={cardBody}>
          <p style={{ fontSize: 13, color: '#4A7A80', marginBottom: 12, lineHeight: 1.5 }}>
            Tell your AI receptionist anything business-specific. These instructions are read on every call —
            use them to capture rules a generic prompt would miss.
          </p>
          <textarea
            value={customPromptNotes}
            onChange={e => setCustomPromptNotes(e.target.value)}
            placeholder={`Examples:
• Always quote $89 service-call fee before scheduling
• If they mention "warranty" — transfer to me directly at +1 (773) 710-9565
• We don't service commercial properties — politely decline
• For emergencies after 6pm, charge $150 emergency surcharge
• Spanish-speaking customers — switch to Spanish (we have bilingual techs)`}
            style={{
              ...input,
              minHeight: 160,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 8 }}>
            Tip: one rule per line. The AI is told to <strong style={{ color: '#0AA89F' }}>always follow</strong> these.
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
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <button
                  onClick={openBillingPortal}
                  disabled={billingLoading}
                  style={{ fontSize: 13, fontWeight: 700, padding: '9px 22px', borderRadius: 9, border: '1px solid rgba(10,168,159,0.2)', background: 'rgba(10,168,159,0.06)', color: '#0AA89F', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {billingLoading ? 'Loading...' : 'Manage Billing'}
                </button>
              </div>

              {/* Cancel & refund — destructive */}
              <div style={{
                borderTop: '1px solid rgba(220,38,38,0.12)',
                paddingTop: 16,
                marginTop: 4,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Cancel subscription
                </div>
                <p style={{ fontSize: 12, color: '#7AAAB2', marginBottom: 10, lineHeight: 1.5 }}>
                  Within 30 days of signup → full refund. After 30 days → cancellation only.
                  Your BellAveGo number will be paused.
                </p>
                <button
                  onClick={openCancelModal}
                  disabled={cancelling}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: '1px solid rgba(220,38,38,0.25)',
                    background: cancelStatus === 'success' ? '#DC2626' : '#FEF2F2',
                    color: cancelStatus === 'success' ? '#fff' : '#DC2626',
                    cursor: cancelling ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {cancelStatus === 'success' ? 'Cancelled' : 'Cancel & request refund'}
                </button>
              </div>
            </>
          ) : (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#DC2626' }}>
              Your subscription has been cancelled. <a href="/pricing" style={{ color: '#DC2626', fontWeight: 700 }}>Resubscribe →</a>
            </div>
          )}
        </div>
      </div>

      {/* ── Cancel + refund modal ───────────────────────────────────
          Replaces the old window.confirm() with a real form that captures a
          structured reason. Reason flows into Stripe metadata + Peter's churn
          SMS so he can spot patterns ("3/5 recent refunds said 'voice sounds
          robotic'") without reading every refund individually. */}
      {cancelModalOpen && (
        <div
          onClick={() => !cancelling && setCancelModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(11,31,58,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 520, background: '#fff',
              borderRadius: 16, boxShadow: '0 24px 60px rgba(7,27,58,0.32)',
              border: '1px solid rgba(10,168,159,0.18)',
              overflow: 'hidden',
            }}
          >
            {cancelStatus === 'success' ? (
              <div style={{ padding: '32px 28px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #22C55E, #16A34A)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(34,197,94,0.42)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0B1F3A', margin: '0 0 8px', letterSpacing: '-0.3px' }}>Refund processed</h3>
                <p style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>{cancelMessage}</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '22px 26px 14px', borderBottom: '1px solid rgba(10,168,159,0.12)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
                    30-day money-back guarantee
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0B1F3A', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                    Sorry to see you go.
                  </h3>
                  <p style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>
                    Help us improve — what didn&apos;t work? Your subscription will be refunded in full and service stays live through the end of this billing cycle.
                  </p>
                </div>
                <div style={{ padding: '20px 26px' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4A7A80', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Reason (required)
                  </label>
                  <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
                    {[
                      { v: 'voice_quality',     l: "The AI didn't sound human enough" },
                      { v: 'not_enough_calls',  l: "Not getting enough calls / leads" },
                      { v: 'forwarding_broken', l: "Couldn't get call forwarding to work" },
                      { v: 'too_expensive',     l: "Too expensive for my business" },
                      { v: 'wrong_fit',         l: "Not the right product fit" },
                      { v: 'found_alternative', l: "Switching to a different service" },
                      { v: 'business_issue',    l: "Business problem unrelated to product" },
                      { v: 'other',             l: "Other" },
                    ].map((o) => {
                      const active = cancelReason === o.v
                      return (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setCancelReason(o.v)}
                          style={{
                            textAlign: 'left',
                            padding: '10px 14px',
                            borderRadius: 9,
                            border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.18)'}`,
                            background: active ? 'rgba(10,168,159,0.08)' : '#F5FDFB',
                            cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 13, fontWeight: 600,
                            color: active ? '#0AA89F' : '#0B1F3A',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {active ? '✓ ' : ''}{o.l}
                        </button>
                      )
                    })}
                  </div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4A7A80', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Anything else? (optional — but really helpful for us)
                  </label>
                  <textarea
                    value={cancelReasonDetail}
                    onChange={(e) => setCancelReasonDetail(e.target.value)}
                    placeholder="e.g. The AI kept asking the same question. Or: my forwarding worked but customers said it sounded robotic. The more specific, the more useful."
                    rows={3}
                    style={{
                      width: '100%',
                      background: '#F5FDFB',
                      border: '1.5px solid rgba(10,168,159,0.2)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      fontSize: 13,
                      color: '#0B1F3A',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                  {cancelStatus === 'error' && cancelMessage && (
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#991B1B' }}>
                      {cancelMessage}
                    </div>
                  )}
                  <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => !cancelling && setCancelModalOpen(false)}
                      disabled={cancelling}
                      style={{
                        padding: '10px 18px', borderRadius: 9,
                        border: '1.5px solid rgba(10,168,159,0.2)',
                        background: '#fff', color: '#4A6670',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Never mind, keep my account
                    </button>
                    <button
                      type="button"
                      onClick={submitCancel}
                      disabled={!cancelReason || cancelling}
                      style={{
                        padding: '10px 18px', borderRadius: 9, border: 'none',
                        background: !cancelReason ? '#CBD5E1' : '#DC2626',
                        color: '#fff', fontSize: 13, fontWeight: 800,
                        cursor: !cancelReason || cancelling ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: !cancelReason ? 'none' : '0 4px 14px rgba(220,38,38,0.32)',
                      }}
                    >
                      {cancelling ? 'Processing…' : 'Cancel & refund'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
