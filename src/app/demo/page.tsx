'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function DemoPage() {
  return (
    <main style={{ background: '#F2F9F5', color: '#0B1F3A', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <TopBar />
      <DemoBlock
        n={1}
        title="Photo-Real Coastal"
        blurb="Real beach photo with subtle live foam + sparkle overlay. Slow Ken Burns zoom. Most realistic — uses your original image as the base."
      >
        <Variant1 />
      </DemoBlock>
      <DemoBlock
        n={2}
        title="Cinematic Sunset"
        blurb="Hand-painted sunset scene: warm sky, sun reflection trail, silhouetted cliff houses on the right, palm trees, deep purple ocean."
      >
        <Variant2 />
      </DemoBlock>
      <DemoBlock
        n={3}
        title="Waves Close-Up"
        blurb="Intimate, aerial-style view of turquoise waves breaking on golden sand. Lots of foam motion, wet sand shimmer, light caustics."
      >
        <Variant3 />
      </DemoBlock>
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <Link href="/" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>← Back to live homepage</Link>
      </div>
    </main>
  )
}

function TopBar() {
  return (
    <div style={{ padding: '24px 40px', borderBottom: '1px solid #DCE9E2', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontWeight: 800, fontSize: 18, color: '#0B1F3A' }}>BellAveGo · Hero Demos</div>
      <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
        <a href="#d1" style={{ color: '#4A6670', textDecoration: 'none' }}>1. Photo-Real</a>
        <a href="#d2" style={{ color: '#4A6670', textDecoration: 'none' }}>2. Sunset</a>
        <a href="#d3" style={{ color: '#4A6670', textDecoration: 'none' }}>3. Waves Close-Up</a>
        <Link href="/" style={{ color: '#0AA89F', textDecoration: 'none', fontWeight: 700 }}>← Live site</Link>
      </div>
    </div>
  )
}

function DemoBlock({ n, title, blurb, children }: { n: number; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section id={`d${n}`} style={{ padding: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 8 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: '#0AA89F' }}>{n}.</span>
        <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ color: '#4A6670', maxWidth: 720, marginTop: 0, marginBottom: 18, fontSize: 14, lineHeight: 1.6 }}>{blurb}</p>
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 50px rgba(11,31,58,0.18)' }}>
        {children}
      </div>
    </section>
  )
}

function HeroOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 6%', zIndex: 3, pointerEvents: 'none' }}>
      <div style={{ maxWidth: '46%' }}>
        <p style={{ fontSize: 'clamp(9px, 0.85vw, 13px)', fontWeight: 700, color: 'rgba(255,200,80,0.95)', letterSpacing: '2.5px', textTransform: 'uppercase', margin: 0, marginBottom: '2%' }}>
          AI Receptionist · 24/7
        </p>
        <h1 style={{ fontSize: 'clamp(20px, 3.0vw, 50px)', fontWeight: 900, color: '#fff', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 0 2% 0', textShadow: '0 2px 30px rgba(0,0,0,0.7)' }}>
          Stop losing jobs<br />to missed calls.
        </h1>
        <p style={{ fontSize: 'clamp(10px, 0.95vw, 15px)', color: 'rgba(255,255,255,0.78)', lineHeight: 1.6, margin: 0, textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
          BellAveGo answers when you can&apos;t, books the job,<br />and texts your customer — automatically.
        </p>
        <div style={{ marginTop: '4%', display: 'inline-block', padding: '12px 24px', background: 'linear-gradient(135deg,#22C55E,#15A34A)', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 'clamp(11px, 1.0vw, 14px)', boxShadow: '0 8px 32px rgba(34,197,94,0.55)' }}>
          Get started →
        </div>
      </div>
    </div>
  )
}

/* =============================================================
   VARIANT 1 — Real photo (Landing Page 1.png) + live overlay
   ============================================================= */
function Variant1() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    let raf = 0, t = 0
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    const tick = () => {
      const W = canvas.width, H = canvas.height
      t += 0.012
      ctx.clearRect(0, 0, W, H)

      // Foam ripple line — sits where wave meets sand in the photo (~70% down)
      const baseY = H * 0.71
      ctx.beginPath()
      for (let x = 0; x <= W + 4; x += 3) {
        const y = baseY
          + Math.sin(x / 220 + t * 0.65) * H * 0.014
          + Math.sin(x / 95 + t * 1.3 + 1.7) * H * 0.006
          + Math.sin(x / 38 + t * 2.2 + 0.5) * H * 0.002
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.stroke()

      // Secondary wash — softer outer ring of foam
      ctx.beginPath()
      for (let x = 0; x <= W + 4; x += 3) {
        const y = baseY + H * 0.022
          + Math.sin(x / 240 + t * 0.55 + 1.2) * H * 0.011
          + Math.sin(x / 82 + t * 1.0 + 0.3) * H * 0.005
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 1.6
      ctx.stroke()

      // Sparkles on water — concentrated upper-water band
      for (let i = 0; i < 80; i++) {
        const a1 = i * 0.6180 + t * 0.5
        const a2 = i * 1.3819 + t * 0.7
        const sx = (Math.sin(a1 * 1.7) * 0.5 + 0.5) * W
        const sy = H * 0.42 + (Math.sin(a2 * 1.1) * 0.5 + 0.5) * H * 0.22
        const a = Math.max(0, Math.sin(t * 2.4 + i * 0.91)) * 0.55
        const r = 0.6 + Math.abs(Math.sin(t * 1.9 + i * 0.6)) * 2.6
        if (a > 0.05) {
          const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.2)
          g.addColorStop(0, `rgba(255,255,235,${a})`)
          g.addColorStop(1, 'rgba(255,250,200,0)')
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2); ctx.fill()
        }
      }

      // Left vignette for text contrast
      const vig = ctx.createLinearGradient(0, 0, W * 0.55, 0)
      vig.addColorStop(0, 'rgba(4,18,42,0.42)')
      vig.addColorStop(1, 'rgba(4,18,42,0)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W * 0.55, H)

      raf = requestAnimationFrame(tick)
    }
    resize(); tick(); window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1440/480', overflow: 'hidden' }}>
      <div className="kb-zoom" style={{ position: 'absolute', inset: 0 }}>
        <Image src="/Landing Page 1.png" alt="" fill style={{ objectFit: 'cover' }} priority />
      </div>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2 }} />
      <style>{`
        @keyframes kb { 0% { transform: scale(1.0); } 100% { transform: scale(1.06); } }
        .kb-zoom > * { animation: kb 22s ease-in-out infinite alternate; }
      `}</style>
      <HeroOverlay />
    </div>
  )
}

/* =============================================================
   VARIANT 2 — Cinematic sunset, painted
   ============================================================= */
