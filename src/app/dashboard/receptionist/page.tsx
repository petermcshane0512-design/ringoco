'use client'
import { useState } from 'react'

const demoCalls = [
  { name: 'John D.', phone: '+1 (312) 555-0142', service: 'Plumbing quote', outcome: 'Booked', time: '2 min ago', color: '#22C55E' },
  { name: 'Sarah M.', phone: '+1 (773) 555-0198', service: 'AC repair', outcome: 'Booked', time: '1 hr ago', color: '#22C55E' },
  { name: 'Unknown', phone: '+1 (847) 555-0321', service: 'General inquiry', outcome: 'Follow-up', time: '3 hrs ago', color: '#F59E0B' },
]

export default function ReceptionistPage() {
  const [isActive, setIsActive] = useState(false)
  const [step, setStep] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [services, setServices] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [tone, setTone] = useState('friendly')

  const aiNumber = '+1 (762) 371-3351'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>AI Receptionist</h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>Never miss another job. Your AI answers, books, and follows up automatically.</p>
      </div>

      {/* STATUS BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isActive ? '#F0FDF4' : '#FFF7ED', border: `1px solid ${isActive ? '#BBF7D0' : '#FED7AA'}`, borderRadius: 14, padding: '16px 24px', marginBottom: 24, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: isActive ? '#22C55E' : '#F97316', boxShadow: isActive ? '0 0 0 4px rgba(34,197,94,0.2)' : '0 0 0 4px rgba(249,115,22,0.2)' }} />
          <div>
            <p style={{ fontWeight: 700, fontSize: 15, color: isActive ? '#15803D' : '#C2410C', margin: 0 }}>
              AI Receptionist: {isActive ? 'ACTIVE' : 'NOT ACTIVE'}
            </p>
            <p style={{ fontSize: 12, color: isActive ? '#16A34A' : '#EA580C', margin: 0 }}>
              {isActive ? 'Answering calls and booking jobs automatically' : 'Complete setup below to start answering calls'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsActive(!isActive)}
          style={{ padding: '10px 20px', background: isActive ? '#DC2626' : '#22C55E', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
        >
          {isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      {/* STATS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Calls Answered', value: '0', sub: 'Answered automatically by AI', icon: '📞' },
          { label: 'Jobs Booked', value: '0', sub: 'Converted from incoming calls', icon: '📅' },
          { label: 'Missed Calls Saved', value: '0', sub: 'Would have gone to voicemail', icon: '🛡️' },
          { label: 'Revenue Generated', value: '$0', sub: 'Estimated from booked jobs', icon: '💰' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '20px 18px' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', margin: '0 0 4px' }}>{s.value}</p>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ fontSize: 11, color: '#94A3B8', margin: 0, lineHeight: 1.4 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ACTIVATION FLOW */}
      {!isActive && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px', marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20 }}>Get started in 3 steps</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 1 ? '#2563EB' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 1 ? '#fff' : '#94A3B8', fontSize: 14, fontWeight: 700 }}>1</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: '0 0 4px' }}>Your AI phone number</p>
                <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 12px' }}>This is the number BellAveGo uses to answer your calls.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F8FAFC', borderRadius: 10, padding: '14px 18px', border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: 20 }}>📞</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', letterSpacing: 1 }}>{aiNumber}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(aiNumber); setStep(Math.max(step, 2)) }}
                    style={{ marginLeft: 'auto', padding: '6px 14px', background: '#2563EB', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div style={{ width: 1, height: 20, background: '#E2E8F0', marginLeft: 16 }} />

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 2 ? '#2563EB' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 2 ? '#fff' : '#94A3B8', fontSize: 14, fontWeight: 700 }}>2</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: '0 0 4px' }}>Forward your calls</p>
                <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 12px' }}>Set up call forwarding so BellAveGo answers when you can&apos;t.</p>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', margin: '0 0 8px' }}>📱 iPhone</p>
                  <p style={{ fontFamily: 'monospace', fontSize: 13, color: '#2563EB', background: '#EFF6FF', padding: '8px 12px', borderRadius: 6, margin: '0 0 12px' }}>
                    *61*+17623713351*11*15#
                  </p>
                  <p style={{ fontWeight: 600, fontSize: 13, color: '#0F172A', margin: '0 0 8px' }}>🤖 Android</p>
                  <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Settings → Phone → Call Forwarding → Forward when unanswered → enter {aiNumber} → set to 15 seconds</p>
                </div>
                <button
                  onClick={() => setStep(Math.max(step, 3))}
                  style={{ marginTop: 12, padding: '8px 18px', background: step >= 2 ? '#2563EB' : '#E2E8F0', border: 'none', borderRadius: 8, color: step >= 2 ? '#fff' : '#94A3B8', fontSize: 13, fontWeight: 700, cursor: step >= 2 ? 'pointer' : 'default' }}
                >
                  I&apos;ve set up forwarding →
                </button>
              </div>
            </div>

            <div style={{ width: 1, height: 20, background: '#E2E8F0', marginLeft: 16 }} />

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 3 ? '#22C55E' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 3 ? '#fff' : '#94A3B8', fontSize: 14, fontWeight: 700 }}>3</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: '0 0 4px' }}>You&apos;re ready to go live</p>
                <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 12px' }}>Click Activate above and BellAveGo will start answering every call.</p>
                {step >= 3 && (
                  <button
                    onClick={() => setIsActive(true)}
                    style={{ padding: '12px 24px', background: '#22C55E', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 14px rgba(34,197,94,0.3)' }}
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
      <div style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #1e3a6e 100%)', borderRadius: 16, padding: '28px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 16, color: '#fff', margin: '0 0 6px' }}>🎙️ Test your AI right now</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>See exactly how your customers experience your business</p>
        </div>
        <a href="tel:+17623713351" style={{ padding: '12px 24px', background: '#22C55E', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>
          📞 Call AI Demo
        </a>
      </div>

      {/* AI BEHAVIOR SETTINGS */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>AI Behavior Settings</h2>
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 24 }}>This controls how your AI speaks to customers.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 6 }}>Business name</label>
            <input
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. Mike's HVAC"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 6 }}>Service area</label>
            <input
              value={serviceArea}
              onChange={e => setServiceArea(e.target.value)}
              placeholder="e.g. Chicago, IL"
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 6 }}>Services offered</label>
          <input
            value={services}
            onChange={e => setServices(e.target.value)}
            placeholder="e.g. AC repair, furnace install, HVAC maintenance"
            style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, color: '#0F172A', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 10 }}>AI tone</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: 'friendly', label: '😊 Friendly', desc: 'Warm and conversational' },
              { value: 'professional', label: '💼 Professional', desc: 'Formal and precise' },
              { value: 'fast', label: '⚡ Fast', desc: 'Quick and to the point' },
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: tone === t.value ? '2px solid #2563EB' : '1.5px solid #E2E8F0', background: tone === t.value ? '#EFF6FF' : '#fff', cursor: 'pointer', textAlign: 'left' }}
              >
                <p style={{ fontSize: 14, fontWeight: 700, color: tone === t.value ? '#2563EB' : '#0F172A', margin: '0 0 2px' }}>{t.label}</p>
                <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{t.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RECENT CALLS */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>Recent Calls</h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>When your first call comes in, it will appear here instantly.</p>
          </div>
        </div>

        {/* Demo rows */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden', opacity: 0.5 }}>
          <div style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 16 }}>
            {['Caller', 'Service', 'Outcome', 'Time'].map(h => (
              <span key={h} style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
            ))}
          </div>
          {demoCalls.map((call, i) => (
            <div key={i} style={{ padding: '14px 16px', borderBottom: i < demoCalls.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', margin: '0 0 2px' }}>{call.name}</p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{call.phone}</p>
              </div>
              <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>{call.service}</p>
              <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: call.color === '#22C55E' ? '#F0FDF4' : '#FFFBEB', color: call.color }}>
                {call.outcome}
              </span>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{call.time}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: '#CBD5E1', textAlign: 'center', marginTop: 12 }}>↑ Sample data shown — your real calls will appear here</p>
      </div>

      {/* ADVANCED SETTINGS */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, marginBottom: 40, overflow: 'hidden' }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ width: '100%', padding: '18px 28px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: '#64748B' }}>⚙️ Advanced Settings</span>
          <span style={{ color: '#94A3B8', fontSize: 12 }}>{showAdvanced ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showAdvanced && (
          <div style={{ padding: '0 28px 28px', borderTop: '1px solid #F1F5F9' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 8, marginTop: 20 }}>Webhook URL</p>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#475569' }}>
              https://bellavego.com/api/twilio/voice
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>Use this URL in your Twilio console under Voice webhook settings.</p>
          </div>
        )}
      </div>

    </div>
  )
}