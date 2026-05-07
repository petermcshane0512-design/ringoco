'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { SignIn } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'

/* ─── Activity feed ─── */
const FEED = [
  { icon: '📞', label: 'AI answered incoming call', detail: 'HVAC service · 8 seconds', color: '#18AFA8' },
  { icon: '📅', label: 'Appointment booked', detail: 'Plumbing · Tomorrow 9 AM', color: '#22C55E' },
  { icon: '💬', label: 'Confirmation SMS sent', detail: '"Your tech is on the way!"', color: '#6366F1' },
  { icon: '💰', label: 'Invoice paid · $475', detail: 'Same-day collection', color: '#F59E0B' },
  { icon: '📊', label: 'Consulting report ready', detail: 'May BellAveGo Insights', color: '#18AFA8' },
]

function LiveFeed() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % FEED.length), 2600)
    return () => clearInterval(id)
  }, [])
  const item = FEED[idx]
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.35 }}
        style={{ display: 'flex', alignItems: 'center', gap: 11 }}
      >
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${item.color}18`, border: `1px solid ${item.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
          {item.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A', marginBottom: 1 }}>{item.label}</div>
          <div style={{ fontSize: 11, color: '#5A8A92', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</div>
        </div>
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, boxShadow: `0 0 7px ${item.color}`, flexShrink: 0 }}
        />
      </motion.div>
    </AnimatePresence>
  )
}

/* ─── Clerk light-theme appearance ─── */
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
    formFieldInput: {
      color: '#0B1F3A',
      border: '1px solid rgba(11,31,58,0.14)',
      background: '#F8FDFB',
    },
    identityPreviewText: { color: '#0B1F3A' },
    identityPreviewEditButton: { color: '#18AFA8' },
  },
}

const BULLETS = [
  { icon: '📞', text: 'AI answers missed calls after 12 seconds' },
  { icon: '📅', text: '24/7 appointment booking + scheduling' },
  { icon: '💰', text: 'Invoicing + same-day payment collection' },
  { icon: '📊', text: 'Revenue dashboard + BellAveGo consulting insights' },
]

