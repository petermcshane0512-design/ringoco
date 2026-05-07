'use client'
import Image from 'next/image'
import { SignIn } from '@clerk/nextjs'
import { motion } from 'framer-motion'

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
        <div style={{ position: 'absolute', top: '-18%', left: '30%', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(255,255,255,0.95) 0%, rgba(200,245,238,0.6) 40%, transparent 70%)', filter: 'blur(40px)', transform: 'translateX(-50%)' }} />
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.55, 0.8, 0.55] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: '-12%', top: '25%', width: 520, height: 420, background: 'radial-gradient(ellipse, rgba(32,178,170,0.18) 0%, rgba(32,178,170,0.04) 55%, transparent 75%)', borderRadius: '50%', filter: 'blur(30px)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          style={{ position: 'absolute', right: '-8%', top: '40%', width: 400, height: 380, background: 'radial-gradient(ellipse, rgba(32,178,170,0.14) 0%, transparent 70%)', borderRadius: '50%', filter: 'blur(28px)' }}
        />
        <div style={{ position: 'absolute', top: '-15%', left: '15%', width: 3, height: '90%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(200,245,238,0.5) 30%, rgba(255,255,255,0) 100%)', transform: 'rotate(18deg)', filter: 'blur(6px)' }} />
        <div style={{ position: 'absolute', top: '-10%', left: '45%', width: 2, height: '75%', background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(180,240,234,0.4) 40%, rgba(255,255,255,0) 100%)', transform: 'rotate(-8deg)', filter: 'blur(4px)' }} />
        <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%' }} viewBox="0 0 1440 100" preserveAspectRatio="none" height="100">
          <path d="M0,55 C320,10 680,80 1000,50 C1180,32 1340,62 1440,48 L1440,100 L0,100 Z" fill="rgba(32,178,170,0.09)" />
          <path d="M0,72 C380,38 740,82 1100,65 C1270,56 1390,72 1440,68 L1440,100 L0,100 Z" fill="rgba(32,178,170,0.05)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(10,168,159,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,168,159,0.04) 1px, transparent 1px)', backgroundSize: '56px 56px' }} />
      </div>

      {/* ══ LEFT — Logo only ══ */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}
      >
        <motion.a
          href="/"
          whileHover={{ scale: 1.04 }}
          transition={{ duration: 0.22 }}
          style={{ textDecoration: 'none', display: 'block' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={520}
            height={168}
            style={{
              objectFit: 'contain',
              filter: 'brightness(1.05) drop-shadow(0 8px 32px rgba(10,168,159,0.3))',
            }}
          />
        </motion.a>
      </motion.div>

      {/* ══ RIGHT — Form ══ */}
      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        style={{ width: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 44px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(10,168,159,0.12)' }}
      >
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, height: 380, background: 'radial-gradient(ellipse, rgba(32,178,170,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ width: '100%', position: 'relative', zIndex: 1 }}>
          <SignIn appearance={clerkAppearance} />
        </div>
      </motion.div>
    </div>
  )
}
