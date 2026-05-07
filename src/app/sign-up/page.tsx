'use client'
import Image from 'next/image'
import { SignUp } from '@clerk/nextjs'
import { motion } from 'framer-motion'

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
    },
    footerActionLink: { color: '#18AFA8', fontWeight: '600' },
    headerTitle: { color: '#ffffff', fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em' },
    headerSubtitle: { color: 'rgba(255,255,255,0.45)' },
    socialButtonsBlockButton: {
      border: '1px solid rgba(255,255,255,0.12)',
      color: '#fff',
      background: 'rgba(255,255,255,0.05)',
    },
    dividerLine: { background: 'rgba(255,255,255,0.08)' },
    dividerText: { color: 'rgba(255,255,255,0.3)' },
    formFieldLabel: { color: 'rgba(255,255,255,0.6)' },
    formFieldInput: { color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
    identityPreviewText: { color: '#fff' },
    identityPreviewEditButton: { color: '#18AFA8' },
  },
}

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
  { icon: '📞', text: 'Custom AI receptionist built for your business' },
  { icon: '📅', text: 'Automatic job booking + SMS confirmations' },
  { icon: '💰', text: 'Invoicing + same-day payment collection' },
  { icon: '📊', text: '5 BellAveGo consulting reports per year' },
]

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #020C1B 0%, #071828 35%, #0A2240 60%, #071B3A 85%, #040F1F 100%)',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <GlowBlob x="5%" y="10%" size={440} color="rgba(24,175,168,0.13)" delay={0} />
        <GlowBlob x="62%" y="-8%" size={380} color="rgba(24,175,168,0.09)" delay={2} />
        <GlowBlob x="72%" y="58%" size={300} color="rgba(34,197,94,0.06)" delay={4} />
        <GlowBlob x="-4%" y="62%" size={340} color="rgba(24,175,168,0.08)" delay={1.5} />
        <div style={{ position: 'absolute', top: '-10%', left: '22%', width: 2, height: '80%', background: 'linear-gradient(to bottom, transparent, rgba(24,175,168,0.06), transparent)', transform: 'rotate(14deg)', filter: 'blur(3px)' }} />
        <div style={{ position: 'absolute', top: '5%', right: '20%', width: 2, height: '65%', background: 'linear-gradient(to bottom, transparent, rgba(24,175,168,0.05), transparent)', transform: 'rotate(-7deg)', filter: 'blur(3px)' }} />
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

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.45 }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(24,175,168,0.1)', border: '1px solid rgba(24,175,168,0.28)', borderRadius: 20, padding: '5px 13px', marginBottom: 18, width: 'fit-content' }}
        >
          <motion.div
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            style={{ width: 5, height: 5, borderRadius: '50%', background: '#18AFA8' }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#18AFA8', letterSpacing: '0.09em', textTransform: 'uppercase' }}>14-Day Free Trial</span>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.6 }}
        >
          <h1 style={{ fontSize: 'clamp(24px, 2.6vw, 38px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, letterSpacing: '-0.03em', margin: '0 0 10px' }}>
            Stop losing jobs to<br />
            <span style={{ background: 'linear-gradient(90deg, #18AFA8, #4DD9D2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              missed calls.
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.65, maxWidth: 340, margin: '0 0 30px' }}>
            Set up your AI receptionist in 15 minutes. It answers, books, and texts your customers — while you stay on the job.
          </p>
        </motion.div>

        {/* Feature bullets */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.6 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400, marginBottom: 28 }}
        >
          {BULLETS.map(b => (
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

        {/* Testimonial-style quote */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px', maxWidth: 400 }}
        >
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: '0 0 8px', fontStyle: 'italic' }}>
            &ldquo;BellAveGo answered 38 calls last week while I was on job sites. Booked 11 of them. That&rsquo;s real money.&rdquo;
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(24,175,168,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#18AFA8' }}>M</div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Mike R. · HVAC contractor</span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          style={{ margin: '20px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.2)' }}
        >
          No credit card required · Setup in 15 min · Cancel anytime
        </motion.p>
      </motion.div>

      {/* ══ RIGHT PANEL ══ */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, height: 360, background: 'radial-gradient(ellipse, rgba(24,175,168,0.09) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignUp appearance={clerkAppearance} />
        </div>

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
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 14 }}>
            {['⚡', '❄️', '🪠', '🧹', '🔨'].map(e => (
              <span key={e} style={{ fontSize: 18, opacity: 0.35 }}>{e}</span>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
