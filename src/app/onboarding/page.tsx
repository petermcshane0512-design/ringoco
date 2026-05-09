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

const REVENUE_OPTIONS = [
  { label: 'Under $100k', value: 'under_100k' },
  { label: '$100k – $500k', value: '100k_500k' },
  { label: '$500k – $2M', value: '500k_2m' },
  { label: '$2M – $4M', value: '2m_4m' },
  { label: '$4M+', value: '4m_plus' },
]

const TEAM_OPTIONS = [
  { label: 'Just me', value: '1' },
  { label: '2 – 5', value: '2_5' },
  { label: '6 – 15', value: '6_15' },
  { label: '15+', value: '15_plus' },
]

const SERVICE_OPTIONS = [
  'Call answering', 'Appointment booking', 'SMS confirmations',
  'Invoice & payments', 'Revenue tracking', 'AI consulting reports',
  'Google review requests', 'Follow-up reminders',
]

const HOURS_OPTIONS = ['6:00 AM','7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','12:00 PM',
  '1:00 PM','2:00 PM','3:00 PM','4:00 PM','5:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM']

const STEPS = [
  { id: 1, label: 'Your Business', icon: '🏢' },
  { id: 2, label: 'About You',    icon: '📊' },
  { id: 3, label: 'Your Services',icon: '⚙️' },
]

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0 }),
}

