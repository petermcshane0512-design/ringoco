'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * LiveStatBar — count-up stats under the hero, fed by /api/live-feed
 * stats (REAL counts from the leads table). Renders nothing until real
 * numbers arrive; hides any stat that is null/0. No fabricated counts —
 * same honesty contract as LiveLeadFeed.
 */

type Stats = { pool: number | null; last_24h: number | null }

function useCountUp(target: number | null, durationMs = 1400): number {
  const [value, setValue] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (target == null || started.current) return
    started.current = true
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])
  return value
}

export default function LiveStatBar() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/live-feed')
      .then((r) => r.json())
      .then((j) => { if (alive && j?.ok && j.stats) setStats(j.stats as Stats) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setVisible(true) },
      { threshold: 0.3 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [stats])

  const pool = useCountUp(visible ? stats?.pool ?? null : null)
  const fresh = useCountUp(visible ? stats?.last_24h ?? null : null)

  if (!stats || !stats.pool) return null

  const items: Array<{ n: number; label: string }> = [
    { n: pool, label: 'live homeowner signals in pool' },
  ]
  if (stats.last_24h && stats.last_24h > 0) {
    items.push({ n: fresh, label: 'new signals found in last 24h' })
  }

  return (
    <div ref={ref} style={{
      display: 'flex', flexWrap: 'wrap', gap: 'clamp(18px, 4vw, 48px)',
      justifyContent: 'center', alignItems: 'center',
      padding: '18px clamp(16px, 5vw, 48px)',
      background: 'linear-gradient(180deg, rgba(232,116,43,0.06), transparent)',
    }}>
      {items.map((it) => (
        <div key={it.label} style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em',
            fontVariantNumeric: 'tabular-nums',
            background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>{it.n.toLocaleString()}</div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#4A6670', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
            {it.label}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ position: 'relative', width: 8, height: 8 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22C55E' }} />
          <span style={{
            position: 'absolute', inset: -3, borderRadius: '50%',
            border: '2px solid rgba(34,197,94,0.55)',
            animation: 'bavgLivePing 1.6s cubic-bezier(0,0,0.2,1) infinite',
          }} />
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 900, color: '#16803F', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          scanners running now
        </span>
      </div>
    </div>
  )
}