const SCHEDULE = [
  { time: '8:00 AM', name: 'HVAC Repair', color: '#18AFA8' },
  { time: '10:30 AM', name: 'Plumbing', color: '#6366F1' },
  { time: '1:00 PM', name: 'Electrical', color: '#F59E0B' },
  { time: '3:30 PM', name: 'HVAC Tune-up', color: '#22C55E' },
]

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #E8F7F2 0%, #F2FAF7 28%, #EAF6F0 55%, #D8EEE9 80%, #C8E8E2 100%)',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background layers ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {/* Aqua glow blobs */}
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.7, 0.45] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '-8%', top: '10%', width: 480, height: 480, background: 'radial-gradient(ellipse, rgba(32,178,170,0.22) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(20px)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          style={{ position: 'absolute', right: '-6%', top: '20%', width: 400, height: 400, background: 'radial-gradient(ellipse, rgba(32,178,170,0.16) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(24px)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
          style={{ position: 'absolute', left: '35%', bottom: '-5%', width: 500, height: 300, background: 'radial-gradient(ellipse, rgba(24,175,168,0.18) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(30px)' }}
        />

        {/* Bottom wave */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', pointerEvents: 'none' }} viewBox="0 0 1440 90" preserveAspectRatio="none" height="90">
          <path d="M0,50 C300,12 600,72 900,46 C1100,28 1300,58 1440,42 L1440,90 L0,90 Z" fill="rgba(24,175,168,0.12)" />
          <path d="M0,68 C360,36 720,78 1080,62 C1260,54 1380,70 1440,66 L1440,90 L0,90 Z" fill="rgba(24,175,168,0.07)" />
        </svg>

        {/* Palm leaf decorations */}
        <div style={{ position: 'absolute', top: -4, right: 60, opacity: 0.22 }}>
          <svg width="80" height="120" viewBox="0 0 80 120" fill="none">
            <path d="M40 114 C40 114 14 78 20 46 C26 26 40 14 40 14 C40 14 54 26 60 46 C66 78 40 114 40 114Z" fill="rgba(24,175,168,0.6)" />
            <path d="M40 114 C40 114 6 86 10 52 C14 32 28 20 40 14 C32 38 28 64 40 114Z" fill="rgba(24,175,168,0.3)" />
            <line x1="40" y1="14" x2="40" y2="114" stroke="rgba(24,175,168,0.4)" strokeWidth="1.2" />
          </svg>
        </div>
        <div style={{ position: 'absolute', bottom: 20, left: 40, opacity: 0.16, transform: 'rotate(172deg)' }}>
          <svg width="60" height="90" viewBox="0 0 60 90" fill="none">
            <path d="M30 84 C30 84 10 58 14 36 C18 20 30 12 30 12 C30 12 42 20 46 36 C50 58 30 84 30 84Z" fill="rgba(24,175,168,0.5)" />
            <line x1="30" y1="12" x2="30" y2="84" stroke="rgba(24,175,168,0.35)" strokeWidth="1" />
          </svg>
        </div>

        {/* Very faint grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(11,31,58,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(11,31,58,0.03) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />

        {/* Dot grid top-left */}
        <div style={{ position: 'absolute', top: 22, left: 22, opacity: 0.18 }}>
          {[0,1,2,3,4].map(r => (
            <div key={r} style={{ display: 'flex', gap: 9, marginBottom: 9 }}>
              {[0,1,2,3,4].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
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
          style={{ display: 'block', marginBottom: 40, textDecoration: 'none', width: 'fit-content' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={320}
            height={104}
            style={{
              objectFit: 'contain',
              filter: 'brightness(1.08) drop-shadow(0 4px 16px rgba(24,175,168,0.35))',
            }}
          />
        </motion.a>

        {/* Headline */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.55 }}>
          <h1 style={{ fontSize: 'clamp(26px, 2.8vw, 40px)', fontWeight: 900, color: '#0B1F3A', lineHeight: 1.15, letterSpacing: '-0.035em', margin: '0 0 10px' }}>
            Your AI receptionist<br />
            <span style={{ color: '#18AFA8' }}>is ready.</span>
          </h1>
          <p style={{ color: '#3D5A62', fontSize: 14, lineHeight: 1.65, maxWidth: 360, margin: '0 0 28px' }}>
            BellAveGo answers calls, books jobs, sends invoices, and helps grow your service business.
          </p>
        </motion.div>

        {/* Floating dashboard cards */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, marginBottom: 24 }}
        >
          {/* Live feed card */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(16px)', border: '1px solid rgba(24,175,168,0.2)', borderRadius: 14, padding: '13px 15px', boxShadow: '0 8px 30px rgba(7,27,58,0.1)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11 }}>
              <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Live Activity</span>
            </div>
            <LiveFeed />
          </motion.div>

          {/* Stats + schedule row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {/* Stats */}
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              style={{ background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(16px)', border: '1px solid rgba(24,175,168,0.18)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 8px 24px rgba(7,27,58,0.09)' }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#5A8A92', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Today</div>
              {[
                { label: '38 calls answered', color: '#18AFA8' },
                { label: '14 jobs booked', color: '#22C55E' },
                { label: '$12,480 revenue', color: '#F59E0B' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#0B1F3A', fontWeight: 600 }}>{s.label}</span>
                </div>
              ))}
            </motion.div>

            {/* Schedule */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              style={{ background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(16px)', border: '1px solid rgba(24,175,168,0.18)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 8px 24px rgba(7,27,58,0.09)' }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#5A8A92', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Schedule</div>
              {SCHEDULE.map(s => (
                <div key={s.time} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#3D5A62', fontWeight: 500 }}>{s.time} · {s.name}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Feature bullets */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.55 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 420 }}
        >
          {BULLETS.map(b => (
            <motion.div
              key={b.text}
              whileHover={{ x: 4, boxShadow: '0 6px 24px rgba(7,27,58,0.12)' }}
              transition={{ duration: 0.18 }}
              style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(12px)', border: '1px solid rgba(24,175,168,0.16)', borderRadius: 10, padding: '9px 13px', boxShadow: '0 2px 12px rgba(7,27,58,0.07)', cursor: 'default' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(24,175,168,0.12)', border: '1px solid rgba(24,175,168,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                {b.icon}
              </div>
              <span style={{ fontSize: 13, color: '#0B1F3A', fontWeight: 600 }}>{b.text}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ margin: '20px 0 0', fontSize: 11, color: '#7AAAB2' }}>
          $97/mo · No contracts · Cancel anytime
        </motion.p>
      </motion.div>

      {/* ══ RIGHT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut', delay: 0.12 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(24,175,168,0.14)' }}
      >
        {/* Soft glow behind form */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 340, height: 340, background: 'radial-gradient(ellipse, rgba(24,175,168,0.14) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignIn appearance={clerkAppearance} />
        </div>

        {/* Social proof — factual only */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
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
              <span key={e} style={{ fontSize: 18, opacity: 0.4 }}>{e}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