function Variant2() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    let raf = 0, t = 0
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }

    type WP = { amp: number; per: number; spd: number; ph: number }
    const waveAt = (x: number, H: number, frac: number, ws: WP[]) => {
      let y = H * frac
      for (const w of ws) {
        y += Math.sin(x / w.per + t * w.spd + w.ph) * w.amp
        y += Math.sin(x / (w.per * 0.618) + t * w.spd * 1.4 + w.ph * 1.7) * w.amp * 0.32
      }
      return y
    }

    const tick = () => {
      const W = canvas.width, H = canvas.height
      t += 0.006
      ctx.clearRect(0, 0, W, H)

      // Sky — sunset gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.65)
      sky.addColorStop(0,    '#1a1247')
      sky.addColorStop(0.20, '#3b1a5c')
      sky.addColorStop(0.42, '#8a2a5c')
      sky.addColorStop(0.62, '#e85a3a')
      sky.addColorStop(0.82, '#ffb05a')
      sky.addColorStop(1,    '#ffd58a')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H * 0.65)

      // Soft cloud bands
      for (let i = 0; i < 4; i++) {
        const cy = H * (0.10 + i * 0.06)
        const cw = W * 0.9
        const cg = ctx.createLinearGradient(0, cy - 14, 0, cy + 14)
        const alpha = 0.18 - i * 0.03
        cg.addColorStop(0, `rgba(255,180,140,0)`)
        cg.addColorStop(0.5, `rgba(255,200,160,${alpha})`)
        cg.addColorStop(1, `rgba(255,180,140,0)`)
        ctx.fillStyle = cg
        ctx.fillRect(W * 0.05, cy - 14, cw, 28)
      }

      // Sun — large warm disc lower right, near horizon
      const sunX = W * 0.66, sunY = H * 0.46
      const sunR = H * 0.085
      const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.7)
      halo.addColorStop(0,    'rgba(255,235,170,0.55)')
      halo.addColorStop(0.20, 'rgba(255,180,90,0.30)')
      halo.addColorStop(0.50, 'rgba(255,120,60,0.10)')
      halo.addColorStop(1,    'rgba(255,80,40,0)')
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, W, H * 0.7)

      const sunG = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 1.2)
      sunG.addColorStop(0,   '#fff8d6')
      sunG.addColorStop(0.5, '#ffd07a')
      sunG.addColorStop(1,   'rgba(255,160,80,0)')
      ctx.fillStyle = sunG
      ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 1.2, 0, Math.PI * 2); ctx.fill()

      // Distant cliff with house silhouettes — right side
      const cliffY = H * 0.50
      ctx.fillStyle = '#1a0f2e'
      ctx.beginPath()
      ctx.moveTo(W * 0.55, H * 0.62)
      // cliff curve up
      const pts: [number, number][] = [
        [W * 0.62, cliffY + 14],
        [W * 0.70, cliffY],
        [W * 0.78, cliffY - 8],
        [W * 0.86, cliffY - 4],
        [W * 0.94, cliffY + 6],
        [W * 1.00, cliffY + 18],
      ]
      pts.forEach(p => ctx.lineTo(p[0], p[1]))
      ctx.lineTo(W, H * 0.62)
      ctx.closePath()
      ctx.fill()

      // House silhouettes on cliff top
      const houses: [number, number, number][] = [
        [W * 0.70, cliffY + 2,  10],
        [W * 0.745, cliffY - 2, 12],
        [W * 0.79, cliffY - 6, 10],
        [W * 0.835, cliffY - 4, 9],
        [W * 0.88, cliffY - 2, 11],
        [W * 0.93, cliffY + 4, 10],
      ]
      ctx.fillStyle = '#0d0820'
      houses.forEach(([hx, hy, hh]) => {
        const hw = hh * 1.3
        ctx.fillRect(hx - hw / 2, hy - hh, hw, hh)
        // Roof
        ctx.beginPath()
        ctx.moveTo(hx - hw / 2 - 1, hy - hh)
        ctx.lineTo(hx, hy - hh - hh * 0.55)
        ctx.lineTo(hx + hw / 2 + 1, hy - hh)
        ctx.closePath()
        ctx.fill()
        // Tiny warm window
        ctx.fillStyle = 'rgba(255,200,90,0.85)'
        ctx.fillRect(hx - 1.5, hy - hh * 0.55, 2, 2)
        ctx.fillStyle = '#0d0820'
      })

      // Palm tree silhouettes far right
      const drawPalm = (px: number, py: number, scale: number) => {
        ctx.strokeStyle = '#0a0518'
        ctx.fillStyle = '#0a0518'
        ctx.lineWidth = 2 * scale
        ctx.lineCap = 'round'
        // trunk
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.quadraticCurveTo(px - 4 * scale, py - 30 * scale, px - 2 * scale, py - 60 * scale)
        ctx.stroke()
        // fronds
        const tipX = px - 2 * scale, tipY = py - 60 * scale
        for (let i = 0; i < 7; i++) {
          const a = (-Math.PI / 2) + (i - 3) * 0.55
          const len = 28 * scale
          ctx.beginPath()
          ctx.moveTo(tipX, tipY)
          ctx.quadraticCurveTo(tipX + Math.cos(a) * len * 0.6, tipY + Math.sin(a) * len * 0.4, tipX + Math.cos(a) * len, tipY + Math.sin(a) * len + 6 * scale)
          ctx.lineWidth = 2.2 * scale
          ctx.stroke()
        }
      }
      drawPalm(W * 0.965, H * 0.62, 1.1)
      drawPalm(W * 0.99, H * 0.64, 0.85)

      // Ocean — purples and oranges with sun reflection trail
      const layers: { frac: number; color: string; ws: WP[] }[] = [
        { frac: 0.620, color: '#2a1648', ws: [{ amp: 0.8, per: 2200, spd: 0.18, ph: 0.0 }] },
        { frac: 0.652, color: '#3a1a52', ws: [{ amp: 1.4, per: 1700, spd: 0.22, ph: 0.7 }] },
        { frac: 0.685, color: '#4a1f5a', ws: [{ amp: 2.0, per: 1300, spd: 0.27, ph: 1.4 }] },
        { frac: 0.718, color: '#5a2562', ws: [{ amp: 2.8, per: 1000, spd: 0.33, ph: 0.3 }] },
        { frac: 0.752, color: '#6a2c66', ws: [{ amp: 3.6, per: 800, spd: 0.40, ph: 2.1 }] },
        { frac: 0.785, color: '#7a3464', ws: [{ amp: 4.4, per: 640, spd: 0.49, ph: 1.0 }] },
        { frac: 0.818, color: '#8a3d5e', ws: [{ amp: 5.2, per: 510, spd: 0.59, ph: 2.6 }] },
        { frac: 0.850, color: '#984754', ws: [{ amp: 6.0, per: 410, spd: 0.71, ph: 0.8 }] },
        { frac: 0.880, color: '#a85248', ws: [{ amp: 6.6, per: 330, spd: 0.85, ph: 2.0 }] },
        { frac: 0.908, color: '#b8603c', ws: [{ amp: 6.8, per: 270, spd: 1.02, ph: 1.5 }] },
      ]
      layers.forEach((layer, idx) => {
        ctx.beginPath()
        for (let x = 0; x <= W + 3; x += 2) {
          const y = waveAt(x, H, layer.frac, layer.ws)
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath()
        ctx.fillStyle = layer.color
        ctx.fill()
        // crest highlight — warm tinted
        if (idx >= 3) {
          ctx.beginPath()
          for (let x = 0; x <= W + 3; x += 2) {
            const y = waveAt(x, H, layer.frac, layer.ws)
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          const a = Math.min(0.06 + (idx - 3) * 0.04, 0.55)
          ctx.strokeStyle = `rgba(255,210,150,${a})`
          ctx.lineWidth = idx >= 7 ? 2.4 : 1.4
          ctx.stroke()
        }
      })

      // Sun reflection trail — bright orange column straight down from sun
      ctx.save()
      const trail = ctx.createLinearGradient(sunX, H * 0.50, sunX, H * 0.92)
      trail.addColorStop(0, 'rgba(255,220,140,0.65)')
      trail.addColorStop(0.5, 'rgba(255,150,80,0.32)')
      trail.addColorStop(1, 'rgba(255,100,60,0)')
      ctx.fillStyle = trail
      ctx.globalCompositeOperation = 'screen'
      // tapered column
      ctx.beginPath()
      ctx.moveTo(sunX - 12, H * 0.50)
      ctx.lineTo(sunX + 12, H * 0.50)
      ctx.lineTo(sunX + W * 0.10, H * 0.92)
      ctx.lineTo(sunX - W * 0.10, H * 0.92)
      ctx.closePath()
      ctx.fill()
      // shimmer dashes
      for (let i = 0; i < 40; i++) {
        const ph = i * 0.19 + t * 0.4
        const yy = H * (0.52 + (i / 40) * 0.38)
        const span = 8 + (i / 40) * 50
        const cx = sunX + Math.sin(ph) * span * 0.4
        const a = Math.max(0, Math.sin(ph * 2 + t)) * 0.5
        if (a > 0.05) {
          ctx.fillStyle = `rgba(255,235,180,${a})`
          ctx.fillRect(cx - span / 2, yy, span, 1.8)
        }
      }
      ctx.restore()

      // Sand strip — warm gold
      const sandY = H * 0.92
      const sandG = ctx.createLinearGradient(0, sandY, 0, H)
      sandG.addColorStop(0, '#7a4a2a')
      sandG.addColorStop(0.5, '#a06a40')
      sandG.addColorStop(1, '#8a5530')
      ctx.fillStyle = sandG
      ctx.fillRect(0, sandY, W, H - sandY)

      // Wave swash on sand
      ctx.beginPath()
      for (let x = 0; x <= W + 3; x += 3) {
        const y = sandY + Math.sin(x / 280 + t * 0.7) * H * 0.008 + Math.sin(x / 110 + t * 1.2) * H * 0.004
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255,220,180,0.55)'
      ctx.lineWidth = 2.6
      ctx.stroke()

      // Left vignette
      const vig = ctx.createLinearGradient(0, 0, W * 0.55, 0)
      vig.addColorStop(0, 'rgba(20,5,40,0.55)')
      vig.addColorStop(1, 'rgba(20,5,40,0)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W * 0.55, H)

      raf = requestAnimationFrame(tick)
    }
    resize(); tick(); window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1440/480', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <HeroOverlay />
    </div>
  )
}

