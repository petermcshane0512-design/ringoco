'use client'
import { useState, useEffect } from 'react'

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(232,116,43,0.12)',
  borderRadius: 16,
  overflow: 'hidden',
  marginBottom: 16,
  boxShadow: '0 4px 12px rgba(232,116,43,0.06), 0 12px 32px rgba(11,31,58,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#FFFAF3',
  border: '1.5px solid rgba(232,116,43,0.20)',
  borderRadius: 9,
  padding: '11px 14px',
  fontSize: 14,
  color: '#0B1F3A',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
}

// Sample transcript for the live AI call demo card. Cycles through every
// few seconds so the page feels alive even when no real call is happening.
const DEMO_TRANSCRIPT: { who: 'ai' | 'caller'; line: string }[] = [
  { who: 'ai',     line: 'Thanks for calling Smith HVAC. What can we help you with?' },
  { who: 'caller', line: 'Hi, my AC stopped cooling. Kids are home, it’s really hot.' },
  { who: 'ai',     line: 'Got it. Can I grab your name and best callback number?' },
  { who: 'caller', line: 'Sarah Chen — six-one-two, five-five-five, oh-one-four-eight.' },
  { who: 'ai',     line: 'Thanks Sarah. What’s the address we’d come out to?' },
  { who: 'caller', line: '4218 Cedar Lake Road, St. Louis Park.' },
  { who: 'ai',     line: 'Best window today? Morning or afternoon?' },
  { who: 'caller', line: 'Anytime between 2 and 6 would be amazing.' },
  { who: 'ai',     line: 'Done. Mike will text you in a few minutes to confirm.' },
]

