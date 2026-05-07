'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { SignIn } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'

/* ─── Live activity feed ─── */
const FEED = [
  { icon: '📞', label: 'AI answered incoming call', detail: 'HVAC service · 8 seconds', color: '#0AA89F' },
  { icon: '📅', label: 'Appointment booked', detail: 'Plumbing · Tomorrow 9 AM', color: '#22C55E' },
  { icon: '💬', label: 'Confirmation SMS sent', detail: '"Your tech is on the way!"', color: '#6366F1' },
  { icon: '💰', label: 'Invoice paid · $475', detail: 'Same-day collection', color: '#F59E0B' },
  { icon: '📊', label: 'Consulting report ready', detail: 'May BellAveGo Insights', color: '#0AA89F' },
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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        style={{ display: 'flex', alignItems: 'center', gap: 11 }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${item.color}15`, border: `1.5px solid ${item.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
          {item.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>{item.label}</div>
          <div style={{ fontSize: 11, color: '#64A09A', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.detail}</div>
        </div>
        <motion.div
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }}
        />
      </motion.div>
    </AnimatePresence>
  )
}

/* ─── Clerk appearance — bright white ─── */
const clerkAppearance = {
  variables: {
    colorPrimary: '#0AA89F',
    colorBackground: '#ffffff',
    colorText: '#0B1F3A',
    colorTextSecondary: '#4A7A80',
    colorInputBackground: '#F5FDFB',
    colorInputText: '#0B1F3A',
    borderRadius: '11px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    card: {
      background: '#ffffff',
      border: '1px solid rgba(10,168,159,0.16)',
      boxShadow: '0 8px 40px rgba(10,168,159,0.1), 0 2px 8px rgba(11,31,58,0.06)',
      borderRadius: '22px',
    },
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
      fontSize: '15px',
      fontWeight: '800',
      letterSpacing: '-0.01em',
      boxShadow: '0 4px 16px rgba(34,197,94,0.35)',
    },
    footerActionLink: { color: '#0AA89F', fontWeight: '600' },
    headerTitle: { color: '#0B1F3A', fontSize: '21px', fontWeight: '800', letterSpacing: '-0.02em' },
    headerSubtitle: { color: '#5A8A92' },
    socialButtonsBlockButton: {
      border: '1px solid rgba(11,31,58,0.1)',
      color: '#0B1F3A',
      background: '#F8FDFC',
    },
    dividerLine: { background: 'rgba(11,31,58,0.08)' },
    dividerText: { color: '#8ABAB8' },
    formFieldLabel: { color: '#3D6A70', fontWeight: '600' },
    formFieldInput: { color: '#0B1F3A', border: '1.5px solid rgba(10,168,159,0.2)', background: '#F5FDFB' },
    identityPreviewText: { color: '#0B1F3A' },
    identityPreviewEditButton: { color: '#0AA89F' },
  },
}

const BULLETS = [
  { icon: '📞', text: 'AI answers missed calls after 12 seconds' },
  { icon: '📅', text: '24/7 appointment booking + scheduling' },
  { icon: '💰', text: 'Invoicing + same-day payment collection' },
  { icon: '📊', text: 'Revenue dashboard + BellAveGo consulting insights' },
]

