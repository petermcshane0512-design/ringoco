'use client'

import { useEffect, useState } from 'react'

/**
 * useIsMobile — tiny viewport-width hook for responsive inline styles.
 *
 * Most of the app uses inline `style={{...}}` rather than CSS classes so
 * we can't drop in a media query. This hook returns true when the
 * viewport is narrower than the breakpoint (default 640px), matching
 * Tailwind's "sm:" boundary.
 *
 * Server-render returns false (assumes desktop) to avoid hydration
 * mismatches; the actual value lands on first client paint via effect.
 *
 * Usage:
 *   const isMobile = useIsMobile()
 *   <div style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 310px' }}>
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])
  return isMobile
}
