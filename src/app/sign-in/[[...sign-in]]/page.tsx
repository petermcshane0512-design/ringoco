'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { SignIn } from '@clerk/nextjs'
import { motion, AnimatePresence } from 'framer-motion'

/* ─── Live activity feed cycling ─── */
const ACTIVITY = [
  { icon: '📞', title: 'AI answered missed call', sub: 'Marcus T. · HVAC repair · just now', color: '#18AFA8' },
  { icon: '📅', title: 'Job booked automatically', sub: 'Diane R. · Plumbing · 10:30 AM today', color: '#22C55E' },
  { icon: '💬', title: 'SMS confirmation sent', sub: '"Your tech is on the way!" · Kevin S.', color: '#6366F1' },
  { icon: '💰', title: 'Invoice paid · $475', sub: 'Same-day collection · Tom H.', color: '#F59E0B' },
  { icon: '📊', title: 'Consulting report ready', sub: 'May BellAveGo Business Insights', color: '#18AFA8' },
]

function LiveFeed() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % ACTIVITY.length), 2800)
    return () => clearInterval(id)
  }, [])
  const item = ACTIVITY[idx]
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'rgba(255,255,255,0.04)',
          border: `1px solid ${item.color}30`,
          borderRadius: 12, padding: '11px 14px',
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${item.color}18`, border: `1px solid ${item.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
          {item.icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
        </div>
        <div style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}`, flexShrink: 0 }} />
      </motion.div>
    </AnimatePresence>
  )
}

/* ─── iMessage-style SMS card ─── */
function SMSCard() {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 900); return () => clearTimeout(t) }, [])
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '14px 16px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', letterSpacing: '0.07em', textTransform: 'uppercase' }}>AI Transcript · Marcus T.</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {[
          { role: 'ai', msg: 'Hi! Thanks for calling Mike\'s HVAC — I\'m Bell, your AI assistant.' },
          { role: 'customer', msg: 'My AC stopped working. Can someone come today?' },
          { role: 'ai', msg: 'Absolutely! I\'ve booked you for 8 AM. Confirmation text on its way! ✓' },
        ].map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: line.role === 'ai' ? -12 : 12 }}
            animate={show ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.22, duration: 0.35 }}
            style={{ display: 'flex', justifyContent: line.role === 'ai' ? 'flex-start' : 'flex-end' }}
          >
            <div style={{
              maxWidth: '80%', padding: '7px 11px', borderRadius: line.role === 'ai' ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
              background: line.role === 'ai' ? 'rgba(24,175,168,0.15)' : 'rgba(34,197,94,0.2)',
              border: `1px solid ${line.role === 'ai' ? 'rgba(24,175,168,0.25)' : 'rgba(34,197,94,0.3)'}`,
              fontSize: 11, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5,
            }}>
              {line.msg}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ─── Stat pills ─── */
function StatPills() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {[
        { icon: '📞', label: '38 calls answered', color: '#18AFA8' },
        { icon: '💰', label: '$12,480 this month', color: '#22C55E' },
        { icon: '📅', label: '14 jobs booked', color: '#6366F1' },
        { icon: '🛡️', label: '22 missed → saved', color: '#F59E0B' },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', border: `1px solid ${s.color}22`, borderRadius: 10, padding: '8px 10px' }}>
          <span style={{ fontSize: 13 }}>{s.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Clerk appearance ─── */
const clerkAppearance = {
  variables: {
    colorPrimary: '#22C55E',
    colorBackground: 'rgba(7,27,58,0.01)',
    colorText: '#ffffff',
    colorTextSecondary: 'rgba(255,255,255,0.52)',
    colorInputBackground: 'rgba(255,255,255,0.07)',
    colorInputText: '#ffffff',
    borderRadius: '12px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    card: {
      background: 'rgba(8,30,65,0.72)',
      backdropFilter: 'blur(28px)',
      WebkitBackdropFilter: 'blur(28px)',
      border: '1px solid rgba(24,175,168,0.2)',
      boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(24,175,168,0.06), inset 0 1px 0 rgba(255,255,255,0.06)',
      borderRadius: '20px',
    },
    formButtonPrimary: {
      background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
      fontSize: '15px',
      fontWeight: '800',
      letterSpacing: '-0.01em',
      boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
      transition: 'all 0.2s ease',
    },
    footerActionLink: { color: '#18AFA8', fontWeight: '600' },
    headerTitle: { color: '#ffffff', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em' },
    headerSubtitle: { color: 'rgba(255,255,255,0.45)' },
    socialButtonsBlockButton: {
      border: '1px solid rgba(255,255,255,0.12)',
      color: '#fff',
      background: 'rgba(255,255,255,0.05)',
      backdropFilter: 'blur(8px)',
    },
    dividerLine: { background: 'rgba(255,255,255,0.08)' },
    dividerText: { color: 'rgba(255,255,255,0.3)' },
    formFieldLabel: { color: 'rgba(255,255,255,0.6)' },
    formFieldInput: { color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
    identityPreviewText: { color: '#fff' },
    identityPreviewEditButton: { color: '#18AFA8' },
  },
}

/* ─── Glow blob ─── */
function GlowBlob({ x, y, size, color, delay = 0 }: { x: string; y: string; size: number; color: string; delay?: number }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.75, 0.5] }}
      transition={{ duration: 7 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
      style={{
        position: 'absolute', left: x, top: y,
        width: size, height: size,
        background: color,
        borderRadius: '50%',
        filter: `blur(${size * 0.45}px)`,
        pointerEvents: 'none',
      }}
    />
  )
}

const BULLETS = [
  { icon: '📞', text: 'AI answers missed calls after 12 seconds' },
  { icon: '📅', text: 'Appointments booked directly into your calendar' },
  { icon: '💰', text: 'Invoicing + same-day payment collection' },
  { icon: '📊', text: 'Revenue dashboard + BellAveGo consulting insights' },
]

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #020C1B 0%, #071828 35%, #0A2240 60%, #071B3A 85%, #040F1F 100%)',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Glow blobs ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <GlowBlob x="8%" y="15%" size={420} color="rgba(24,175,168,0.13)" delay={0} />
        <GlowBlob x="60%" y="-5%" size={360} color="rgba(24,175,168,0.09)" delay={2} />
        <GlowBlob x="75%" y="55%" size={280} color="rgba(34,197,94,0.06)" delay={4} />
        <GlowBlob x="-5%" y="65%" size={340} color="rgba(24,175,168,0.08)" delay={1.5} />
        <GlowBlob x="40%" y="70%" size={220} color="rgba(99,102,241,0.07)" delay={3} />

        {/* Sunlight-through-water streaks */}
        <div style={{ position: 'absolute', top: '-10%', left: '20%', width: 2, height: '80%', background: 'linear-gradient(to bottom, transparent, rgba(24,175,168,0.06), transparent)', transform: 'rotate(15deg)', filter: 'blur(3px)' }} />
        <div style={{ position: 'absolute', top: '-10%', left: '55%', width: 1, height: '70%', background: 'linear-gradient(to bottom, transparent, rgba(24,175,168,0.04), transparent)', transform: 'rotate(-8deg)', filter: 'blur(2px)' }} />
        <div style={{ position: 'absolute', top: '10%', right: '18%', width: 2, height: '60%', background: 'linear-gradient(to bottom, transparent, rgba(24,175,168,0.05), transparent)', transform: 'rotate(5deg)', filter: 'blur(4px)' }} />

        {/* Grid texture — very faint */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(24,175,168,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(24,175,168,0.028) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />
      </div>

      {/* ══ LEFT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '52px 56px', position: 'relative', zIndex: 1, minWidth: 0 }}
      >
        {/* Logo */}
        <motion.a
          href="/"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{ display: 'block', marginBottom: 44, textDecoration: 'none' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={320}
            height={104}
            style={{
              objectFit: 'contain',
              filter: 'brightness(1.35) drop-shadow(0 0 18px rgba(24,175,168,0.5)) drop-shadow(0 0 6px rgba(24,175,168,0.3))',
            }}
          />
        </motion.a>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <h1 style={{ fontSize: 'clamp(24px, 2.6vw, 38px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Your AI receptionist<br />
            <span style={{ background: 'linear-gradient(90deg, #18AFA8, #4DD9D2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              is waiting for you.
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.65, maxWidth: 340, margin: '0 0 28px' }}>
            Sign in to access your dashboard, live call logs, and the AI that runs your front desk 24/7.
          </p>
        </motion.div>

        {/* Dashboard preview stack */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24, maxWidth: 400 }}
        >
          {/* Live feed card */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <motion.div
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 7px #22C55E' }}
              />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Live Activity</span>
            </div>
            <LiveFeed />
          </div>

          {/* Stat pills */}
          <StatPills />

          {/* SMS transcript */}
          <SMSCard />
        </motion.div>

        {/* Feature bullets */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400 }}
        >
          {BULLETS.map((b, i) => (
            <motion.div
              key={b.text}
              whileHover={{ x: 4, background: 'rgba(24,175,168,0.08)' }}
              transition={{ duration: 0.18 }}
              style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '9px 13px', cursor: 'default' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(24,175,168,0.12)', border: '1px solid rgba(24,175,168,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                {b.icon}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.68)', fontWeight: 500 }}>{b.text}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Fine print */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{ margin: '22px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.2)' }}
        >
          $97/mo · No contracts · Cancel anytime
        </motion.p>
      </motion.div>

      {/* ══ RIGHT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(255,255,255,0.05)' }}
      >
        {/* Subtle glow behind card */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, height: 360, background: 'radial-gradient(ellipse, rgba(24,175,168,0.09) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignIn appearance={clerkAppearance} />
        </div>

        {/* Social proof */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          style={{ marginTop: 28, textAlign: 'center', maxWidth: 360 }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
            Built for service businesses doing $100k–$4M/year.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6, margin: 0 }}>
            Trusted by electricians, HVAC, plumbing, cleaning,<br />and home service companies.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            {['⚡', '❄️', '🪠', '🧹', '🔨'].map(e => (
              <span key={e} style={{ fontSize: 18, opacity: 0.35 }}>{e}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>

    </div>
  )
}