/* =============================================================
   VARIANT 3 — Waves close-up, aerial-style
   ============================================================= */
function Variant3() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    let raf = 0, t = 0
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }

    const tick = () => {
      const W = canvas.width, H = canvas.height
      t += 0.009
      ctx.clearRect(0, 0, W, H)

      // Deep water (top) → wet sand (bottom). Aerial perspective.
      const water = ctx.createLinearGradient(0, 0, 0, H)
      water.addColorStop(0,    '#0a3552')
      water.addColorStop(0.20, '#0e527a')
      water.addColorStop(0.42, '#1a86a8')
      water.addColorStop(0.58, '#3cb5c2')
      water.addColorStop(0.74, '#7adcc8')
      water.addColorStop(0.84, '#c8e8b8')
      water.addColorStop(0.92, '#d8c490')
      water.addColorStop(1,    '#b89a64')
      ctx.fillStyle = water
      ctx.fillRect(0, 0, W, H)

      // Caustic light dappling on deep water
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (let i = 0; i < 50; i++) {
        const a1 = i * 0.618 + t * 0.4
        const a2 = i * 1.382 + t * 0.6
        const cx = (Math.sin(a1 * 1.3) * 0.5 + 0.5) * W
        const cy = H * 0.05 + (Math.sin(a2 * 1.1) * 0.5 + 0.5) * H * 0.45
        const r = 18 + Math.abs(Math.sin(t + i * 0.7)) * 30
        const a = 0.04 + Math.abs(Math.sin(t * 0.9 + i * 0.5)) * 0.06
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
        g.addColorStop(0, `rgba(180,240,255,${a})`)
        g.addColorStop(1, 'rgba(180,240,255,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()

      // Wave bands rolling toward sand — multiple breakers stacked
      const breakers = [
        { y: 0.35, amp: 4, per: 360, spd: 0.6, foam: 0.25, thick: 14 },
        { y: 0.48, amp: 6, per: 280, spd: 0.8, foam: 0.40, thick: 22 },
        { y: 0.62, amp: 8, per: 220, spd: 1.0, foam: 0.62, thick: 32 },
        { y: 0.74, amp: 10, per: 180, spd: 1.3, foam: 0.85, thick: 42 },
      ]
      breakers.forEach(b => {
        const baseY = H * b.y
        // foam crest (thick rolling band)
        ctx.save()
        ctx.globalCompositeOperation = 'screen'
        for (let pass = 0; pass < 3; pass++) {
          ctx.beginPath()
          for (let x = 0; x <= W + 4; x += 3) {
            const y = baseY
              + Math.sin(x / b.per + t * b.spd) * b.amp
              + Math.sin(x / (b.per * 0.5) + t * b.spd * 1.4 + 0.7) * b.amp * 0.45
              + (pass - 1) * b.thick * 0.25
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = `rgba(255,255,255,${b.foam * (0.55 - pass * 0.15)})`
          ctx.lineWidth = b.thick * (0.9 - pass * 0.18)
          ctx.lineCap = 'round'
          ctx.stroke()
        }
        ctx.restore()

        // crisp leading edge
        ctx.beginPath()
        for (let x = 0; x <= W + 4; x += 3) {
          const y = baseY
            + Math.sin(x / b.per + t * b.spd) * b.amp
            + Math.sin(x / (b.per * 0.5) + t * b.spd * 1.4 + 0.7) * b.amp * 0.45
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(255,255,255,${b.foam * 0.7})`
        ctx.lineWidth = 2
        ctx.stroke()
      })

      // Foam patches scattered — turbulent froth between breakers
      for (let i = 0; i < 60; i++) {
        const a1 = i * 0.618 + t * 0.5
        const fx = (Math.sin(a1 * 1.7) * 0.5 + 0.5) * W
        const fy = H * 0.55 + (Math.cos(a1 * 1.3) * 0.5 + 0.5) * H * 0.30
        const r = 6 + Math.abs(Math.sin(t * 1.4 + i * 0.71)) * 18
        const a = 0.10 + Math.abs(Math.sin(t * 1.1 + i * 0.83)) * 0.30
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r)
        g.addColorStop(0, `rgba(255,255,255,${a})`)
        g.addColorStop(0.6, `rgba(245,253,255,${a * 0.5})`)
        g.addColorStop(1, 'rgba(220,240,255,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill()
      }

      // Wet sand reflection band — thin shimmer
      const wetY = H * 0.86
      const wet = ctx.createLinearGradient(0, wetY, 0, H * 0.96)
      wet.addColorStop(0, 'rgba(180,220,200,0.55)')
      wet.addColorStop(1, 'rgba(180,220,200,0)')
      ctx.fillStyle = wet
      ctx.fillRect(0, wetY, W, H * 0.10)

      // Sky-color sheen reflected on wet sand (animated)
      for (let i = 0; i < 22; i++) {
        const sx = (i / 22) * W + Math.sin(t * 0.6 + i) * 18
        const sy = H * (0.88 + Math.sin(t + i * 0.4) * 0.005)
        const a = 0.08 + Math.abs(Math.sin(t * 0.9 + i * 0.5)) * 0.12
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30)
        g.addColorStop(0, `rgba(200,235,255,${a})`)
        g.addColorStop(1, 'rgba(200,235,255,0)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.fill()
      }

      // Final swash line at bottom — water reaching highest point
      ctx.beginPath()
      for (let x = 0; x <= W + 4; x += 3) {
        const y = H * 0.90 + Math.sin(x / 200 + t * 0.6) * H * 0.012 + Math.sin(x / 75 + t * 1.3) * H * 0.005
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.stroke()

      // Left vignette
      const vig = ctx.createLinearGradient(0, 0, W * 0.55, 0)
      vig.addColorStop(0, 'rgba(0,20,40,0.50)')
      vig.addColorStop(1, 'rgba(0,20,40,0)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W * 0.55, H)

      raf = requestAnimationFrame(tick)
    }
    resize(); tick(); window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '1440/480', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <HeroOverlay />
    </div>
  )
}
