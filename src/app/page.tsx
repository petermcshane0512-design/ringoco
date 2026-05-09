'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth, SignOutButton } from '@clerk/nextjs'
import DashboardPreview from '@/components/DashboardPreview'

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const [logoHovered, setLogoHovered] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let animId: number
    let t = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    const wave = (yFrac: number, amp: number, period: number, spd: number, color: string, alpha: number) => {
      const W = canvas.width, H = canvas.height
      ctx.beginPath()
      for (let x = 0; x <= W + 4; x += 3) {
        const y = H * yFrac
          + Math.sin((x / period) + t * spd) * amp
          + Math.sin((x / (period * 0.58)) + t * spd * 1.45) * amp * 0.38
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath()
      ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1
    }

    const draw = () => {
      const W = canvas.width, H = canvas.height
      t += 0.007

      // Sky — deep navy to warm sunset at horizon
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.67)
      sky.addColorStop(0,    '#060f1d')
      sky.addColorStop(0.42, '#0b1e35')
      sky.addColorStop(0.78, '#5c1f0e')
      sky.addColorStop(1,    '#d45a10')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)

      // Sun glow at horizon
      const sx = W * 0.38, sy = H * 0.67
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, W * 0.26)
      glow.addColorStop(0,   'rgba(255,195,55,0.30)')
      glow.addColorStop(0.4, 'rgba(240,100,15,0.12)')
      glow.addColorStop(1,   'rgba(0,0,0,0)')
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)

      // Stars — blink gently
      const starSeeds = [[.04,.07],[.11,.14],[.17,.04],[.24,.17],[.54,.05],[.62,.11],[.69,.03],[.77,.18],[.84,.07],[.91,.13],[.07,.27],[.47,.21],[.33,.09],[.58,.24],[.73,.12]]
      starSeeds.forEach(([sx2, sy2]) => {
        const b = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + sx2 * 28))
        ctx.globalAlpha = b * 0.85
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(sx2 * W, sy2 * H * 0.67, 1.3, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1

      // Ocean base
      const ocean = ctx.createLinearGradient(0, H * 0.66, 0, H)
      ocean.addColorStop(0, '#0c3a56'); ocean.addColorStop(0.5, '#082840'); ocean.addColorStop(1, '#03192b')
      ctx.fillStyle = ocean; ctx.fillRect(0, H * 0.66, W, H)

      // Sun reflection strip on water
      ctx.save()
      ctx.beginPath(); ctx.rect(W * 0.24, H * 0.66, W * 0.27, H); ctx.clip()
      const refl = ctx.createLinearGradient(0, H * 0.66, 0, H)
      refl.addColorStop(0, 'rgba(255,160,40,0.20)'); refl.addColorStop(1, 'rgba(255,110,15,0.03)')
      ctx.fillStyle = refl; ctx.fillRect(0, H * 0.66, W, H); ctx.restore()

      // Wave layers — back to front
      wave(0.775, 10, 210, 0.85, '#0a5078', 0.82)
      wave(0.820, 12, 260, 0.68, '#0d6592', 0.72)
      wave(0.860, 14, 175, 1.05, '#1478a8', 0.62)
      wave(0.900,  8, 135, 1.55, '#2292c4', 0.48)
      // foam highlights on crest
      wave(0.770, 10, 210, 0.85, 'rgba(255,255,255,0.07)', 1)
      wave(0.855, 14, 175, 1.05, 'rgba(255,255,255,0.06)', 1)

      animId = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    draw()
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 48px', height: 72, background: '#fff', borderBottom: '1px solid #DCE9E2', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100 }}>
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onMouseEnter={() => setLogoHovered(true)}
          onMouseLeave={() => setLogoHovered(false)}
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', cursor: 'pointer' }}
        >
          <Image
            src="/logo.png"
            alt="BellAveGo"
            width={665}
            height={210}
            style={{
              objectFit: 'contain',
              marginTop: 10,
              transform: logoHovered ? 'scale(1.08)' : 'scale(1)',
              filter: logoHovered ? 'drop-shadow(0 0 14px rgba(24,175,168,0.55))' : 'none',
              transition: 'transform 0.25s ease, filter 0.25s ease',
            }}
          />
        </a>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSignedIn ? (
            <>
              <SignOutButton redirectUrl="/">
                <button style={{ padding: '8px 18px', border: '1.5px solid #DCE9E2', borderRadius: 8, background: 'transparent', color: '#4A6670', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Sign out
                </button>
              </SignOutButton>
              <Link href="/dashboard" className="dash-pulse" style={{ padding: '10px 22px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/sign-in" style={{ padding: '10px 22px', border: '1.5px solid #DCE9E2', borderRadius: 8, textDecoration: 'none', color: '#4A6670', fontSize: 14, fontWeight: 500 }}>
                Sign in
              </Link>
              <Link href="/sign-up" className="cta-pulse" style={{ padding: '10px 22px', background: '#22C55E', borderRadius: 8, textDecoration: 'none', color: '#fff', fontSize: 14, fontWeight: 800 }}>
                Start Free Trial
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 72, position: 'relative' }}>
        <style>{`
          @keyframes scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
          @keyframes ctaGlow {
            0%, 100% { box-shadow: 0 4px 18px rgba(34,197,94,0.42), 0 0 30px rgba(34,197,94,0.24); }
            50%       { box-shadow: 0 6px 32px rgba(34,197,94,0.65), 0 0 56px rgba(34,197,94,0.42); }
          }
          .cta-pulse {
            animation: ctaGlow 2.5s ease-in-out infinite;
            transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.28s ease;
            will-change: transform, box-shadow;
          }
          .cta-pulse:hover {
            animation-play-state: paused;
            transform: scale(1.06) translateY(-3px) !important;
            box-shadow: 0 10px 44px rgba(34,197,94,0.72), 0 0 70px rgba(34,197,94,0.52) !important;
            filter: brightness(1.12) !important;
          }
          .lp-hero-cta {
            position: absolute;
            left: 4%;
            top: 60%;
            width: 15%;
            height: 11%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #22C55E 0%, #15A34A 100%);
            border-radius: 10px;
            text-decoration: none;
            color: #fff;
            font-weight: 800;
            font-size: clamp(10px, 1.15vw, 16px);
            letter-spacing: -0.2px;
            border: none;
            cursor: pointer;
            gap: 6px;
          }
          .lp-hero-cta:hover {
            text-decoration: none;
            color: #fff;
          }
          .lp-card-wrap {
            transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.24s ease;
            position: relative;
            z-index: 1;
          }
          .lp-card-wrap:hover {
            transform: scale(1.07);
            filter: drop-shadow(0 6px 22px rgba(10,168,159,0.52)) drop-shadow(0 0 12px rgba(255,255,255,0.45));
            z-index: 10;
          }
          @keyframes dashGlow {
            0%, 100% { box-shadow: 0 4px 16px rgba(10,168,159,0.45), 0 0 28px rgba(10,168,159,0.28); }
            50%       { box-shadow: 0 4px 26px rgba(10,168,159,0.68), 0 0 48px rgba(10,168,159,0.42); }
          }
          .dash-pulse {
            animation: dashGlow 2.5s ease-in-out infinite;
            transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.28s ease;
            will-change: transform, box-shadow;
          }
          .dash-pulse:hover {
            animation-play-state: paused;
            transform: scale(1.06) translateY(-2px) !important;
            box-shadow: 0 8px 36px rgba(10,168,159,0.75), 0 0 60px rgba(10,168,159,0.5) !important;
            filter: brightness(1.12) !important;
          }
        `}</style>
        <div style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
          {/* Animated beach hero — replaces static Landing Page 1.png */}
          <div style={{ position: 'relative', width: '100%', aspectRatio: '1440/480', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
            <div style={{ position: 'absolute', top: '12%', left: '4%', width: '46%', zIndex: 2 }}>
              <p style={{ fontSize: 'clamp(9px, 0.85vw, 13px)', fontWeight: 700, color: 'rgba(255,185,55,0.92)', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: '4%', margin: '0 0 4% 0' }}>
                AI Receptionist · 24/7
              </p>
              <h1 style={{ fontSize: 'clamp(17px, 2.9vw, 48px)', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 3% 0', textShadow: '0 2px 28px rgba(0,0,0,0.65)' }}>
                Stop losing jobs<br />to missed calls.
              </h1>
              <p style={{ fontSize: 'clamp(9px, 0.9vw, 14px)', color: 'rgba(255,255,255,0.58)', lineHeight: 1.65, margin: 0 }}>
                BellAveGo answers when you can't, books the job,<br />and texts your customer — automatically.
              </p>
            </div>
          </div>
          <Link
            href={isSignedIn ? '/dashboard' : '/sign-up'}
            className={`lp-hero-cta ${isSignedIn ? 'dash-pulse' : 'cta-pulse'}`}
            style={isSignedIn ? { background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)' } : undefined}
          >
            {isSignedIn ? 'Dashboard' : 'Start Free Trial'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>

          {/* Notification cards — right side */}
          <div style={{
            position: 'absolute',
            top: '3%',
            right: '2%',
            width: '26%',
            height: '92%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'space-between',
            pointerEvents: 'none',
          }}>
            {[
              { src: '/LP1.png', alt: 'Missed call notification', w: 440, h: 100 },
              { src: '/LP2.png', alt: 'BellAveGo answered in 12s', w: 440, h: 90 },
              { src: '/LP3.png', alt: 'AI text summary', w: 440, h: 140 },
              { src: '/LP4.png', alt: 'Potential revenue', w: 440, h: 100 },
            ].reduce<React.ReactNode[]>((acc, card, i, arr) => {
              acc.push(
                <div key={card.src} className="lp-card-wrap" style={{ pointerEvents: 'auto' }}>
                  <Image src={card.src} alt={card.alt} width={card.w} height={card.h}
                    style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }} />
                </div>
              )
              if (i < arr.length - 1) acc.push(
                <div key={`arrow-${i}`} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0AA89F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.75 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
              )
              return acc
            }, [])}
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <div id="lp-preview"><DashboardPreview /></div>

      {/* CONSULTING PREVIEW */}
      <section style={{ background: 'linear-gradient(180deg, #EBF7F3 0%, #F5FCFA 100%)', padding: '72px 48px 80px', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Included in your plan</p>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-1px', marginBottom: 12 }}>
              5 expert consulting reports a year.
            </h2>
            <p style={{ fontSize: 16, color: '#4A7A80', maxWidth: 520, margin: '0 auto' }}>
              AI-powered market research and local intelligence — delivered as a polished PDF — to help your business grow faster.
            </p>
          </div>
          <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(7,27,58,0.12)', border: '1px solid rgba(10,168,159,0.14)' }}>
            <Image
              src="/Consulting1.png"
              alt="BellAveGo Consulting Report"
              width={1400}
              height={900}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section style={{ background: '#F2F9F5', borderBottom: '1px solid #D4E6DC', padding: '28px 0 0' }}>
        <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#5A8A92', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 18 }}>Built for home service businesses</p>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', width: 'max-content', animation: 'scroll 25s linear infinite', paddingBottom: 26 }}>
            {[...Array(2)].map((_, repeat) => (
              <div key={repeat} style={{ display: 'flex' }}>
                {[
                  { icon: '❄️', label: 'HVAC' }, { icon: '🪠', label: 'Plumbing' }, { icon: '⚡', label: 'Electrical' },
                  { icon: '🧹', label: 'Cleaning' }, { icon: '🌿', label: 'Landscaping' }, { icon: '🔨', label: 'Handyman' },
                  { icon: '🏠', label: 'Roofing' }, { icon: '🔧', label: 'Appliance Repair' }, { icon: '🚗', label: 'Auto Detailing' },
                  { icon: '🐾', label: 'Pet Services' }, { icon: '💧', label: 'Pool & Spa' }, { icon: '🪟', label: 'Window Cleaning' },
                ].map(s => (
                  <div key={s.label + repeat} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 28px', borderRight: '1px solid #D4E6DC', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#3D5A62' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JOB SITE */}
      <section style={{ padding: '72px 48px', background: '#EAF5F0', borderBottom: '1px solid #D4E6DC' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Built for the job site</p>
            <h2 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px', color: '#0B1F3A', marginBottom: 12 }}>
              You stay on the job.<br />
              <span style={{ color: '#20B2AA' }}>BellAveGo handles the front desk.</span>
            </h2>
            <p style={{ color: '#3D5A62', fontSize: 17, maxWidth: 500, margin: '0 auto' }}>
              While you&apos;re working, driving, or finishing a job, BellAveGo answers the call, books the appointment, and texts the customer.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 36 }}>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/customer.png" alt="Contractor on the job" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>💬 Customer gets handled instantly</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Booked, confirmed, and reminded automatically.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', boxShadow: '0 16px 50px rgba(11,31,58,0.13)' }}>
              <Image src="/electrician.png" alt="Customer getting confirmation" width={600} height={420} style={{ width: '100%', height: 340, objectFit: 'cover', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(11,31,58,0.88) 0%, transparent 100%)', padding: '36px 26px 22px' }}>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📍 Contractor can&apos;t answer</p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '5px 0 0' }}>Phone rings while you&apos;re on the job.</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {[
              { icon: '📞', title: 'BellAveGo answers', desc: 'Every call, every time — 24/7' },
              { icon: '📅', title: 'Job gets booked', desc: 'Added to your schedule instantly' },
              { icon: '💬', title: 'Customer texted', desc: 'Confirmation + reminder, automatic' },
            ].map(s => (
              <div key={s.title} style={{ background: '#fff', border: '1px solid #D4E6DC', borderRadius: 14, padding: '26px 22px', textAlign: 'center', boxShadow: '0 2px 14px rgba(32,178,170,0.07)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{s.icon}</div>
                <p style={{ fontWeight: 800, fontSize: 15, marginBottom: 6, color: '#0B1F3A' }}>{s.title}</p>
                <p style={{ color: '#4A6670', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '72px 48px', background: '#F2F9F5', borderBottom: '1px solid #D4E6DC', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#20B2AA', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>Simple pricing</p>
        <h2 style={{ fontSize: 42, fontWeight: 900, marginBottom: 8, letterSpacing: '-1.5px', color: '#0B1F3A' }}>One price. Everything included.</h2>
        <p style={{ color: '#4A6670', fontSize: 16, marginBottom: 48 }}>Your first booked job pays for the whole month.</p>
        <div style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', borderRadius: 24, padding: '48px 42px', maxWidth: 450, margin: '0 auto', boxShadow: '0 24px 80px rgba(11,31,58,0.22)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 3, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: 'rgba(255,255,255,0.35)', marginTop: 16 }}>$</span>
            <span style={{ fontSize: 88, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-3px' }}>147</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.38)', marginBottom: 32, fontSize: 14 }}>per month · no contracts</p>
          <div style={{ textAlign: 'left', marginBottom: 32 }}>
            {[
              { text: 'Custom AI receptionist built for your business', highlight: false },
              { text: 'AI answers missed calls after 12 seconds', highlight: false },
              { text: '24/7 call summaries + scheduling', highlight: false },
              { text: 'SMS confirmations, reminders + follow-ups', highlight: false },
              { text: 'Invoicing + same-day payment collection', highlight: false },
              { text: '5 BELLAVEGO CONSULTING REPORTS A YEAR', highlight: true },
              { text: 'Revenue dashboard + business insights', highlight: false },
              { text: 'Customer database + call history', highlight: false },
              { text: 'Google review request automation', highlight: false },
            ].map(f => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.07)', background: f.highlight ? 'rgba(24,175,168,0.08)' : 'transparent', marginLeft: f.highlight ? -8 : 0, marginRight: f.highlight ? -8 : 0, paddingLeft: f.highlight ? 8 : 0, paddingRight: f.highlight ? 8 : 0, borderRadius: f.highlight ? 6 : 0 }}>
                <div style={{ width: 19, height: 19, background: f.highlight ? '#18AFA8' : '#22C55E', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>✓</span>
                </div>
                <span style={{ fontSize: 14, color: f.highlight ? '#18AFA8' : 'rgba(255,255,255,0.8)', fontWeight: f.highlight ? 700 : 400, letterSpacing: f.highlight ? '0.02em' : 'normal' }}>{f.text}</span>
              </div>
            ))}
          </div>
          {isSignedIn ? (
            <Link href="/dashboard" className="dash-pulse" style={{ display: 'block', width: '100%', padding: '17px', textAlign: 'center', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 15 }}>
              Dashboard →
            </Link>
          ) : (
            <Link href="/sign-up" className="cta-pulse" style={{ display: 'block', width: '100%', padding: '17px', textAlign: 'center', background: '#22C55E', borderRadius: 10, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 15 }}>
              Start Free Trial — 14 Days →
            </Link>
          )}
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 12, marginTop: 12 }}>Cancel before trial ends to avoid billing.</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '88px 48px', background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 50px)', fontWeight: 900, marginBottom: 16, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1.1 }}>
          Stop letting missed calls<br />become missed jobs.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 17, maxWidth: 460, margin: '0 auto 40px', lineHeight: 1.8 }}>
          Set up BellAveGo in 15 minutes and let the AI answer, book, and text your next customer.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isSignedIn ? (
            <Link href="/dashboard" className="dash-pulse" style={{ padding: '16px 46px', background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
              Dashboard →
            </Link>
          ) : (
            <Link href="/sign-up" className="cta-pulse" style={{ padding: '16px 46px', background: '#22C55E', borderRadius: 12, textDecoration: 'none', color: '#fff', fontWeight: 900, fontSize: 16 }}>
              Start Free Trial — 14 Days →
            </Link>
          )}
          <a href="tel:+17623713351" style={{ padding: '16px 30px', background: 'rgba(255,255,255,0.08)', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
            📞 Call the AI Demo
          </a>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13, marginTop: 18 }}>No credit card. No contract. No BS.</p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '44px 40px', background: '#0B1F3A', textAlign: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <Image src="/logo.png" alt="BellAveGo" width={300} height={100} style={{ objectFit: 'contain' }} />
          <p style={{ margin: 0, fontSize: 14, color: '#7AAAB2', fontStyle: 'italic' }}>We don&apos;t just answer calls. We grow your business.</p>
          <p style={{ margin: 0, fontSize: 12, color: '#3D5A62' }}>Built for home service businesses · $147/mo · No contracts · Cancel anytime</p>
        </div>
      </footer>

    </main>
  )
}
