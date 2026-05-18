'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'

const DEMO_NUMBER = '+16514677829'
const DEMO_DISPLAY = '(651) 467‑7829'

/**
 * Persistent CTA bar.
 * - Desktop (>=768px): floating "Hear the AI live" pill in the bottom-right.
 * - Mobile (<768px): a full-width sticky bottom bar with TWO buttons —
 *   Call demo on the left, Open Dashboard / Start free trial on the right.
 *   This is also where mobile users access auth (the top nav doesn't show
 *   Sign In / Create Account on phones).
 *
 * Hidden on /sample-report, /dashboard, /onboarding, /sign-* so it
 * doesn't compete with those flows' own CTAs.
 */
export default function StickyDemoCta() {
  const { isSignedIn } = useAuth()
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
  const rightHref = isSignedIn ? '/dashboard' : '/sign-up'
  const rightLabel = isSignedIn ? 'Open Dashboard' : 'Start free trial'

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

        /* Mobile sticky bottom bar — disabled per Peter (covers content).
           Desktop floating pill remains; phones simply don't show it. */
        .sdc-mobile { display: none !important; }
        @media (max-width: 767px) {
          .sdc-desktop { display: none !important; }
          .sdc-mobile { display: none !important; }
          .sdc-mobile-unused-block {
            position: fixed;
            left: 10px; right: 10px; bottom: 10px;
            z-index: 90;
            align-items: stretch;
            gap: 8px;
            opacity: 0;
            transform: translateY(16px);
            transition: opacity 0.35s ease, transform 0.35s ease;
            pointer-events: none;
          }
          .sdc-mobile.shown { opacity: 1; transform: translateY(0); pointer-events: auto; }
          .sdc-mobile-btn {
            flex: 1 1 0;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            padding: 13px 12px;
            border-radius: 13px;
            font-size: 14px;
            font-weight: 800;
            letter-spacing: -0.2px;
            text-decoration: none;
            min-height: 50px;
            box-shadow: 0 12px 28px rgba(11,31,58,0.32);
            transition: transform 0.2s ease, filter 0.2s ease;
          }
          .sdc-mobile-btn:active { transform: translateY(1px); }
          .sdc-mobile-call {
            background: linear-gradient(135deg, #0B1F3A 0%, #112C4A 100%);
            color: #fff;
            border: 1px solid rgba(94,234,212,0.40);
          }
          .sdc-mobile-start {
            background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%);
            color: #fff;
            border: 1px solid rgba(74,222,128,0.45);
          }
          .sdc-mobile-start:hover { filter: brightness(1.06); }
          .sdc-ring {
            width: 22px; height: 22px;
            border-radius: 50%;
            background: linear-gradient(135deg, #FF9D5A, #E8742B);
            display: flex; align-items: center; justify-content: center;
            color: #fff;
            flex-shrink: 0;
            animation: sdcRing 1.8s ease-out infinite;
          }
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

      <div className={`sdc-mobile ${scrolled ? 'shown' : ''}`}>
        <a href={`tel:${DEMO_NUMBER}`} className="sdc-mobile-btn sdc-mobile-call" aria-label={`Call BellAveGo AI demo at ${DEMO_DISPLAY}`}>
          <span className="sdc-ring">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.37 1.92.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.84.57 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </span>
          Call demo
        </a>
        <Link href={rightHref} className="sdc-mobile-btn sdc-mobile-start" aria-label={rightLabel}>
          {rightLabel}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </Link>
      </div>
    </>
  )
}
