'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Reveal — scroll-triggered fade + rise for landing sections.
 * IntersectionObserver, fires once, respects prefers-reduced-motion.
 */
export default function Reveal({ children, delayMs = 0 }: { children: React.ReactNode; delayMs?: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setShown(true); obs.disconnect() } },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? 'translateY(0)' : 'translateY(26px)',
      transition: `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms`,
      willChange: 'opacity, transform',
    }}>
      {children}
    </div>
  )
}
