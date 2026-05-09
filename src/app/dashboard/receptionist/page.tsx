'use client'
import { useState, useEffect } from 'react'

const card: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid rgba(10,168,159,0.14)',
  borderRadius: 14,
  overflow: 'hidden',
  marginBottom: 16,
  boxShadow: '0 2px 16px rgba(7,27,58,0.06)',
}

const inputStyle: React.CSSProperties = {
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

export default function ReceptionistPage() {
  const [isActive, setIsActive] = useState(false)
  const [step, setStep] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [services, setServices] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [tone, setTone] = useState('friendly')
  const [twilioNumber, setTwilioNumber] = useState('Provisioning...')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [stats, setStats] = useState({ calls: 0, booked: 0, saved: 0 })
  const [recentCalls, setRecentCalls] = useState<any[]>([])

  useEffect(() => {
    loadProfile()
    loadStats()
  }, [])

  async function loadProfile() {
    try {
      const res = await fetch('/api/profile')
      if (!res.ok) return
      const { profile } = await res.json()
      if (!profile) return
      setBusinessName(profile.business_name || '')
      setServices(profile.services || '')
      setServiceArea(profile.service_area || '')
      setTone(profile.ai_tone || 'friendly')
      setIsActive(profile.is_active || false)
      if (profile.twilio_number) {
        const n = profile.twilio_number
        setTwilioNumber(`+1 (${n.slice(2,5)}) ${n.slice(5,8)}-${n.slice(8)}`)
      }
    } catch (e) {
      console.error('Failed to load profile:', e)
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/profile')
      if (!res.ok) return
      // Stats will be populated from call_logs once migration runs
      // For now show 0s — they'll update automatically once calls come in
    } catch (e) {}
  }

  async function handleSave() {
    setSaving(true)
    setSaveStatus('idle')
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          services,
          service_area: serviceArea,
          ai_tone: tone,
          is_active: isActive,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    const newState = !isActive
    setIsActive(newState)
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newState }),
    })
  }

  const rawNumber = twilioNumber.replace(/\D/g, '')
  const callForwardCode = rawNumber.length === 11 ? `*61*+${rawNumber.slice(1)}*11*15#` : ''

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 28px 60px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0B1F3A', marginBottom: 4 }}>AI Receptionist</h1>
        <p style={{ color: '#4A7A80', fontSize: 14, margin: 0 }}>Never miss another job. Your AI answers, books, and follows up automatically.</p>
      </div>

      {/* STATUS BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isActive ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${isActive ? '#BBF7D0' : '#FDE68A'}`, borderRadius: 14, padding: '16px 24px', marginBottom: 24, marginTop: 24, boxShadow: '0 2px 12px rgba(7,27,58,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: isActive ? '#22C55E' : '#F59E0B', boxShadow: isActive ? '0 0 0 4px rgba(34,197,94,0.2)' : '0 0 0 4px rgba(245,158,11,0.2)' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: isActive ? '#15803D' : '#92400E', margin: 0 }}>
              AI Receptionist: {isActive ? 'ACTIVE' : 'NOT ACTIVE'}
            </p>
            <p style={{ fontSize: 12, color: isActive ? '#16A34A' : '#B45309', margin: 0 }}>
              {isActive ? 'Answering calls and booking jobs automatically' : 'Complete setup below to start answering calls'}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggleActive}
          style={{ padding: '10px 20px', background: isActive ? '#DC2626' : 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: isActive ? '0 2px 8px rgba(220,38,38,0.25)' : '0 4px 14px rgba(34,197,94,0.3)' }}
        >
          {isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Calls Answered', value: String(stats.calls), sub: 'Answered automatically by AI', icon: '📞' },
          { label: 'Jobs Booked', value: String(stats.booked), sub: 'Converted from incoming calls', icon: '📅' },
          { label: 'Missed Calls Saved', value: String(stats.saved), sub: 'Would have gone to voicemail', icon: '🛡️' },
          { label: 'Revenue Generated', value: '$0', sub: 'Estimated from booked jobs', icon: '💰' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 14, padding: '20px 18px', boxShadow: '0 2px 16px rgba(7,27,58,0.06)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#0B1F3A', margin: '0 0 4px' }}>{s.value}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1F3A', margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ fontSize: 11, color: '#7AAAB2', margin: 0, lineHeight: 1.4 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ACTIVATION FLOW */}
      {!isActive && (
        <div style={{ ...card, padding: '28px' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3A', marginBottom: 20 }}>Get started in 3 steps</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 1 ? '#0AA89F' : 'rgba(10,168,159,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 1 ? '#fff' : '#7AAAB2', fontSize: 14, fontWeight: 700 }}>1</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3A', margin: '0 0 4px' }}>Your AI phone number</p>
                <p style={{ fontSize: 13, color: '#4A7A80', margin: '0 0 12px' }}>This is the number BellAveGo uses to answer your calls.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F5FDFB', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(10,168,159,0.18)' }}>
                  <span style={{ fontSize: 20 }}>📞</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0AA89F', letterSpacing: 1 }}>{twilioNumber}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(twilioNumber); setStep(Math.max(step, 2)) }}
                    style={{ marginLeft: 'auto', padding: '6px 14px', background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(10,168,159,0.2)', marginLeft: 16 }} />

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 2 ? '#0AA89F' : 'rgba(10,168,159,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 2 ? '#fff' : '#7AAAB2', fontSize: 14, fontWeight: 700 }}>2</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3A', margin: '0 0 4px' }}>Forward your calls</p>
                <p style={{ fontSize: 13, color: '#4A7A80', margin: '0 0 12px' }}>Set up call forwarding so BellAveGo answers when you can&apos;t.</p>
                <div style={{ background: '#F5FDFB', borderRadius: 10, padding: '16px 18px', border: '1px solid rgba(10,168,159,0.18)' }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3A', margin: '0 0 8px' }}>📱 iPhone — dial this code</p>
                  {callForwardCode && (
                    <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#0AA89F', background: 'rgba(10,168,159,0.08)', padding: '8px 12px', borderRadius: 6, margin: '0 0 12px', border: '1px solid rgba(10,168,159,0.14)' }}>
                      {callForwardCode}
                    </p>
                  )}
                  <p style={{ fontWeight: 600, fontSize: 13, color: '#0B1F3A', margin: '0 0 8px' }}>🤖 Android</p>
                  <p style={{ fontSize: 13, color: '#4A7A80', margin: 0 }}>Settings → Phone → Call Forwarding → Forward when unanswered → enter {twilioNumber} → set to 15 seconds</p>
                </div>
                <button
                  onClick={() => setStep(Math.max(step, 3))}
                  style={{ marginTop: 12, padding: '8px 18px', background: step >= 2 ? 'linear-gradient(135deg, #0AA89F, #0D8F87)' : 'rgba(10,168,159,0.1)', border: 'none', borderRadius: 8, color: step >= 2 ? '#fff' : '#7AAAB2', fontSize: 13, fontWeight: 700, cursor: step >= 2 ? 'pointer' : 'default' }}
                >
                  I&apos;ve set up forwarding →
                </button>
              </div>
            </div>

            <div style={{ width: 1, height: 20, background: 'rgba(10,168,159,0.2)', marginLeft: 16 }} />

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 3 ? '#22C55E' : 'rgba(10,168,159,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 3 ? '#fff' : '#7AAAB2', fontSize: 14, fontWeight: 700 }}>3</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3A', margin: '0 0 4px' }}>You&apos;re ready to go live</p>
                <p style={{ fontSize: 13, color: '#4A7A80', margin: '0 0 12px' }}>Click Activate above and BellAveGo will start answering every call.</p>
                {step >= 3 && (
                  <button
                    onClick={handleToggleActive}
                    style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}
                  >
                    🚀 Activate AI Receptionist
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEST YOUR AI */}
      <div style={{ background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 14, padding: '24px 28px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(10,168,159,0.25)' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#fff', margin: '0 0 6px' }}>🎙️ Test your AI right now</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', margin: 0 }}>See exactly how your customers experience your business</p>
        </div>
        <a href={`tel:${twilioNumber.replace(/\D/g, '')}`} style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.35)', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', backdropFilter: 'blur(8px)' }}>
          📞 Call AI Demo
        </a>
      </div>

      {/* AI BEHAVIOR SETTINGS */}
      <div style={{ ...card, padding: '28px' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0B1F3A', marginBottom: 4 }}>AI Behavior Settings</h2>
        <p style={{ fontSize: 13, color: '#4A7A80', marginBottom: 24 }}>This controls how your AI speaks to customers.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#7AAAB2', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Business name</label>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Mike's HVAC" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#7AAAB2', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Service area</label>
            <input value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. Chicago, IL" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#7AAAB2', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Services offered</label>
          <input value={services} onChange={e => setServices(e.target.value)} placeholder="e.g. AC repair, furnace install, HVAC maintenance" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#7AAAB2', display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI tone</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: 'friendly', label: '😊 Friendly', desc: 'Warm and conversational' },
              { value: 'professional', label: '💼 Professional', desc: 'Formal and precise' },
              { value: 'fast', label: '⚡ Fast', desc: 'Quick and to the point' },
            ].map(t => (
              <button key={t.value} onClick={() => setTone(t.value)} style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: tone === t.value ? '2px solid #0AA89F' : '1.5px solid rgba(10,168,159,0.18)', background: tone === t.value ? 'rgba(10,168,159,0.08)' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: tone === t.value ? '#0AA89F' : '#0B1F3A', margin: '0 0 2px' }}>{t.label}</p>
                <p style={{ fontSize: 12, color: '#7AAAB2', margin: 0 }}>{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '11px 28px', background: saveStatus === 'saved' ? '#22C55E' : 'linear-gradient(135deg, #0AA89F, #0D8F87)', border: 'none', borderRadius: 9, color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, boxShadow: '0 4px 14px rgba(10,168,159,0.25)' }}
        >
          {saving ? 'Saving...' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error — try again' : 'Save Settings'}
        </button>
      </div>

      {/* ADVANCED SETTINGS */}
      <div style={{ ...card, marginBottom: 40 }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ width: '100%', padding: '18px 28px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#4A7A80' }}>⚙️ Advanced Settings</span>
          <span style={{ color: '#7AAAB2', fontSize: 12 }}>{showAdvanced ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showAdvanced && (
          <div style={{ padding: '0 28px 28px', borderTop: '1px solid rgba(10,168,159,0.1)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7AAAB2', marginBottom: 8, marginTop: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your AI phone number</p>
            <div style={{ background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: 14, color: '#0AA89F', marginBottom: 16 }}>
              {twilioNumber}
            </div>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#7AAAB2', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Webhook URL</p>
            <div style={{ background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#0AA89F' }}>
              https://bellavego.com/api/twilio/voice
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