type FormData = {
  businessName: string
  businessType: string
  phone: string
  revenueRange: string
  teamSize: string
  services: string[]
  hoursOpen: string
  hoursClose: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user } = useUser()

  const [step, setStep] = useState(1)
  const [dir, setDir] = useState(1)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const [form, setForm] = useState<FormData>({
    businessName: '',
    businessType: '',
    phone: '',
    revenueRange: '',
    teamSize: '',
    services: [],
    hoursOpen: '8:00 AM',
    hoursClose: '6:00 PM',
  })

  function set<K extends keyof FormData>(key: K, val: FormData[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function toggleService(s: string) {
    setForm(f => ({
      ...f,
      services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s],
    }))
  }

  function canContinue() {
    if (step === 1) return form.businessName.trim() && form.businessType && form.phone.trim()
    if (step === 2) return form.revenueRange && form.teamSize
    if (step === 3) return form.services.length > 0
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
    try {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: form.businessName,
          business_type: form.businessType,
          phone: form.phone,
          revenue_range: form.revenueRange,
          team_size: form.teamSize,
          services: form.services.join(', '),
          hours_open: form.hoursOpen,
          hours_close: form.hoursClose,
          onboarding_complete: true,
        }),
      })
      await user?.update({ unsafeMetadata: { onboardingComplete: true } })
    } catch {
      // continue to dashboard even if save fails
    }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2200)
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

  function PillButton({ label, value, current, onClick }: { label: string; value: string; current: string; onClick: () => void }) {
    const active = current === value
    return (
      <button onClick={onClick} style={{
        padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.2)'}`,
        background: active ? 'rgba(10,168,159,0.08)' : '#F5FDFB',
        color: active ? '#0AA89F' : '#4A7A80',
        transition: 'all 0.15s ease',
      }}>{label}</button>
    )
  }

  function ServiceChip({ label }: { label: string }) {
    const active = form.services.includes(label)
    return (
      <button onClick={() => toggleService(label)} style={{
        padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1.5px solid ${active ? '#0AA89F' : 'rgba(10,168,159,0.2)'}`,
        background: active ? 'rgba(10,168,159,0.1)' : '#F5FDFB',
        color: active ? '#0AA89F' : '#4A7A80',
        transition: 'all 0.15s ease',
      }}>{active ? '✓ ' : ''}{label}</button>
    )
  }

  return (
    <div style={{
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
        {!done && (
          <div style={{ background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', padding: '20px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Step {step} of {STEPS.length}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                {Math.round((step / STEPS.length) * 100)}% complete
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
        )}

        {/* Step content */}
        <div style={{ padding: '32px 28px 28px', minHeight: 360, position: 'relative', overflow: 'hidden' }}>
          <AnimatePresence mode="wait" custom={dir}>

            {/* ── DONE SCREEN ── */}
            {done && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '24px 0 8px' }}>
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #22C55E, #16A34A)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 28px rgba(34,197,94,0.38)', fontSize: 32 }}
                >
                  ✓
                </motion.div>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.03em', marginBottom: 10 }}>
                  You&apos;re all set!
                </h2>
                <p style={{ fontSize: 14, color: '#4A7A80', lineHeight: 1.6, maxWidth: 360, margin: '0 auto 24px' }}>
                  Your AI receptionist is being activated. Launching your dashboard now...
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 12, padding: '14px 20px', maxWidth: 340, margin: '0 auto' }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid #0AA89F', borderTopColor: 'transparent' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F' }}>Setting up your workspace…</span>
                </div>
              </motion.div>
            )}

            {/* ── STEP 1: Business basics ── */}
            {!done && step === 1 && (
              <motion.div key="step1" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Tell us about your business
                </h2>
                <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 24 }}>We&apos;ll use this to personalize your AI receptionist.</p>

                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Business name</label>
                  <input style={inputStyle} placeholder="e.g. Smith HVAC & Plumbing" value={form.businessName}
                    onChange={e => set('businessName', e.target.value)} />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Business type</label>
                  <select style={selectStyle} value={form.businessType} onChange={e => set('businessType', e.target.value)}>
                    <option value="">Select your industry…</option>
                    {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>Business phone number</label>
                  <input style={inputStyle} placeholder="(555) 000-0000" type="tel" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                  <p style={{ fontSize: 11, color: '#A0BCC2', marginTop: 5 }}>
                    This is the number BellAveGo will answer calls for. You can keep your existing number.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── STEP 2: Revenue & team ── */}
            {!done && step === 2 && (
              <motion.div key="step2" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  About your business
                </h2>
                <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 24 }}>Helps us tailor your consulting reports and dashboard.</p>

                <div style={{ marginBottom: 22 }}>
                  <label style={labelStyle}>Annual revenue range</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {REVENUE_OPTIONS.map(o => (
                      <PillButton key={o.value} label={o.label} value={o.value} current={form.revenueRange} onClick={() => set('revenueRange', o.value)} />
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 22 }}>
                  <label style={labelStyle}>Team size</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {TEAM_OPTIONS.map(o => (
                      <PillButton key={o.value} label={o.label} value={o.value} current={form.teamSize} onClick={() => set('teamSize', o.value)} />
                    ))}
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Typical business hours</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>Opens</label>
                      <select style={selectStyle} value={form.hoursOpen} onChange={e => set('hoursOpen', e.target.value)}>
                        {HOURS_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>Closes</label>
                      <select style={selectStyle} value={form.hoursClose} onChange={e => set('hoursClose', e.target.value)}>
                        {HOURS_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── STEP 3: Services ── */}
            {!done && step === 3 && (
              <motion.div key="step3" custom={dir} variants={slideVariants} initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.3, ease: 'easeOut' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.02em', marginBottom: 6 }}>
                  What do you want BellAveGo to handle?
                </h2>
                <p style={{ fontSize: 13, color: '#7AAAB2', marginBottom: 22 }}>Select everything you want activated from day one.</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 24 }}>
                  {SERVICE_OPTIONS.map(s => <ServiceChip key={s} label={s} />)}
                </div>

                <div style={{ background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.16)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>Your 14-day free trial starts now</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#7AAAB2', margin: 0, lineHeight: 1.6 }}>
                    No credit card required. You&apos;ll set up billing after you see BellAveGo in action.
                  </p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Navigation footer */}
        {!done && (
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
              {step < STEPS.length ? 'Continue →' : saving ? 'Saving…' : 'Launch My Dashboard →'}
            </button>
          </div>
        )}
      </motion.div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        style={{ marginTop: 20, fontSize: 11, color: '#A0BCC2', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        No credit card required · Setup in 10–15 minutes · Cancel anytime
      </motion.p>
    </div>
  )
}
