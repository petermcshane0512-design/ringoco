'use client'

import { useEffect, useState, useRef } from 'react'

/**
 * AnimatedRevenueCounter — ticks up the "booked install revenue today"
 * counter in real time. Starts at a believable seed ($47k) and adds
 * $50-400 every 3-7 seconds so it feels live without looking scripted.
 *
 * Renders as a giant hero number w/ green gradient + pulse glow.
 * Hormozi specificity: dollar amount > generic "lots of customers."
 */
export default function AnimatedRevenueCounter() {
  const [value, setValue] = useState(47328)
  const [flash, setFlash] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function tick() {
      const bump = Math.floor(Math.random() * 350) + 50
      setValue((v) => v + bump)
      setFlash(true)
      setTimeout(() => setFlash(false), 280)
      // Next tick 3000-7000ms out
      timeoutRef.current = setTimeout(tick, 3000 + Math.random() * 4000)
    }
    timeoutRef.current = setTimeout(tick, 4000)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
  }, [])

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 8,
      padding: '8px 16px',
      borderRadius: 99,
      background: 'rgba(34,197,94,0.10)',
      border: '1.5px solid rgba(34,197,94,0.40)',
      transition: 'all 280ms ease',
      boxShadow: flash ? '0 0 24px rgba(34,197,94,0.55)' : '0 0 6px rgba(34,197,94,0.20)',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: '#16803F', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        $ booked today
      </span>
      <span style={{
        fontSize: 'clamp(18px, 1.8vw, 22px)', fontWeight: 900,
        background: 'linear-gradient(135deg, #22C55E, #16803F)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
      }}>${value.toLocaleString()}</span>
    </div>
  )
}
