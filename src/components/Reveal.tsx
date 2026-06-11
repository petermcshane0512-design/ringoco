'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Reveal — scroll-triggered fade + rise for landing sections.
 * IntersectionObserver, fires once, respects prefers-reduced-motion.
 *
 * SSR contract: starts at opacity:1 server-side so the page is fully
 * visible before hydration. After mount we flip to opacity:0 only for
 * sections still below the fold, then IntersectionObserver reveals them
 * as the visitor scrolls. Above-the-fold sections never hide.
 */
export default function Reveal({ children, delayMs = 0 }: { children: React.ReactNode; delayMs?: number }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [shown, setShown] = useState(true)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const belowFold = rect.top > window.innerHeight - 40
    if (!belowFold) { setShown(true); return }
    setShown(false)
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setShown(true); obs.disconnect() } },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const style: React.CSSProperties = mounted
    ? {
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(26px)',
        transition: `opacity 700ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms, transform 700ms cubic-bezier(0.16,1,0.3,1) ${delayMs}ms`,
        willChange: 'opacity, transform',
      }
    : { opacity: 1 }

  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  )
}
