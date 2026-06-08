'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'

/**
 * Floating "Need help?" widget — bottom-right of every /dashboard/* page.
 *
 * One tap opens an SMS prefilled with the contractor's identity (user id,
 * business name from Clerk metadata, current page) sent to Peter's cell.
 * Cuts the "where do I email support?" ticket-routing problem to zero.
 *
 * Why SMS instead of email/chat:
 *   - Contractors are in the field 80% of the day, phones in hand
 *   - SMS opens the native messaging app — zero learning curve
 *   - Peter sees the thread on his phone, replies same channel
 *   - No support inbox to triage, no Zendesk to pay for
 *
 * Desktop: tap copies the number + opens an sms: link (some browsers
 * support sms: on desktop via handoff; otherwise the copy alone solves it).
 */
const PETER_SMS_NUMBER = '7737109565'
const PETER_DISPLAY = '(773) 710-9565'

export default function SupportWidget() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { user } = useUser()

  const businessName = (user?.unsafeMetadata?.businessName as string) || ''
  const ownerName = user?.firstName || user?.fullName || ''
  const userId = user?.id || ''
  const currentPage = typeof window !== 'undefined' ? window.location.pathname : ''

  const smsBody = [
    `Hi Peter — need help with BellAveGo.`,
    ownerName ? `From: ${ownerName}` : '',
    businessName ? `Business: ${businessName}` : '',
    currentPage ? `Page: ${currentPage}` : '',
    userId ? `(${userId.slice(0, 12)})` : '',
    '',
    'What I need:',
  ].filter(Boolean).join('\n')

  const smsHref = `sms:+1${PETER_SMS_NUMBER}?body=${encodeURIComponent(smsBody)}`

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText('+1' + PETER_SMS_NUMBER)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Fallback: do nothing, sms: link still works
    }
  }

  return (
    <>
      {/* Backdrop when open (mobile feel) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'transparent', zIndex: 998,
          }}
          aria-hidden
        />
      )}

      {/* Bubble — collapsed state */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Get help"
          style={{
            position: 'fixed',
            bottom: 84,             // sits above the mobile tab bar (~64px) with padding
            right: 18,
            zIndex: 999,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 10px 28px rgba(232,116,43,0.48), 0 0 0 4px rgba(255,255,255,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Inter', system-ui, sans-serif",
            transition: 'transform 0.15s ease',
          }}
        >
          {/* Speech-bubble icon */}
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            right: 18,
            zIndex: 1000,
            width: 'min(340px, calc(100vw - 36px))',
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 24px 60px rgba(7,27,58,0.32)',
            border: '1.5px solid rgba(232,116,43,0.24)',
            fontFamily: "'Inter', system-ui, sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
            color: '#0B1F3A',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>
                BellAveGo Support
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
                Text the BellAveGo team directly for questions the AI chat box can&apos;t answer · (773) 710-9565
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: 'rgba(11,31,58,0.10)', border: 'none', borderRadius: '50%',
                width: 28, height: 28, cursor: 'pointer',
                fontSize: 18, color: '#0B1F3A', lineHeight: 1,
                fontFamily: 'inherit',
              }}
            >
              ×
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '18px 20px' }}>
            <p style={{ fontSize: 13.5, color: '#4A6670', lineHeight: 1.55, margin: 0, marginBottom: 14 }}>
              No phone tree. No ticket queue. The founder reads every message and
              replies fast — usually within an hour during business hours.
            </p>

            {/* SMS button — primary CTA */}
            <a
              href={smsHref}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '13px 16px', borderRadius: 11,
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                color: '#0B1F3A', fontSize: 14, fontWeight: 900,
                textDecoration: 'none',
                boxShadow: '0 8px 22px rgba(232,116,43,0.32)',
                marginBottom: 10,
              }}
            >
              💬 Text {PETER_DISPLAY}
            </a>

            {/* Copy number — desktop fallback */}
            <button
              onClick={copyNumber}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '11px 16px', borderRadius: 11,
                background: '#fff', border: '1.5px solid rgba(10,168,159,0.22)',
                color: '#0B1F3A', fontSize: 13, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {copied ? '✓ Number copied to clipboard' : `📋 Copy number (${PETER_DISPLAY})`}
            </button>

            {/* Pre-filled context shown to the user so they know what we attach */}
            <div style={{
              marginTop: 14,
              padding: '10px 12px',
              background: '#F5FDFB',
              border: '1px solid rgba(10,168,159,0.18)',
              borderRadius: 9,
              fontSize: 11, color: '#4A7A80', lineHeight: 1.5,
            }}>
              <strong style={{ color: '#0B1F3A' }}>What we attach to your message:</strong> your name, business name, and which dashboard page you&apos;re on. Helps Peter find your account fast.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
