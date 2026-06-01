'use client'
import { useState, useEffect } from 'react'
import { useUser, SignOutButton } from '@clerk/nextjs'
import ReferralWidget from '@/components/ReferralWidget'

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

// 24h → 12h labels for the auto-booking window dropdowns. Hours map directly
// to the smallint stored in profiles.auto_booking_min_hour / _max_hour.
function hour12Label(h: number): string {
  if (h === 0) return '12:00 AM (midnight)'
  if (h === 12) return '12:00 PM (noon)'
  if (h < 12) return `${h}:00 AM`
  return `${h - 12}:00 PM`
}

const TIER_LABELS: Record<string, { label: string; calls: string; price: string }> = {
  // v8 active (May 23 2026)
  receptionist: { label: 'Starter', calls: '60 calls/mo', price: '$147/mo' },
  officemgr:    { label: 'Pro',     calls: '300 calls/mo',    price: '$297/mo' },
  concierge:    { label: 'Elite',   calls: 'Unlimited calls', price: '$597/mo' },
  cancelled:    { label: 'Cancelled', calls: '—', price: '—' },
  // Legacy tier labels — kept for any grandfathered customers still on these
  // plan_tier strings. The label reads "(legacy $X/mo)" so they know what
  // they're on without confusing them about current marketing prices.
  foundation:   { label: 'Foundation (legacy)',         calls: 'Unlimited',       price: '$79/mo or $129/mo' },
  growth:       { label: 'Growth (legacy)',             calls: 'Unlimited',       price: '$179/mo or $279/mo' },
  premium:      { label: 'Premium (legacy)',            calls: 'Unlimited',       price: '$499/mo' },
  multiloc:     { label: 'Multi-location (legacy)',     calls: 'Custom',          price: 'Custom' },
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
  // Auto-booking + review-request opt-ins. Both default OFF after the
  // 2026-05-21 migrations (TCPA safety + explicit consent). Schema lives
  // in sql/2026-05-21-auto-booking-controls.sql + sql/2026-05-21-review-request-opt-in.sql.
  const [autoBookingEnabled, setAutoBookingEnabled] = useState(false)
  const [autoBookingMinHour, setAutoBookingMinHour] = useState<number | null>(null)
  const [autoBookingMaxHour, setAutoBookingMaxHour] = useState<number | null>(null)
  const [reviewRequestEnabled, setReviewRequestEnabled] = useState(false)
  // IANA timezone (e.g. America/Chicago). Authoritative for booking-window
  // enforcement and contractor-facing email render times. Backfilled to
  // America/Chicago by sql/2026-05-22-timezone-default.sql so this is never null.
  const [timezone, setTimezoneState] = useState<string>('America/Chicago')
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
  // Permanent account deletion — irreversible. Separate flow from
  // cancel-subscription so contractors don't conflate "pause billing"
  // with "erase me from the system." Legal-compliance requirement: a
  // visible self-serve delete path that purges Stripe + Twilio + DB +
  // Clerk, all without a support-ticket round-trip.
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [deleteMessage, setDeleteMessage] = useState('')

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const res = await fetch('/api/profile')
    if (!res.ok) return
    const data = await res.json()
    setProfile(data)
    setBusinessName(data?.business_name || '')
    setOwnerPhone(data?.owner_phone || '')
    setCustomPromptNotes(data?.custom_prompt_notes || '')
    // Voice + tone locked to Emma / friendly — we only ship/support that
    // combo right now. Force defaults on load so any legacy non-default
    // value gets normalized on next save.
    setAiTone('friendly')
    setAiVoiceId('156fb8d2-335b-4950-9cb3-a2d33befec77')
    setAiLanguage((data?.ai_language as 'en' | 'es') || 'en')
    setBackupOwnerPhone(data?.backup_owner_phone || '')
    setAutoBookingEnabled(!!data?.auto_booking_enabled)
    setAutoBookingMinHour(typeof data?.auto_booking_min_hour === 'number' ? data.auto_booking_min_hour : null)
    setAutoBookingMaxHour(typeof data?.auto_booking_max_hour === 'number' ? data.auto_booking_max_hour : null)
    setReviewRequestEnabled(!!data?.review_request_enabled)
    setTimezoneState(typeof data?.timezone === 'string' && data.timezone ? data.timezone : 'America/Chicago')
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
        auto_booking_enabled: autoBookingEnabled,
        // When auto-booking is OFF, null out the window so stale values
        // don't surprise a contractor who later flips it back on.
        auto_booking_min_hour: autoBookingEnabled ? autoBookingMinHour : null,
        auto_booking_max_hour: autoBookingEnabled ? autoBookingMaxHour : null,
        review_request_enabled: reviewRequestEnabled,
        timezone,
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

  function openDeleteModal() {
    setDeleteConfirmText('')
    setDeleteReason('')
    setDeleteStatus('idle')
    setDeleteMessage('')
    setDeleteModalOpen(true)
  }

  async function submitDelete() {
    setDeleting(true)
    setDeleteStatus('idle')
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // confirmation is hardcoded — clicking the destructive button IS
        // the confirmation. API still validates the literal so a stray
        // CSRF curl from elsewhere can't trip the delete.
        body: JSON.stringify({ confirmation: 'DELETE', reason: '' }),
      })
      const json = await res.json().catch(() => ({}))
      setDeleting(false)
      if (res.ok) {
        setDeleteStatus('success')
        setDeleteMessage(json.message || 'Account deleted.')
        // Clerk session is dead the moment Clerk user is removed. Give
        // the user 3.5s to read the success copy, then bounce them to
        // a public "we'd love to have you back" page.
        setTimeout(() => { window.location.href = '/goodbye' }, 3500)
      } else {
        setDeleteStatus('error')
        setDeleteMessage(json.error || 'Could not delete — please text Peter at (773) 710-9565 and we\'ll handle it manually.')
      }
    } catch (e) {
      setDeleting(false)
      setDeleteStatus('error')
      setDeleteMessage((e as Error).message || 'Network error — please text Peter at (773) 710-9565.')
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

      {/* Referral program — free month per referred contractor */}
      <ReferralWidget />

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

          {/* Voice — locked to Emma. Backend still supports voice variants
              (kept for future) but UI exposes the one we ship + support so
              customers don't get analysis paralysis or weird voice mismatches. */}
          <div style={{ marginBottom: 18 }}>
            <span style={label}>Receptionist</span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 12,
                border: '1.5px solid rgba(10,168,159,0.25)',
                background: 'linear-gradient(135deg, rgba(10,168,159,0.08) 0%, rgba(255,217,168,0.18) 100%)',
              }}
            >
              <div
                style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0AA89F, #18AFA8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 16, fontWeight: 900,
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(10,168,159,0.32)',
                }}
              >
                E
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A' }}>Emma</div>
                <div style={{ fontSize: 12, color: '#4A7A80', marginTop: 2 }}>
                  Warm, professional, friendly — your AI receptionist
                </div>
              </div>
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

      {/* Automation & customer notifications */}
      <div style={card}>
        <div style={cardHead}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A' }}>Automation & customer notifications</div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'rgba(232,116,43,0.08)', color: '#C84B26',
            border: '1px solid rgba(232,116,43,0.22)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Opt-in
          </span>
        </div>
        <div style={cardBody}>

          {/* Timezone — scopes everything below. Booking-window hours, review-request
              schedule, and emailed call times all render in this zone. Defaults to
              America/Chicago via the SQL backfill so an unset value never surfaces. */}
          <div style={{ marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid rgba(10,168,159,0.10)' }}>
            <span style={label}>Your business timezone</span>
            <p style={{ fontSize: 13, color: '#4A7A80', margin: '0 0 10px', lineHeight: 1.5 }}>
              Sets your wall clock for everything below — the auto-book window, review
              request scheduling, and emailed call times all use this zone.
            </p>
            <select
              style={{ ...input, maxWidth: 360 }}
              value={timezone}
              onChange={(e) => setTimezoneState(e.target.value)}
            >
              <option value="America/New_York">Eastern Time (New York)</option>
              <option value="America/Chicago">Central Time (Chicago)</option>
              <option value="America/Denver">Mountain Time (Denver)</option>
              <option value="America/Phoenix">Mountain Time — no DST (Phoenix)</option>
              <option value="America/Los_Angeles">Pacific Time (Los Angeles)</option>
              <option value="America/Anchorage">Alaska Time (Anchorage)</option>
              <option value="Pacific/Honolulu">Hawaii Time (Honolulu)</option>
            </select>
          </div>

          {/* Auto-booking toggle */}
          <div style={{ marginBottom: 20 }}>
            <span style={label}>Auto-book appointments to your calendar</span>
            <p style={{ fontSize: 13, color: '#4A7A80', margin: '0 0 10px', lineHeight: 1.5 }}>
              When ON, Emma offers real calendar slots and books the job during the call. When OFF,
              Emma only takes a callback message — even if your calendar is connected. Off by default.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { v: true,  l: 'On',  d: 'Emma books slots' },
                { v: false, l: 'Off', d: 'Emma takes messages' },
              ] as const).map((o) => {
                const active = autoBookingEnabled === o.v
                return (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setAutoBookingEnabled(o.v)}
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

            {/* Booking window — only shows when auto-booking is ON. Hours are
                stored 0-23 in the local time zone (handled in the voice route).
                Both null = book any time of day. */}
            {autoBookingEnabled === true && (
              <div style={{
                marginTop: 14,
                padding: '14px 16px',
                background: 'rgba(10,168,159,0.04)',
                border: '1px solid rgba(10,168,159,0.16)',
                borderRadius: 10,
              }}>
                <span style={label}>Booking window (when Emma is allowed to book)</span>
                <p style={{ fontSize: 12, color: '#4A7A80', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Outside this window the AI will only take a callback message — no slots offered.
                  Leave both as &ldquo;No limit&rdquo; to let Emma book 24/7.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <span style={label}>Earliest</span>
                    <select
                      style={input}
                      value={autoBookingMinHour ?? ''}
                      onChange={(e) => setAutoBookingMinHour(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                    >
                      <option value="">No limit (any time)</option>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{hour12Label(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span style={label}>Latest</span>
                    <select
                      style={input}
                      value={autoBookingMaxHour ?? ''}
                      onChange={(e) => setAutoBookingMaxHour(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                    >
                      <option value="">No limit (any time)</option>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{hour12Label(h)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {autoBookingMinHour !== null && autoBookingMaxHour !== null && autoBookingMinHour >= autoBookingMaxHour && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#C84B26', fontWeight: 600 }}>
                    Heads up: Earliest is at or after Latest. Emma won&apos;t book any slots until this is fixed.
                  </div>
                )}
                <div style={{ marginTop: 10, fontSize: 11, color: '#7AAAB2', lineHeight: 1.5 }}>
                  Example: set Earliest to 5:00 PM and leave Latest as &ldquo;No limit&rdquo; if you only want Emma
                  booking after-hours jobs. Earlier calls during the day will still be answered and summarized.
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(10,168,159,0.10)', margin: '4px 0 20px' }} />

          {/* Google review request SMS toggle */}
          <div>
            <span style={label}>Google review request SMS</span>
            <p style={{ fontSize: 13, color: '#4A7A80', margin: '0 0 10px', lineHeight: 1.5 }}>
              ~4 hours after a job is marked completed, text the customer a link asking for a Google review.
              Off by default for TCPA / opt-in safety — turn on only after confirming your customers
              expect post-service messages.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { v: true,  l: 'On',  d: 'Auto-send review SMS' },
                { v: false, l: 'Off', d: 'No review SMS' },
              ] as const).map((o) => {
                const active = reviewRequestEnabled === o.v
                return (
                  <button
                    key={String(o.v)}
                    type="button"
                    onClick={() => setReviewRequestEnabled(o.v)}
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

            </>
          ) : (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px', fontSize: 13, color: '#DC2626' }}>
              Your subscription has been cancelled. <a href="/pricing" style={{ color: '#DC2626', fontWeight: 700 }}>Resubscribe →</a>
            </div>
          )}
        </div>
      </div>

      {/* ──────── DANGER ZONE — Cancel + Delete account ────────
          High-visibility, easy-to-find legal-compliance card. Both
          paths surface clearly: pause billing (cancel) and full erasure
          (delete). Customers must never have to email support to leave. */}
      <div style={{
        ...card,
        border: '2px solid rgba(220,38,38,0.3)',
        background: 'linear-gradient(180deg, #FEF2F2 0%, #FFFFFF 100%)',
      }}>
        <div style={{
          ...cardHead,
          background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
          borderBottom: 'none',
        }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em', textTransform: 'uppercase' }}>
            ⚠️ Danger Zone — Cancel or Delete
          </div>
        </div>
        <div style={{ ...cardBody, padding: '22px 20px' }}>

          {/* ── Cancel subscription ── */}
          <div style={{
            background: '#fff',
            border: '1.5px solid rgba(220,38,38,0.18)',
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0B1F3A', marginBottom: 4 }}>
              I&apos;m not satisfied with BellAveGo — cancel my subscription
            </div>
            <p style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.55, margin: '0 0 12px' }}>
              Cancel during your 7-day free trial → <strong>no charge ever fires.</strong>{' '}
              Cancel after day 8 → stops the next renewal. Service stays live until the end of the current cycle. No refund issued for the current cycle.
            </p>
            <button
              onClick={openCancelModal}
              disabled={cancelling || !profile?.stripe_subscription_id}
              style={{
                fontSize: 14,
                fontWeight: 800,
                padding: '12px 22px',
                borderRadius: 10,
                border: 'none',
                background: cancelStatus === 'success' ? '#16A34A' : '#DC2626',
                color: '#fff',
                cursor: cancelling ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 14px rgba(220,38,38,0.32)',
                width: '100%',
              }}
            >
              {cancelStatus === 'success' ? 'Cancelled ✓' : 'Cancel my subscription'}
            </button>
          </div>

          {/* ── Permanently delete account ── */}
          <div style={{
            background: '#fff',
            border: '1.5px solid rgba(220,38,38,0.18)',
            borderRadius: 12,
            padding: '16px 18px',
          }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0B1F3A', marginBottom: 4 }}>
              Permanently delete my account
            </div>
            <p style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.55, margin: '0 0 12px' }}>
              Erases your account completely: cancels any active subscription, releases your AI receptionist phone number, and deletes your data. <strong>This cannot be undone.</strong> You can sign up again later with the same email — you&apos;ll get a fresh AI receptionist number.
            </p>
            <button
              onClick={openDeleteModal}
              disabled={deleting}
              style={{
                fontSize: 14,
                fontWeight: 800,
                padding: '12px 22px',
                borderRadius: 10,
                border: '2px solid #DC2626',
                background: '#fff',
                color: '#DC2626',
                cursor: deleting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                width: '100%',
              }}
            >
              Permanently delete my account
            </button>
          </div>

          <div style={{
            fontSize: 11,
            color: '#7AAAB2',
            marginTop: 14,
            textAlign: 'center',
            lineHeight: 1.55,
          }}>
            Need help instead? Text Peter directly at{' '}
            <a href="tel:7737109565" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>(773) 710-9565</a>
            {' '}— replies in under 10 minutes during business hours.
          </div>
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
                    Cancel anytime — no refunds after trial
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

      {/* ──────── Delete account modal ────────
          Hard-confirm dialog. Requires typing the literal text DELETE
          so muscle-memory "yes yes yes" clicking can't erase a real
          account. Reason field is optional but captured for churn. */}
      {deleteModalOpen && (
        <div
          onClick={() => !deleting && setDeleteModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(11,31,58,0.62)',
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
              borderRadius: 16, boxShadow: '0 24px 60px rgba(7,27,58,0.4)',
              border: '2px solid rgba(220,38,38,0.35)',
              overflow: 'hidden',
            }}
          >
            {deleteStatus === 'success' ? (
              <div style={{ padding: '32px 28px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #DC2626, #B91C1C)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(220,38,38,0.32)' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" /></svg>
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0B1F3A', margin: '0 0 8px', letterSpacing: '-0.3px' }}>Account deleted</h3>
                <p style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.55, margin: 0 }}>{deleteMessage}</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '22px 26px 14px', background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)', color: '#fff' }}>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6, opacity: 0.9 }}>
                    ⚠️ Permanent — cannot be undone
                  </div>
                  <h3 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                    Delete your BellAveGo account?
                  </h3>
                  <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, opacity: 0.92 }}>
                    This cancels your subscription, releases your AI receptionist number, and erases your data permanently.
                  </p>
                </div>
                <div style={{ padding: '20px 26px' }}>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#991B1B', marginBottom: 6 }}>
                      What gets deleted
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7F1D1D', lineHeight: 1.7 }}>
                      <li>Your Stripe subscription — <strong>cancelled immediately</strong>, no further charges</li>
                      <li>Your AI receptionist phone number — released back to Twilio</li>
                      <li>All your calls, customers, jobs, reports, and settings</li>
                      <li>Your login — you&apos;ll be signed out and the email can sign up fresh</li>
                    </ul>
                  </div>

                  {deleteStatus === 'error' && deleteMessage && (
                    <div style={{ marginTop: 4, marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#991B1B' }}>
                      {deleteMessage}
                    </div>
                  )}

                  <div style={{ marginTop: 4, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setDeleteModalOpen(false)}
                      disabled={deleting}
                      style={{
                        fontSize: 14, fontWeight: 800, padding: '12px 22px', borderRadius: 10,
                        border: '1.5px solid rgba(10,168,159,0.25)', background: '#fff',
                        color: '#0B1F3A', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Keep my account
                    </button>
                    <button
                      onClick={submitDelete}
                      disabled={deleting}
                      style={{
                        fontSize: 14, fontWeight: 800, padding: '12px 22px', borderRadius: 10,
                        border: 'none',
                        background: '#DC2626',
                        color: '#fff',
                        cursor: deleting ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 4px 14px rgba(220,38,38,0.32)',
                      }}
                    >
                      {deleting ? 'Deleting…' : 'Permanently delete'}
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
