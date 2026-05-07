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
    borderRadius: '11px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    card: {
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(24,175,168,0.22)',
      boxShadow: '0 20px 60px rgba(7,27,58,0.12), 0 0 0 1px rgba(24,175,168,0.08)',
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
    headerTitle: { color: '#0B1F3A', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em' },
    headerSubtitle: { color: '#3D5A62' },
    socialButtonsBlockButton: {
      border: '1px solid rgba(11,31,58,0.12)',
      color: '#0B1F3A',
      background: 'rgba(255,255,255,0.8)',
    },
    dividerLine: { background: 'rgba(11,31,58,0.09)' },
    dividerText: { color: '#7AAAB2' },
    formFieldLabel: { color: '#3D5A62', fontWeight: '600' },
    formFieldInput: { color: '#0B1F3A', border: '1px solid rgba(11,31,58,0.14)', background: '#F8FDFB' },
    identityPreviewText: { color: '#0B1F3A' },
    identityPreviewEditButton: { color: '#18AFA8' },
  },
}

const BULLETS = [
  { icon: '📞', text: 'AI answers missed calls after 12 seconds', desc: 'Never lose a job to a missed call again' },
  { icon: '📅', text: '24/7 appointment booking + scheduling', desc: 'Jobs added to your calendar automatically' },
  { icon: '💰', text: 'Invoicing + same-day payment collection', desc: 'Get paid faster with automated invoicing' },
  { icon: '📊', text: 'Revenue dashboard + BellAveGo consulting insights', desc: '5 expert reports per year included' },
]

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #E8F7F2 0%, #F2FAF7 28%, #EAF6F0 55%, #D8EEE9 80%, #C8E8E2 100%)',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '-6%', top: '15%', width: 460, height: 460, background: 'radial-gradient(ellipse, rgba(32,178,170,0.2) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(22px)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.09, 1], opacity: [0.28, 0.5, 0.28] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          style={{ position: 'absolute', right: '-5%', bottom: '20%', width: 380, height: 380, background: 'radial-gradient(ellipse, rgba(32,178,170,0.15) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(26px)' }}
        />
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%' }} viewBox="0 0 1440 90" preserveAspectRatio="none" height="90">
          <path d="M0,50 C300,12 600,72 900,46 C1100,28 1300,58 1440,42 L1440,90 L0,90 Z" fill="rgba(24,175,168,0.12)" />
          <path d="M0,68 C360,36 720,78 1080,62 C1260,54 1380,70 1440,66 L1440,90 L0,90 Z" fill="rgba(24,175,168,0.07)" />
        </svg>
        <div style={{ position: 'absolute', top: -4, right: 56, opacity: 0.2 }}>
          <svg width="80" height="118" viewBox="0 0 80 118" fill="none">
            <path d="M40 112 C40 112 14 76 20 44 C26 24 40 12 40 12 C40 12 54 24 60 44 C66 76 40 112 40 112Z" fill="rgba(24,175,168,0.55)" />
            <path d="M40 112 C40 112 6 84 10 50 C14 30 28 18 40 12 C32 36 28 62 40 112Z" fill="rgba(24,175,168,0.28)" />
            <line x1="40" y1="12" x2="40" y2="112" stroke="rgba(24,175,168,0.35)" strokeWidth="1.2" />
          </svg>
        </div>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(11,31,58,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(11,31,58,0.03) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />
        <div style={{ position: 'absolute', bottom: 28, right: 24, opacity: 0.14 }}>
          {[0,1,2,3].map(r => (
            <div key={r} style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
              {[0,1,2,3].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
            </div>
          ))}
        </div>
      </div>

      {/* ══ LEFT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '52px 52px', position: 'relative', zIndex: 1, minWidth: 0 }}
      >
        {/* Logo */}
        <motion.a
          href="/"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          whileHover={{ scale: 1.03 }}
          style={{ display: 'block', marginBottom: 38, textDecoration: 'none', width: 'fit-content' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={320}
            height={104}
            style={{ objectFit: 'contain', filter: 'brightness(1.08) drop-shadow(0 4px 16px rgba(24,175,168,0.35))' }}
          />
        </motion.a>

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(24,175,168,0.12)', border: '1px solid rgba(24,175,168,0.3)', borderRadius: 20, padding: '5px 13px', marginBottom: 16, width: 'fit-content' }}
        >
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.8, repeat: Infinity }} style={{ width: 5, height: 5, borderRadius: '50%', background: '#18AFA8' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#0F6B63', letterSpacing: '0.09em', textTransform: 'uppercase' }}>14-Day Free Trial · No Credit Card</span>
        </motion.div>

        {/* Headline */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.55 }}>
          <h1 style={{ fontSize: 'clamp(26px, 2.8vw, 40px)', fontWeight: 900, color: '#0B1F3A', lineHeight: 1.15, letterSpacing: '-0.035em', margin: '0 0 10px' }}>
            Stop losing jobs to<br />
            <span style={{ color: '#18AFA8' }}>missed calls.</span>
          </h1>
          <p style={{ color: '#3D5A62', fontSize: 14, lineHeight: 1.65, maxWidth: 380, margin: '0 0 28px' }}>
            BellAveGo answers calls, books jobs, sends invoices, and helps grow your service business — starting in 15 minutes.
          </p>
        </motion.div>

        {/* Feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: 0.55 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 430 }}
        >
          {BULLETS.map((b, i) => (
            <motion.div
              key={b.text}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.36 + i * 0.07, duration: 0.4 }}
              whileHover={{ x: 4, boxShadow: '0 8px 28px rgba(7,27,58,0.13)' }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(14px)', border: '1px solid rgba(24,175,168,0.16)', borderRadius: 12, padding: '11px 14px', boxShadow: '0 2px 12px rgba(7,27,58,0.07)', cursor: 'default' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(24,175,168,0.1)', border: '1px solid rgba(24,175,168,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {b.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A', marginBottom: 1 }}>{b.text}</div>
                <div style={{ fontSize: 11, color: '#5A8A92' }}>{b.desc}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.75 }} style={{ margin: '20px 0 0', fontSize: 11, color: '#7AAAB2' }}>
          No credit card required · Setup in 15 min · Cancel anytime
        </motion.p>
      </motion.div>

      {/* ══ RIGHT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut', delay: 0.12 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(24,175,168,0.14)' }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 340, height: 340, background: 'radial-gradient(ellipse, rgba(24,175,168,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignUp appearance={clerkAppearance} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          style={{ marginTop: 26, textAlign: 'center', maxWidth: 360 }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: '#3D5A62', marginBottom: 5 }}>
            Built for service businesses doing $100k–$4M/year.
          </p>
          <p style={{ fontSize: 11, color: '#7AAAB2', lineHeight: 1.6, margin: '0 0 12px' }}>
            Designed for HVAC, plumbing, electrical, cleaning,<br />and home service companies.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            {['⚡', '❄️', '🪠', '🧹', '🔨'].map(e => (
              <span key={e} style={{ fontSize: 18, opacity: 0.38 }}>{e}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
