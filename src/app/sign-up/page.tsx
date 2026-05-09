'use client'
import Image from 'next/image'
import { SignUp } from '@clerk/nextjs'
import { motion } from 'framer-motion'

const clerkAppearance = {
  variables: {
    colorPrimary: '#22C55E',
    colorBackground: '#ffffff',
    colorText: '#0B1F3A',
    colorTextSecondary: '#3D5A62',
    colorInputBackground: '#F8FDFB',
    colorInputText: '#0B1F3A',
    borderRadius: '10px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    card: {
      background: 'rgba(255,255,255,0.95)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(24,175,168,0.18)',
      boxShadow: '0 24px 64px rgba(7,27,58,0.12)',
      borderRadius: '20px',
    },
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
      fontSize: '15px',
      fontWeight: '800',
      letterSpacing: '-0.01em',
      boxShadow: '0 4px 18px rgba(34,197,94,0.38)',
    },
    footerActionLink: { color: '#18AFA8', fontWeight: '600' },
    headerTitle: { color: '#0B1F3A', fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' },
    headerSubtitle: { color: '#3D5A62', fontSize: '13px' },
    socialButtonsBlockButton: { border: '1px solid rgba(11,31,58,0.12)', color: '#0B1F3A', background: 'rgba(255,255,255,0.9)' },
    dividerLine: { background: 'rgba(11,31,58,0.09)' },
    dividerText: { color: '#7AAAB2' },
    formFieldLabel: { color: '#3D5A62', fontWeight: '600' },
    formFieldInput: { color: '#0B1F3A', border: '1px solid rgba(11,31,58,0.14)', background: '#F8FDFB' },
    identityPreviewText: { color: '#0B1F3A' },
    identityPreviewEditButton: { color: '#18AFA8' },
  },
}

const NOTIFICATIONS = [
  { icon: '📞', label: 'Missed call recovered', body: 'HVAC repair booked · $350 job added to schedule', time: 'Just now', dot: '#22C55E' },
  { icon: '📅', label: 'Appointment scheduled', body: 'Plumbing estimate · Tomorrow at 10:30 AM', time: '2m', dot: '#0AA89F' },
  { icon: '💰', label: 'Invoice paid', body: '$1,250 received via Stripe payment link', time: '8m', dot: '#22C55E' },
  { icon: '📊', label: 'AI report ready', body: '12 local marketing opportunities identified', time: '1h', dot: '#6366F1' },
]