const SCHEDULE = [
  { time: '8:00 AM', name: 'HVAC Repair', color: '#0AA89F' },
  { time: '10:30 AM', name: 'Plumbing', color: '#6366F1' },
  { time: '1:00 PM', name: 'Electrical', color: '#F59E0B' },
  { time: '3:30 PM', name: 'HVAC Tune-up', color: '#22C55E' },
]

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #ffffff 0%, #F2FDFB 22%, #E6FAF6 45%, #F0FCFA 68%, #E8F9F5 100%)',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background light effects ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>

        {/* Sunlight glow — top center */}
        <div style={{ position: 'absolute', top: '-18%', left: '30%', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, rgba(200,245,238,0.6) 40%, transparent 70%)', filter: 'blur(40px)', transform: 'translateX(-50%)' }} />

        {/* Ocean aqua bloom — left */}
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.55, 0.8, 0.55] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '-12%', top: '25%', width: 520, height: 420, background: 'radial-gradient(ellipse, rgba(32,178,170,0.18) 0%, rgba(32,178,170,0.04) 55%, transparent 75%)', borderRadius: '50%', filter: 'blur(30px)' }}
        />

        {/* Ocean aqua bloom — right */}
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          style={{ position: 'absolute', right: '-8%', top: '40%', width: 400, height: 380, background: 'radial-gradient(ellipse, rgba(32,178,170,0.14) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(28px)' }}
        />

        {/* Bright seafoam bottom */}
        <motion.div
          animate={{ scale: [1, 1.06, 1], opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
          style={{ position: 'absolute', bottom: '-10%', left: '25%', width: 600, height: 280, background: 'radial-gradient(ellipse, rgba(20,195,185,0.15) 0%, transparent 65%)', borderRadius: '50%', filter: 'blur(36px)' }}
        />

        {/* Sunlight streaks — diagonal */}
        <div style={{ position: 'absolute', top: '-15%', left: '15%', width: 3, height: '90%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(200,245,238,0.5) 30%, rgba(255,255,255,0) 100%)', transform: 'rotate(18deg)', filter: 'blur(6px)' }} />
        <div style={{ position: 'absolute', top: '-10%', left: '45%', width: 2, height: '75%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(180,240,234,0.4) 40%, rgba(255,255,255,0) 100%)', transform: 'rotate(-8deg)', filter: 'blur(4px)' }} />
        <div style={{ position: 'absolute', top: '5%', right: '22%', width: 2, height: '65%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(180,240,234,0.3) 45%, rgba(255,255,255,0) 100%)', transform: 'rotate(6deg)', filter: 'blur(5px)' }} />

        {/* Bottom wave SVGs */}
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%' }} viewBox="0 0 1440 100" preserveAspectRatio="none" height="100">
          <path d="M0,55 C320,10 680,80 1000,50 C1180,32 1340,62 1440,48 L1440,100 L0,100 Z" fill="rgba(32,178,170,0.09)" />
          <path d="M0,72 C380,38 740,82 1100,65 C1270,56 1390,72 1440,68 L1440,100 L0,100 Z" fill="rgba(32,178,170,0.05)" />
        </svg>

        {/* Subtle dot accent — top left */}
        <div style={{ position: 'absolute', top: 28, left: 28, opacity: 0.15 }}>
          {[0,1,2,3].map(r => (
            <div key={r} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              {[0,1,2,3].map(c => <div key={c} style={{ width: 3, height: 3, borderRadius: '50%', background: '#18AFA8' }} />)}
            </div>
          ))}
        </div>

        {/* Very faint grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(10,168,159,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,168,159,0.04) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
      </div>

      {/* ══ LEFT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '52px 56px', position: 'relative', zIndex: 1, minWidth: 0 }}
      >
        {/* Logo */}
        <motion.a
          href="/"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45 }}
          whileHover={{ scale: 1.03 }}
          style={{ display: 'block', marginBottom: 42, textDecoration: 'none', width: 'fit-content' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={310}
            height={100}
            style={{ objectFit: 'contain', filter: 'brightness(1.05) drop-shadow(0 4px 20px rgba(10,168,159,0.28))' }}
          />
        </motion.a>

        {/* Headline */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17, duration: 0.5 }}>
          <h1 style={{ fontSize: 'clamp(26px, 2.8vw, 40px)', fontWeight: 900, color: '#0B1F3A', lineHeight: 1.14, letterSpacing: '-0.035em', margin: '0 0 11px' }}>
            Your AI receptionist<br />
            <span style={{ color: '#0AA89F' }}>is ready.</span>
          </h1>
          <p style={{ color: '#4A7A80', fontSize: 14, lineHeight: 1.7, maxWidth: 360, margin: '0 0 30px' }}>
            BellAveGo answers calls, books jobs, sends invoices, and helps grow your service business.
          </p>
        </motion.div>

        {/* Floating dashboard preview cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.55 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420, marginBottom: 22 }}
        >
          {/* Live feed */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.18)', borderRadius: 16, padding: '14px 16px', boxShadow: '0 6px 28px rgba(10,168,159,0.1), 0 2px 8px rgba(11,31,58,0.05)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <motion.div animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 7px rgba(34,197,94,0.6)' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#0B1F3A', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Live Activity</span>
            </div>
            <LiveFeed />
          </motion.div>

          {/* Stats + schedule row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.15)', borderRadius: 14, padding: '13px 14px', boxShadow: '0 4px 20px rgba(10,168,159,0.09), 0 1px 4px rgba(11,31,58,0.05)' }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Today</div>
              {[
                { label: '38 calls answered', color: '#0AA89F' },
                { label: '14 jobs booked', color: '#22C55E' },
                { label: '$12,480 revenue', color: '#F59E0B' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#0B1F3A', fontWeight: 600 }}>{s.label}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              style={{ background: '#ffffff', border: '1px solid rgba(10,168,159,0.15)', borderRadius: 14, padding: '13px 14px', boxShadow: '0 4px 20px rgba(10,168,159,0.09), 0 1px 4px rgba(11,31,58,0.05)' }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Schedule</div>
              {SCHEDULE.map(s => (
                <div key={s.time} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#2D5A62', fontWeight: 500 }}>{s.time}</span>
                  <span style={{ fontSize: 10, color: '#7AAAB2' }}>{s.name}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </motion.div>

        {/* Feature bullets */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.5 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 7, maxWidth: 420 }}
        >
          {BULLETS.map((b, i) => (
            <motion.div
              key={b.text}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.42 + i * 0.06, duration: 0.38 }}
              whileHover={{ x: 4, boxShadow: '0 6px 24px rgba(10,168,159,0.14)' }}
              style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#ffffff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 11, padding: '10px 14px', boxShadow: '0 2px 10px rgba(11,31,58,0.05)', cursor: 'default' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(10,168,159,0.1)', border: '1px solid rgba(10,168,159,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                {b.icon}
              </div>
              <span style={{ fontSize: 13, color: '#0B1F3A', fontWeight: 600 }}>{b.text}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.72 }} style={{ margin: '18px 0 0', fontSize: 11, color: '#8ABAB8' }}>
          $97/mo · No contracts · Cancel anytime
        </motion.p>
      </motion.div>

      {/* ══ RIGHT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.12 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(10,168,159,0.12)' }}
      >
        {/* Soft aqua glow behind card */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, height: 380, background: 'radial-gradient(ellipse, rgba(32,178,170,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignIn appearance={clerkAppearance} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.45 }}
          style={{ marginTop: 26, textAlign: 'center', maxWidth: 360 }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: '#3D6A70', marginBottom: 5 }}>
            Built for service businesses doing $100k–$4M/year.
          </p>
          <p style={{ fontSize: 11, color: '#8ABAB8', lineHeight: 1.65, margin: '0 0 14px' }}>
            Designed for HVAC, plumbing, electrical, cleaning,<br />and home service companies.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            {['⚡', '❄️', '🪠', '🧹', '🔨'].map(e => (
              <span key={e} style={{ fontSize: 18, opacity: 0.35 }}>{e}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
