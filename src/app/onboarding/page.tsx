'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

const BUSINESS_TYPES = [
  'HVAC', 'Plumbing', 'Electrical', 'Cleaning', 'Landscaping',
  'Handyman', 'Roofing', 'Appliance Repair', 'Auto Detailing',
  'Pool & Spa', 'Pest Control', 'Other',
]

// Common trades the AI can confirm to callers ("Sounds like an HVAC issue").
const TRADE_OPTIONS = [
  'AC repair', 'AC install', 'Heating / furnace', 'Water heater',
  'Drain cleaning', 'Sewer / main line', 'Toilet / faucet',
  'Electrical repair', 'Panel upgrade', 'Lighting / fixtures',
  'Roofing repair', 'Roof replacement', 'Gutters',
  'Appliance repair', 'Garage doors', 'Locksmith',
  'House cleaning', 'Carpet / upholstery', 'Pressure washing',
  'Landscaping / mowing', 'Tree service', 'Snow removal',
  'Pest control', 'Pool / spa service', 'Handyman / odd jobs',
]

const STEPS = [
  { id: 1, label: 'Your Business', icon: '🏢' },
  { id: 2, label: 'Your Trades',   icon: '🔧' },
]

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
}

type FormData = {
  businessName: string
  businessType: string
  ownerFirstName: string
  phone: string
  serviceArea: string
  trades: string[]
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useUser()

  const [step, setStep] = useState(1)
  const [dir, setDir] = useState(1)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<FormData>({
    businessName: '',
    businessType: '',
    ownerFirstName: '',
    phone: '',
    serviceArea: '',
    trades: [],
  })

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function toggleTrade(t: string) {
    setForm(f => ({
      ...f,
      trades: f.trades.includes(t) ? f.trades.filter(x => x !== t) : [...f.trades, t],
    }))
  }

  function canContinue() {
    if (step === 1) return form.businessName.trim() && form.businessType && form.phone.trim() && form.ownerFirstName.trim() && form.serviceArea.trim()
    if (step === 2) return form.trades.length > 0
    return true
  }

  function next() {
    if (!canContinue()) return
    setDir(1)
    setStep(s => s + 1)
  }

  function back() {
    setDir(-1)
    setStep(s => s - 1)
  }

  async function finish() {
    if (!canContinue() || saving) return
    setSaving(true)
    // Fire-and-forget profile save with sensible defaults so we don't block the
    // user. The remaining preferences (tone/language/hours/features) are wired
    // to defaults here and editable from Dashboard → Settings post-checkout.
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_name: form.businessName,
        business_type: form.businessType,
        owner_first_name: form.ownerFirstName,
        owner_phone: form.phone,
        service_area: form.serviceArea,
        services_offered: form.trades.join(', '),
        ai_tone: 'friendly',
        ai_language: 'en',
        revenue_range: '',
        team_size: '',
        // CRITICAL: services is what Emma reads aloud — "We cover X" in
        // her prompt. Use the actual trades the contractor selected.
        // Previously hardcoded to BellAveGo's product features
        // ("Call answering, Appointment booking, SMS confirmations")
        // which made Emma tell callers we cover SaaS features instead
        // of HVAC/plumbing. Fall back to business_type if no trades
        // selected, then a generic phrase. (Audit 2026-05-24)
        services: form.trades.length > 0
          ? form.trades.join(', ')
          : form.businessType
          ? `${form.businessType} services`
          : 'home services',
        hours_open: '8:00 AM',
        hours_close: '6:00 PM',
        onboarding_complete: true,
      }),
    }).catch(() => {})
    user?.update({ unsafeMetadata: { onboardingComplete: true } }).catch(() => {})
    fetch('/api/onboarding/resolve-place', { method: 'POST' }).catch(() => {})
    fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessName: form.businessName,
        phone: form.phone,
        businessType: form.businessType,
      }),
    }).catch(() => {})
    // Send them straight to pricing — no done screen, no auto-redirect timer.
    // Goal: zero turnover between filling the form and picking a plan.
    router.push('/pricing')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10,
    border: '1.5px solid rgba(10,168,159,0.2)', background: '#F5FDFB',
    fontSize: 14, color: '#0B1F3A', fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.2s',
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#7AAAB2',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
  }

  return (
    <div className="onb-shell" style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #F5FCFA 0%, #EBF7F3 50%, #F0FAF7 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif", padding: '32px 20px', position: 'relative', overflow: 'hidden',
    }}>

      {/* Background grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(10,168,159,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,168,159,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

      {/* Logo */}
      <motion.a href="/" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 28, textDecoration: 'none' }}>
        <Image src="/logo.png" alt="BellAveGo" width={160} height={52} style={{ objectFit: 'contain' }} />
      </motion.a>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: 540, background: '#ffffff', borderRadius: 22, boxShadow: '0 24px 64px rgba(7,27,58,0.11)', border: '1px solid rgba(10,168,159,0.14)', overflow: 'hidden', position: 'relative', zIndex: 1 }}
      >

        {/* Progress header */}
        <div style={{ background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', padding: '20px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Step {step} of {STEPS.length}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
              60 seconds
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.22)', borderRadius: 4 }}>
            <motion.div
              animate={{ width: `${(step / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              style={{ height: '100%', background: '#fff', borderRadius: 4 }}
            />
          </div>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
            {STEPS.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: step >= s.id ? 1 : 0.45 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: step > s.id ? '#fff' : step === s.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                  {step > s.id ? <span style={{ color: '#0AA89F', fontWeight: 800 }}>✓</span> : <span style={{ fontSize: 10 }}>{s.icon}</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div style={{ padding: '32px 28px 28px', minHeight: 360, position: 'relative', overflow: 'hidden' }}>
          <AnimatePresence mode="wait" custom={dir}>

            {/* ── STEP 1: Business basics ── */}
            {step === 1 && (
              <motion.div key="step1" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Tell us about your business
                </h2>
                <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 22 }}>We&apos;ll personalize your AI receptionist with this. Everything else (tone, hours, features) is editable in settings later.</p>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Business name</label>
                  <input style={inputStyle} placeholder="e.g. Smith HVAC & Plumbing" value={form.businessName}
                    onChange={e => set('businessName', e.target.value)} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Business type</label>
                    <select style={selectStyle} value={form.businessType} onChange={e => set('businessType', e.target.value)}>
                      <option value="">Select…</option>
                      {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Your first name</label>
                    <input style={inputStyle} placeholder="Mike" value={form.ownerFirstName}
                      onChange={e => set('ownerFirstName', e.target.value)} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Business phone number</label>
                  <input style={inputStyle} placeholder="(555) 000-0000" type="tel" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                  <p style={{ fontSize: 11, color: '#A0BCC2', marginTop: 5 }}>
                    The cell your missed calls forward from. You keep your existing number.
                  </p>
                </div>

                <div>
                  <label style={labelStyle}>Service area</label>
                  <input style={inputStyle} placeholder="e.g. metro Atlanta · or Minneapolis–St. Paul" value={form.serviceArea}
                    onChange={e => set('serviceArea', e.target.value)} />
                  <p style={{ fontSize: 11, color: '#A0BCC2', marginTop: 5 }}>
                    The AI will tell callers &quot;we serve {form.serviceArea || 'your area'}.&quot;
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Trades ── */}
            {step === 2 && (
              <motion.div key="step2" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  What services do you offer?
                </h2>
                <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 18 }}>
                  Pick all that apply. Your AI will only confirm jobs in these categories and politely route anything else.
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {TRADE_OPTIONS.map(t => {
                    const active = form.trades.includes(t)
                    return (
                      <button key={t} onClick={() => toggleTrade(t)} style={{
                        padding: '8px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.2)'}`,
                        background: active ? 'rgba(10,168,159,0.1)' : '#F5FDFB',
                        color: active ? '#0AA89F' : '#4A7A80',
                        transition: 'all 0.15s ease',
                      }}>{active ? '✓ ' : ''}{t}</button>
                    )
                  })}
                </div>

                <div style={{ background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.16)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>7-day free trial · no charge until day 8</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#7AAAB2', margin: 0, lineHeight: 1.6 }}>
                    Pick your plan next. We save your card but don&apos;t charge it for 7 days. Cancel anytime during the trial — no charge ever fires.
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Navigation footer */}
        <div style={{ padding: '0 28px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {step > 1 ? (
            <button onClick={back} style={{ padding: '11px 22px', borderRadius: 10, border: '1.5px solid rgba(10,168,159,0.2)', background: 'transparent', color: '#4A7A80', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Back
            </button>
          ) : <div />}

          <button
            onClick={step < STEPS.length ? next : finish}
            disabled={!canContinue() || saving}
            style={{
              padding: '12px 28px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: canContinue() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              background: canContinue() ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'rgba(10,168,159,0.1)',
              color: canContinue() ? '#fff' : '#7AAAB2',
              boxShadow: canContinue() ? '0 4px 18px rgba(34,197,94,0.32)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {step < STEPS.length ? 'Continue →' : saving ? 'Saving…' : 'Pick your plan →'}
          </button>
        </div>
      </motion.div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        style={{ marginTop: 20, fontSize: 11, color: '#A0BCC2', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        7-day free trial · Two steps, 60 seconds · Cancel anytime before day 8
      </motion.p>
    </div>
  )
}
