'use client'
import Image from 'next/image'
import { SignUp } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorPrimary: '#22C55E',
    colorBackground: '#0D2847',
    colorText: '#ffffff',
    colorTextSecondary: 'rgba(255,255,255,0.52)',
    colorInputBackground: 'rgba(255,255,255,0.07)',
    colorInputText: '#ffffff',
    borderRadius: '10px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  elements: {
    card: {
      boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
    },
    formButtonPrimary: {
      background: '#22C55E',
      fontSize: '15px',
      fontWeight: '800',
      letterSpacing: '-0.01em',
    },
    footerActionLink: { color: '#18AFA8' },
    headerTitle: { color: '#ffffff', fontSize: '22px', fontWeight: '800' },
    headerSubtitle: { color: 'rgba(255,255,255,0.5)' },
    socialButtonsBlockButton: {
      border: '1px solid rgba(255,255,255,0.14)',
      color: '#fff',
      background: 'rgba(255,255,255,0.06)',
    },
    dividerLine: { background: 'rgba(255,255,255,0.1)' },
    dividerText: { color: 'rgba(255,255,255,0.32)' },
    formFieldLabel: { color: 'rgba(255,255,255,0.65)' },
    identityPreviewText: { color: '#fff' },
    identityPreviewEditButton: { color: '#18AFA8' },
  },
}

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#071B3A',
      display: 'flex',
      fontFamily: "'Inter', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* BG grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(24,175,168,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(24,175,168,0.07) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />
      {/* BG glow */}
      <div style={{ position: 'absolute', top: '40%', left: '28%', transform: 'translate(-50%,-50%)', width: 700, height: 500, background: 'radial-gradient(ellipse, rgba(24,175,168,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />

      {/* Left panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 64px', position: 'relative', zIndex: 1 }}>
        <a href="/" style={{ display: 'block', marginBottom: 52 }}>
          <Image src="/logo.png" alt="BellAveGo" width={260} height={84} style={{ objectFit: 'contain' }} />
        </a>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(24,175,168,0.12)', border: '1px solid rgba(24,175,168,0.3)', borderRadius: 20, padding: '5px 13px', marginBottom: 20, width: 'fit-content' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#18AFA8' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#18AFA8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>14-Day Free Trial</span>
        </div>
        <h1 style={{ fontSize: 'clamp(26px, 3vw, 40px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 14px' }}>
          Stop losing jobs to<br />
          <span style={{ color: '#18AFA8' }}>missed calls.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.65, maxWidth: 360, margin: '0 0 36px' }}>
          Set up your AI receptionist in 15 minutes. It answers, books, and texts your customers — while you work.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { icon: '📞', text: 'Custom AI receptionist built for your business' },
            { icon: '📅', text: 'Automatic job booking + SMS confirmations' },
            { icon: '💰', text: 'Invoicing + same-day payment collection' },
            { icon: '📊', text: '5 BellAveGo consulting reports per year' },
          ].map(f => (
            <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(24,175,168,0.12)', border: '1px solid rgba(24,175,168,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>
                {f.icon}
              </div>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>{f.text}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 40, paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', margin: 0 }}>No credit card required · Setup in 15 min · Cancel anytime</p>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', position: 'relative', zIndex: 1, borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
        <SignUp appearance={clerkAppearance} />
      </div>
    </div>
  )
}