export default function ReceptionistPage() {
  const [isActive, setIsActive] = useState(false)
  const [hasPlan, setHasPlan] = useState(false)
  const [step, setStep] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [services, setServices] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [tone, setTone] = useState('friendly')
  const [twilioNumber, setTwilioNumber] = useState('Provisioning...')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [stats, setStats] = useState({ calls: 0, booked: 0, saved: 0, revenue: 0 })
  const [demoIdx, setDemoIdx] = useState(0)
  // ── AI pause feature ──
  // Customer-initiated "I'm answering my own calls today" toggle.
  // Backed by profiles.ai_paused_until column + /api/profile/ai-pause.
  const [aiPausedUntil, setAiPausedUntil] = useState<string | null>(null)
  const [aiPauseMode, setAiPauseMode] = useState<'forward' | 'voicemail' | 'silent'>('forward')
  const [showPauseModal, setShowPauseModal] = useState(false)
  const [pauseSaving, setPauseSaving] = useState(false)
  const isAiPaused = !!aiPausedUntil && new Date(aiPausedUntil).getTime() > Date.now()

  useEffect(() => {
    loadProfile()
    loadStats()
    loadPauseStatus()
  }, [])

  // Cycle the demo transcript so the page always feels alive.
  useEffect(() => {
    const t = setInterval(() => {
      setDemoIdx(i => (i + 1) % DEMO_TRANSCRIPT.length)
    }, 2200)
    return () => clearInterval(t)
  }, [])

  async function loadProfile() {
    try {
      const res = await fetch('/api/profile')
      if (!res.ok) return
      // /api/profile returns the profile row FLAT (not nested under `profile`).
      // Previously `const { profile } = await res.json()` destructured nothing
      // → page silently rendered defaults regardless of real state.
      const profile = await res.json()
      if (!profile || profile.error) return
      setBusinessName(profile.business_name || '')
      setServices(profile.services || '')
      setServiceArea(profile.service_area || '')
      setTone(profile.ai_tone || 'friendly')
      setIsActive(profile.is_active || false)
      // hasPlan = customer has paid checkout (plan_tier set). Used to hide
      // the "Activate AI Receptionist" UI for paying customers even if
      // is_active flag is stale/wrong (e.g. mid-subscription state). Avoids
      // the confusing "Activate" button showing for someone who already paid.
      setHasPlan(!!profile.plan_tier)
      if (profile.twilio_number) {
        const n = profile.twilio_number
        setTwilioNumber(`+1 (${n.slice(2,5)}) ${n.slice(5,8)}-${n.slice(8)}`)
      }
    } catch (e) {
      console.error('Failed to load profile:', e)
    }
  }

  async function loadStats() {
    // Pull the same tenant-scoped summary the Command Center page uses, so
    // these tiles ALWAYS match the dashboard home counts (single source of
    // truth = /api/dashboard/summary). Previously this was hardcoded to 0
    // because the summary endpoint hadn't been wired into this page yet.
    try {
      const res = await fetch('/api/dashboard/summary')
      if (!res.ok) return
      const s = await res.json() as {
        jobs?: Array<{ status?: string; amount?: number; amount_estimated?: number }>
        callsThisWeek?: number
        leadsThisMonth?: number
      }
      const jobs = s.jobs || []
      const booked = jobs.filter((j) => j.status === 'scheduled' || j.status === 'accepted' || j.status === 'completed').length
      const revenue = jobs
        .filter((j) => !['cancelled', 'declined'].includes(j.status || ''))
        .reduce((sum, j) => sum + (j.amount || j.amount_estimated || 0), 0)
      setStats({
        calls: s.callsThisWeek || 0,
        booked,
        saved: s.callsThisWeek || 0,  // every answered call = a save vs voicemail
        revenue,
      })
    } catch (e) {
      console.error('loadStats failed:', e)
    }
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

  async function loadPauseStatus() {
    try {
      const res = await fetch('/api/profile/ai-pause')
      if (!res.ok) return
      const j = await res.json()
      setAiPausedUntil(j.ai_paused_until)
      setAiPauseMode(j.ai_pause_mode || 'forward')
    } catch (e) {
      console.error('loadPauseStatus failed:', e)
    }
  }

  async function applyPause(untilIso: string | null, mode: 'forward' | 'voicemail' | 'silent', reason?: string) {
    setPauseSaving(true)
    try {
      const res = await fetch('/api/profile/ai-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused_until: untilIso, mode, reason: reason ?? null }),
      })
      if (!res.ok) throw new Error('save failed')
      const j = await res.json()
      setAiPausedUntil(j.ai_paused_until)
      setAiPauseMode(j.ai_pause_mode)
      setShowPauseModal(false)
    } catch (e) {
      console.error('applyPause failed:', e)
      alert('Could not save. Try again or refresh.')
    } finally {
      setPauseSaving(false)
    }
  }

  function pauseFor(hours: number, mode: 'forward' | 'voicemail' | 'silent' = 'forward') {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    return applyPause(until, mode)
  }
  function pauseIndefinitely(mode: 'forward' | 'voicemail' | 'silent' = 'forward') {
    // Year 9999 = effectively forever; user can resume any time.
    const until = '9999-12-31T23:59:59.000Z'
    return applyPause(until, mode)
  }
  function resumeNow() {
    return applyPause(null, aiPauseMode)
  }

  function formatPauseUntil(iso: string): string {
    const d = new Date(iso)
    if (d.getFullYear() >= 9000) return 'until you resume'
    const now = new Date()
    const diffMin = Math.round((d.getTime() - now.getTime()) / 60000)
    if (diffMin < 60) return `for ${diffMin} more min`
    if (diffMin < 24 * 60) return `until ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    return `until ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
  }

  const rawNumber = twilioNumber.replace(/\D/g, '')
  const callForwardCode = rawNumber.length === 11 ? `*61*+${rawNumber.slice(1)}*11*15#` : ''

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 32px 60px' }}>

      {/* HEADER */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.04em' }}>
            AI <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Receptionist</span>
          </h1>
          {isActive && <span className="mc-status-pill"><span className="mc-live-dot" /> Live</span>}
        </div>
        <p style={{ color: '#4A6670', fontSize: 14, margin: '6px 0 0' }}>
          Never miss another job. Your AI answers, books, and follows up automatically.
        </p>
      </div>

      {/* LIVE CALL DEMO + STATUS — the brain of the page */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, marginBottom: 22 }} className="recep-grid">
        <style>{`@media (max-width:880px){.recep-grid{grid-template-columns:1fr!important}}`}</style>

        {/* LIVE CALL CARD */}
        <div className="mc-card mc-card-orange" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(232,116,43,0.14)', background: 'linear-gradient(135deg, #FFFFFF 0%, #FFF7EE 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mc-status-pill"><span className="mc-live-dot" /> Sample call</span>
              <span style={{ fontSize: 11, color: '#7AAAB2' }}>This is what your customers hear.</span>
            </div>
            <div className="mc-wave" style={{ height: 20 }}>
              <span /><span /><span /><span /><span /><span /><span />
            </div>
          </div>
          <div style={{ padding: '18px 22px', minHeight: 200, maxHeight: 260, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {DEMO_TRANSCRIPT.slice(Math.max(0, demoIdx - 3), demoIdx + 1).map((line, i, arr) => {
              const isActiveLine = i === arr.length - 1
              return (
                <div key={`${demoIdx}-${i}`} className="mc-slide-up" style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  opacity: isActiveLine ? 1 : 0.45,
                  transition: 'opacity 0.4s',
                }}>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 6, marginTop: 2,
                    background: line.who === 'ai' ? 'rgba(232,116,43,0.10)' : '#F1F5F9',
                    color: line.who === 'ai' ? '#C84B26' : '#4A6670',
                    border: line.who === 'ai' ? '1px solid rgba(232,116,43,0.28)' : '1px solid #E2E8F0',
                  }}>{line.who === 'ai' ? 'AI' : 'Caller'}</span>
                  <span style={{ fontSize: 13.5, lineHeight: 1.55, color: isActiveLine ? '#0B1F3A' : '#4A6670' }}>
                    {line.line}
                  </span>
                </div>
              )
            })}
          </div>
          <a
            href={twilioNumber !== 'Provisioning...' ? `tel:${twilioNumber.replace(/\D/g, '')}` : '#'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '14px 22px', borderTop: '1px solid rgba(232,116,43,0.14)',
              background: 'linear-gradient(90deg, #FFD9A8 0%, #FF9D5A 60%, #E8742B 100%)',
              color: '#0B1F3A', textDecoration: 'none', fontWeight: 800, fontSize: 13,
            }}
          >
            <span>📞 Call your AI right now — hear it live</span>
            <span style={{ letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>{twilioNumber}</span>
          </a>
        </div>

        {/* STATUS PANEL — collapses to a confirmation pill for paying customers.
            Only shows the "Activate" button for users WITHOUT a paid plan_tier
            (i.e. they signed up but never checked out). Eliminates the confusing
            "Activate AI Receptionist" CTA that previously rendered for users
            who'd already paid + were live. */}
        <div className={`mc-card ${isAiPaused ? '' : isActive || hasPlan ? 'mc-card-teal' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 16, borderColor: isAiPaused ? '#F59E0B' : undefined }}>
          <div>
            <div className="mc-eyebrow" style={{ color: isAiPaused ? '#92400E' : isActive || hasPlan ? '#15803D' : '#C84B26' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isAiPaused ? '#F59E0B' : isActive || hasPlan ? '#22C55E' : '#FF9D5A', boxShadow: isAiPaused ? '0 0 8px rgba(245,158,11,0.6)' : isActive || hasPlan ? '0 0 8px rgba(34,197,94,0.6)' : '0 0 8px rgba(232,116,43,0.6)' }} />
              {isAiPaused ? 'AI Paused' : (isActive || hasPlan ? 'AI Active' : 'AI Inactive')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.4px', marginBottom: 6 }}>
              {isAiPaused
                ? (aiPauseMode === 'forward' ? 'Routing calls to your cell' : aiPauseMode === 'voicemail' ? 'Voicemail only' : 'Calls silenced')
                : (isActive || hasPlan ? 'Answering every call' : 'Setup needed')}
            </div>
            <div style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.5 }}>
              {isAiPaused
                ? `Paused ${formatPauseUntil(aiPausedUntil!)}. ${aiPauseMode === 'forward' ? 'Incoming calls go straight to your cell — AI never picks up until you resume.' : aiPauseMode === 'voicemail' ? 'Callers hear a brief greeting then leave a voicemail you can text back later.' : 'Calls disconnect silently. Use with caution.'}`
                : (isActive || hasPlan ? 'Calls route through your BellAveGo number. Booked jobs land in your dashboard, your phone, and your CRM.' : 'Forward your business cell to the BellAveGo number, then activate.')}
            </div>
          </div>

          {/* PAUSE / RESUME — visible whenever AI is set up (hasPlan or isActive). */}
          {(isActive || hasPlan) && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {isAiPaused ? (
                <button
                  onClick={resumeNow}
                  disabled={pauseSaving}
                  className="mc-btn-teal"
                  style={{ flex: 1, minWidth: 180, padding: '12px 18px', fontWeight: 800, fontSize: 14, borderRadius: 10, cursor: 'pointer' }}
                >
                  ▶ Resume AI now
                </button>
              ) : (
                <button
                  onClick={() => setShowPauseModal(true)}
                  disabled={pauseSaving}
                  className="mc-btn-ghost"
                  style={{ flex: 1, minWidth: 180, padding: '12px 18px', fontWeight: 800, fontSize: 14, borderRadius: 10, cursor: 'pointer', border: '1.5px solid rgba(245,158,11,0.40)', background: 'rgba(245,158,11,0.06)', color: '#92400E' }}
                >
                  ⏸ Pause AI Receptionist
                </button>
              )}
            </div>
          )}
          {!hasPlan && (
            <button
              onClick={handleToggleActive}
              className={isActive ? 'mc-btn-ghost' : 'mc-btn-orange'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isActive ? 'Deactivate AI' : 'Activate AI Receptionist →'}
            </button>
          )}
        </div>
      </div>

      {/* STATS — big bold numbers, sunset accents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Calls Answered',      value: String(stats.calls),  sub: 'Answered automatically by AI', accent: 'teal' },
          { label: 'Jobs Booked',         value: String(stats.booked), sub: 'Converted from incoming calls', accent: 'teal' },
          { label: 'Missed Calls Saved',  value: String(stats.saved),  sub: 'Would have gone to voicemail', accent: 'teal' },
          { label: 'Revenue Recovered',   value: `$${stats.revenue.toLocaleString()}`, sub: 'Estimated from booked jobs',    accent: 'orange' },
        ].map(s => (
          <div key={s.label} className={`mc-card ${s.accent === 'orange' ? 'mc-card-orange' : 'mc-card-teal'}`} style={{ padding: '20px 22px' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: s.accent === 'orange' ? '#C84B26' : '#0AA89F', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              {s.label}
            </span>
            <p className={`mc-stat-num ${s.accent === 'orange' ? 'mc-stat-num-money' : 'mc-stat-num-teal'}`} style={{ margin: '12px 0 0', fontSize: 'clamp(28px, 3vw, 38px)' }}>{s.value}</p>
            <p style={{ fontSize: 11.5, color: '#4A6670', margin: '8px 0 0', lineHeight: 1.5, fontWeight: 500 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ACTIVATION FLOW — only for users WITHOUT a paid plan_tier. Paying
          customers (hasPlan) already went through checkout + onboarding;
          they don't need the 3-step walkthrough hovering on every visit. */}
      {!isActive && !hasPlan && (
        <div style={{ ...card, padding: '28px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 20, letterSpacing: '-0.2px' }}>Get started in 3 steps</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Step 1 */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: step >= 1 ? '#0AA89F' : 'rgba(10,168,159,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: step >= 1 ? '#fff' : '#7AAAB2', fontSize: 14, fontWeight: 700 }}>1</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: 15, color: '#0B1F3A', margin: '0 0 4px' }}>Your AI phone number</p>
                <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 12px' }}>This is the number BellAveGo uses to answer your calls.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(5,14,31,0.55)', borderRadius: 10, padding: '14px 18px', border: '1px solid rgba(94,234,212,0.22)' }}>
                  <span style={{ fontSize: 20 }}>📞</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#5EEAD4', letterSpacing: 1 }}>{twilioNumber}</span>
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
                <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 12px' }}>Set up call forwarding so BellAveGo answers when you can&apos;t.</p>
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
                <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 12px' }}>Click Activate above and BellAveGo will start answering every call.</p>
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

      {/* AI BEHAVIOR SETTINGS */}
      <div style={{ ...card, padding: '28px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 6, letterSpacing: '-0.2px' }}>AI Behavior Settings</h2>
        <p style={{ fontSize: 13, color: '#4A6670', marginBottom: 24 }}>Tune how your AI speaks to customers.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#C84B26', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Business name</label>
            <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Mike's HVAC" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#C84B26', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Service area</label>
            <input value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. Chicago, IL" style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#C84B26', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Services offered</label>
          <input value={services} onChange={e => setServices(e.target.value)} placeholder="e.g. AC repair, furnace install, HVAC maintenance" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#C84B26', display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI tone</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { value: 'friendly', label: '😊 Friendly', desc: 'Warm and conversational' },
              { value: 'professional', label: '💼 Professional', desc: 'Formal and precise' },
              { value: 'fast', label: '⚡ Fast', desc: 'Quick and to the point' },
            ].map(t => (
              <button key={t.value} onClick={() => setTone(t.value)} style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: tone === t.value ? '2px solid #E8742B' : '1.5px solid rgba(232,116,43,0.18)', background: tone === t.value ? 'linear-gradient(135deg, #FFFFFF, #FFF7EE)' : '#FFFAF3', cursor: 'pointer', textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: tone === t.value ? '#C84B26' : '#0B1F3A', margin: '0 0 2px' }}>{t.label}</p>
                <p style={{ fontSize: 12, color: '#4A6670', margin: 0 }}>{t.desc}</p>
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

      {/* ── PAUSE MODAL ── User-controlled AI pause. */}
      {showPauseModal && (
        <div
          onClick={() => !pauseSaving && setShowPauseModal(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(11,31,58,0.55)', zIndex: 100,
            display: 'grid', placeItems: 'center', padding: 16,
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 18, padding: 32, maxWidth: 520, width: '100%',
              boxShadow: '0 32px 80px rgba(11,31,58,0.24)', border: '1px solid rgba(245,158,11,0.20)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 22 }}>⏸</span>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.3px' }}>Pause AI Receptionist</h3>
            </div>
            <p style={{ fontSize: 13.5, color: '#4A6670', lineHeight: 1.55, margin: '0 0 22px' }}>
              The AI stops answering. Calls go to your cell (or voicemail) until you resume.
            </p>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#92400E', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>How long?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => pauseFor(1)}
                  disabled={pauseSaving}
                  style={pauseOptionBtn}
                >
                  <span style={{ fontSize: 16, fontWeight: 800 }}>1 hour</span>
                  <span style={{ fontSize: 11.5, color: '#4A6670' }}>Auto-resumes</span>
                </button>
                <button
                  onClick={() => pauseFor(4)}
                  disabled={pauseSaving}
                  style={pauseOptionBtn}
                >
                  <span style={{ fontSize: 16, fontWeight: 800 }}>4 hours</span>
                  <span style={{ fontSize: 11.5, color: '#4A6670' }}>Half-day break</span>
                </button>
                <button
                  onClick={() => {
                    // Until tomorrow 7 AM local
                    const t = new Date()
                    t.setDate(t.getDate() + 1)
                    t.setHours(7, 0, 0, 0)
                    return applyPause(t.toISOString(), aiPauseMode)
                  }}
                  disabled={pauseSaving}
                  style={pauseOptionBtn}
                >
                  <span style={{ fontSize: 16, fontWeight: 800 }}>Until tomorrow 7 AM</span>
                  <span style={{ fontSize: 11.5, color: '#4A6670' }}>Take the day off</span>
                </button>
                <button
                  onClick={() => pauseIndefinitely()}
                  disabled={pauseSaving}
                  style={{ ...pauseOptionBtn, borderColor: 'rgba(220,38,38,0.40)', background: 'rgba(220,38,38,0.04)' }}
                >
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#991B1B' }}>Until I resume</span>
                  <span style={{ fontSize: 11.5, color: '#4A6670' }}>Indefinite pause</span>
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#92400E', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>When paused, callers should:</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { value: 'forward' as const, label: '📲 Ring my cell', desc: 'Forward to your business cell' },
                  { value: 'voicemail' as const, label: '📩 Leave voicemail', desc: 'No ring — just record' },
                  { value: 'silent' as const, label: '🔇 Hang up', desc: 'Silent — use rarely' },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAiPauseMode(opt.value)}
                    disabled={pauseSaving}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 9,
                      border: aiPauseMode === opt.value ? '2px solid #E8742B' : '1.5px solid rgba(232,116,43,0.18)',
                      background: aiPauseMode === opt.value ? 'linear-gradient(135deg, #FFFFFF, #FFF7EE)' : '#FFFAF3',
                      cursor: pauseSaving ? 'not-allowed' : 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: aiPauseMode === opt.value ? '#C84B26' : '#0B1F3A', marginBottom: 2 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#4A6670', lineHeight: 1.35 }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPauseModal(false)}
                disabled={pauseSaving}
                style={{
                  padding: '11px 22px', borderRadius: 9, border: '1.5px solid rgba(11,31,58,0.18)',
                  background: '#fff', color: '#0B1F3A', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

            {pauseSaving && (
              <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#7AAAB2' }}>Saving…</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const pauseOptionBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  padding: '14px 16px', borderRadius: 10,
  border: '1.5px solid rgba(245,158,11,0.30)', background: 'rgba(245,158,11,0.04)',
  color: '#0B1F3A', cursor: 'pointer', textAlign: 'left',
}