const STEPS = [
  { n: '01', title: 'Connect your business phone', sub: '2 min setup · Keep your existing number' },
  { n: '02', title: 'AI answers calls & books jobs', sub: 'Active 24/7 · Fully automatic' },
  { n: '03', title: 'Track revenue in your dashboard', sub: 'Live metrics and insights from day one' },
]

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #EBF8F4 0%, #F4FAF8 35%, #EDF7F3 65%, #D9EDE8 100%)',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(10,168,159,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,168,159,0.04) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '-8%', top: '8%', width: 520, height: 520, background: 'radial-gradient(ellipse, rgba(24,175,168,0.18) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(24px)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.18, 0.32, 0.18] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          style={{ position: 'absolute', right: '-4%', bottom: '12%', width: 420, height: 420, background: 'radial-gradient(ellipse, rgba(34,197,94,0.14) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(30px)' }}
        />
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%' }} viewBox="0 0 1440 70" preserveAspectRatio="none" height="70">
          <path d="M0,40 C300,8 600,58 900,34 C1100,18 1300,46 1440,30 L1440,70 L0,70 Z" fill="rgba(24,175,168,0.09)" />
        </svg>
        <div style={{ position: 'absolute', top: 20, right: 60, opacity: 0.15 }}>
          <svg width="76" height="112" viewBox="0 0 76 112" fill="none">
            <path d="M38 106 C38 106 12 72 18 42 C23 22 38 10 38 10 C38 10 53 22 58 42 C64 72 38 106 38 106Z" fill="rgba(24,175,168,0.6)" />
            <path d="M38 106 C38 106 6 80 10 48 C13 28 26 16 38 10 C30 34 26 60 38 106Z" fill="rgba(24,175,168,0.3)" />
          </svg>
        </div>
      </div>

      {/* ══ LEFT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '48px 52px', position: 'relative', zIndex: 1, minWidth: 0, maxWidth: 580 }}
      >
        {/* Logo */}
        <motion.a href="/" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          style={{ display: 'block', marginBottom: 32, textDecoration: 'none', width: 'fit-content' }}>
          <Image src="/logo.png" alt="BellAveGo" width={200} height={65} style={{ objectFit: 'contain', filter: 'drop-shadow(0 2px 10px rgba(24,175,168,0.25))' }} />
        </motion.a>

        {/* Live badge */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.14 }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.26)', borderRadius: 20, padding: '5px 12px', marginBottom: 16, width: 'fit-content' }}>
          <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
            style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#15803D', letterSpacing: '0.08em', textTransform: 'uppercase' }}>14-Day Free Trial · No Credit Card</span>
        </motion.div>

        {/* Headline */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h1 style={{ fontSize: 'clamp(28px, 2.8vw, 44px)', fontWeight: 900, color: '#0B1F3A', lineHeight: 1.12, letterSpacing: '-0.04em', margin: '0 0 12px' }}>
            Activate Your<br />
            <span style={{ color: '#0AA89F' }}>AI Receptionist.</span>
          </h1>
          <p style={{ color: '#3D5A62', fontSize: 15, lineHeight: 1.65, maxWidth: 400, margin: '0 0 28px' }}>
            Start answering missed calls, booking jobs, and collecting payments in minutes — not months.
          </p>
        </motion.div>

        {/* Floating notification cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxWidth: 440, marginBottom: 28 }}>
          {NOTIFICATIONS.map((n, i) => (
            <motion.div
              key={n.label}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 + i * 0.09, duration: 0.45 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.84)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.75)', borderRadius: 14, padding: '11px 14px', boxShadow: '0 4px 18px rgba(7,27,58,0.07)', cursor: 'default' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(10,168,159,0.07)', border: '1px solid rgba(10,168,159,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {n.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: n.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>{n.label}</span>
                </div>
                <p style={{ fontSize: 11, color: '#5A8A92', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</p>
              </div>
              <span style={{ fontSize: 10, color: '#A0BCC2', flexShrink: 0 }}>{n.time}</span>
            </motion.div>
          ))}
        </div>

        {/* 3-step process */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>How it works</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{s.n}</div>
                  {i < STEPS.length - 1 && <div style={{ width: 1, height: 20, background: 'rgba(10,168,159,0.22)', margin: '3px 0' }} />}
                </div>
                <div style={{ paddingBottom: i < STEPS.length - 1 ? 12 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A', marginBottom: 1 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: '#7AAAB2' }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
          style={{ margin: '18px 0 0', fontSize: 11, color: '#9ABAC0' }}>
          No credit card required · Cancel anytime · Keep your existing business number
        </motion.p>
      </motion.div>

      {/* ══ RIGHT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(24,175,168,0.12)' }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 320, height: 320, background: 'radial-gradient(ellipse, rgba(24,175,168,0.11) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignUp afterSignUpUrl="/onboarding" appearance={clerkAppearance} />
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}
          style={{ marginTop: 22, textAlign: 'center', maxWidth: 360 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#3D5A62', marginBottom: 4 }}>
            Built for service businesses doing $100k–$4M/year.
          </p>
          <p style={{ fontSize: 11, color: '#7AAAB2', lineHeight: 1.6, margin: '0 0 10px' }}>
            HVAC · Plumbing · Electrical · Cleaning · Landscaping · Handyman
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {['⚡', '❄️', '🪠', '🧹', '🌿', '🔨'].map(e => (
              <span key={e} style={{ fontSize: 17, opacity: 0.32 }}>{e}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
