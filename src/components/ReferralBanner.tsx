'use client'
import { useEffect, useState } from 'react'

type ReferralData = {
  code: string
  shareUrl: string
  count: number
  pendingCount: number
  creditedCount: number
  totalCreditDollars: number
}

/**
 * Compact referral banner for the top of /dashboard. Single-line,
 * dismissable, copy-share-link in one tap. Drives existing customers
 * to refer peers (highest-converting acquisition channel for SMB SaaS).
 *
 * Hides itself if dismissed (localStorage) or if /api/referrals/me errors.
 * Full widget with stats lives on /dashboard/settings via ReferralWidget.
 */
export default function ReferralBanner() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('refbanner_dismissed') === '1') {
      setDismissed(true)
      return
    }
    fetch('/api/referrals/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !j.error) setData(j as ReferralData) })
      .catch(() => {})
  }, [])

  if (dismissed || !data) return null

  function copy() {
    navigator.clipboard.writeText(data!.shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    }).catch(() => {})
  }

  function dismiss() {
    localStorage.setItem('refbanner_dismissed', '1')
    setDismissed(true)
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C2410C 100%)',
      color: '#fff',
      borderRadius: 14,
      padding: '14px 18px',
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexWrap: 'wrap',
      boxShadow: '0 6px 22px rgba(232,116,43,0.32)',
    }}>
      <div style={{ flex: 1, minWidth: 240, lineHeight: 1.35 }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.85, marginBottom: 2 }}>
          🎁 Refer a shop, both get 1 month free
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          Each {data.code} signup that sticks = a free $197 month for you.
          {data.creditedCount > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 800, color: '#FEF3C7' }}>
              You&apos;ve earned ${data.totalCreditDollars} so far.
            </span>
          )}
        </div>
      </div>
      <button
        onClick={copy}
        style={{
          padding: '10px 18px',
          background: copied ? 'rgba(34,197,94,0.95)' : '#fff',
          color: copied ? '#fff' : '#C2410C',
          border: 'none',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 900,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? '✓ Copied' : '📋 Copy share link'}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'rgba(255,255,255,0.7)',
          fontSize: 18,
          cursor: 'pointer',
          padding: '6px 8px',
          fontFamily: 'inherit',
        }}
      >
        ✕
      </button>
    </div>
  )
}
