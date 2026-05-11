'use client'
import { useEffect, useState } from 'react'

const DEMO_NUMBER = '+16514677829'
const DEMO_DISPLAY = '(651) 467‑7829'

/**
 * Persistent "Hear the AI live" CTA.
 * - Desktop (>=768px): floating pill in the bottom-right corner
 * - Mobile (<768px): full-width sticky strip at the bottom
 *
 * Hidden on /sample-report so it doesn't compete with the report's own CTAs.
 */
export default function StickyDemoCta() {
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const path = window.location.pathname
    if (path.startsWith('/sample-report') || path.startsWith('/dashboard') || path.startsWith('/onboarding') || path.startsWith('/sign-')) {
      setHidden(true)
      return
    }
    const onScroll = () => setScrolled(window.scrollY > 400)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (hidden) return null

  return (
    <>
      <style>{`
        .sdc-desktop {
          position: fixed;
          bottom: 22px; right: 22px;
          z-index: 90;
          display: inline-flex; align-items: center; gap: 11px;
          padding: 12px 18px 12px 12px;
          border-radius: 99px;
          background: linear-gradient(135deg, #0B1F3A 0%, #112C4A 100%);
          color: #fff;
          text-decoration: none;
          border: 1px solid rgba(94,234,212,0.40);
          box-shadow:
            0 14px 34px rgba(11,31,58,0.42),
            0 0 0 1px rgba(94,234,212,0.12),
            0 0 50px rgba(232,116,43,0.18);
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.35s ease, transform 0.35s ease, box-shadow 0.22s ease;
          pointer-events: none;
        }
        .sdc-desktop.shown {
          opacity: 1; transform: translateY(0); pointer-events: auto;
        }
        .sdc-desktop:hover {
          box-shadow:
            0 18px 44px rgba(11,31,58,0.5),
            0 0 0 1px rgba(94,234,212,0.32),
            0 0 70px rgba(232,116,43,0.30);
        }
        .sdc-ico {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          flex-shrink: 0;
          animation: sdcRing 1.6s ease-out infinite;
        }
        @keyframes sdcRing {
          0%   { box-shadow: 0 0 0 0 rgba(232,116,43,0.55); }
          70%  { box-shadow: 0 0 0 14px rgba(232,116,43,0); }
          100% { box-shadow: 0 0 0 0 rgba(232,116,43,0); }
        }
        .sdc-text { display: flex; flex-direction: column; gap: 1px; line-height: 1; }
        .sdc-tag {
          font-size: 9.5px; font-weight: 800;
          color: #5EEAD4;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .sdc-num {
          font-size: 14.5px; font-weight: 900;
          color: #fff;
          letter-spacing: -0.2px;
          font-variant-numeric: tabular-nums;
        }

        /* Mobile sticky strip */
        .sdc-mobile { display: none; }
        @media (max-width: 767px) {
          .sdc-desktop { display: none; }
          .sdc-mobile {
            display: flex;
            position: fixed;
            left: 12px; right: 12px; bottom: 12px;
            z-index: 90;
            align-items: center; justify-content: space-between; gap: 12px;
            padding: 11px 14px 11px 11px;
            border-radius: 14px;
            background: linear-gradient(135deg, #0B1F3A 0%, #112C4A 100%);
            color: #fff;
            text-decoration: none;
            border: 1px solid rgba(94,234,212,0.40);
            box-shadow: 0 14px 34px rgba(11,31,58,0.45);
            opacity: 0;
            transform: translateY(16px);
            transition: opacity 0.35s ease, transform 0.35s ease;
            pointer-events: none;
          }
          .sdc-mobile.shown { opacity: 1; transform: translateY(0); pointer-events: auto; }
        }
        .sdc-arrow {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: rgba(94,234,212,0.14);
          color: #5EEAD4;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
      `}</style>

      <a href={`tel:${DEMO_NUMBER}`} className={`sdc-desktop ${scrolled ? 'shown' : ''}`} aria-label="Call the BellAveGo AI demo">
        <span className="sdc-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.37 1.92.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.84.57 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </span>
        <span className="sdc-text">
          <span className="sdc-tag">Hear the AI live</span>
          <span className="sdc-num">{DEMO_DISPLAY}</span>
        </span>
      </a>

      <a href={`tel:${DEMO_NUMBER}`} className={`sdc-mobile ${scrolled ? 'shown' : ''}`} aria-label="Call the BellAveGo AI demo">
        <span className="sdc-ico">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.37 1.92.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.84.57 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </span>
        <span className="sdc-text" style={{ flex: 1 }}>
          <span className="sdc-tag">Hear the AI live · 24/7</span>
          <span className="sdc-num">{DEMO_DISPLAY}</span>
        </span>
        <span className="sdc-arrow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </span>
      </a>
    </>
  )
}
