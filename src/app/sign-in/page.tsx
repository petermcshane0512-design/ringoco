'use client'
import Image from 'next/image'
import Link from 'next/link'
import { SignIn } from '@clerk/nextjs'
import { motion } from 'framer-motion'

const clerkAppearance = {
  variables: {
    colorPrimary: '#0AA89F',
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
      background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
      fontSize: '15px',
      fontWeight: '800',
      letterSpacing: '-0.01em',
      boxShadow: '0 4px 18px rgba(10,168,159,0.34)',
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

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #EBF8F4 0%, #F4FAF8 35%, #EDF7F3 65%, #D9EDE8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '40px 24px',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Background flourish */}
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
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}
      >
        {/* Logo */}
        <Link href="/" style={{ display: 'block', textAlign: 'center', marginBottom: 22, textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={200} height={65} style={{ objectFit: 'contain' }} />
        </Link>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(10,168,159,0.10)', border: '1px solid rgba(10,168,159,0.26)', borderRadius: 20, padding: '5px 12px', marginBottom: 14 }}>
            <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: '50%', background: '#0AA89F' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#0D8F87', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Welcome back</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.03em', marginBottom: 6 }}>
            Sign in to BellAveGo
          </h1>
          <p style={{ color: '#3D5A62', fontSize: 13, lineHeight: 1.55, margin: 0 }}>
            Pick up where you left off — calls, jobs, and reports await.
          </p>
        </div>

        <SignIn forceRedirectUrl="/dashboard" appearance={clerkAppearance} />

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#7AAAB2' }}>
          New here?{' '}
          <Link href="/sign-up" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>
            Create an account →
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
