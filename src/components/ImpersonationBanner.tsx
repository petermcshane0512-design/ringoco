'use client'

import { useEffect, useState } from 'react'

type Status =
  | { isAdmin: boolean; isImpersonating: false }
  | {
      isAdmin: true
      isImpersonating: true
      target: { userId: string; businessName: string | null; planTier: string | null; twilioNumber: string | null }
    }

export default function ImpersonationBanner() {
  const [status, setStatus] = useState<Status | null>(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    fetch('/api/admin/impersonate')
      .then((r) => r.json())
      .then((j: Status) => setStatus(j))
      .catch(() => setStatus(null))
  }, [])

  if (!status || !status.isImpersonating) return null

  async function exit() {
    setExiting(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' }).catch(() => {})
    window.location.assign('/admin/customers')
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 999,
        background: 'linear-gradient(135deg, #B91C1C 0%, #DC2626 100%)',
        color: '#fff',
        padding: '8px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontFamily: "'Inter', system-ui, sans-serif",
        boxShadow: '0 2px 12px rgba(220,38,38,0.35)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        <span style={{ background: 'rgba(255,255,255,0.18)', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em' }}>
          ADMIN · READ-ONLY
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Viewing as <strong>{status.target.businessName ?? status.target.userId.slice(0, 12)}</strong>
          {status.target.planTier ? ` · ${status.target.planTier}` : ''}
          {status.target.twilioNumber ? ` · ${status.target.twilioNumber}` : ''}
        </span>
      </div>
      <button
        onClick={exit}
        disabled={exiting}
        style={{
          padding: '5px 14px',
          borderRadius: 7,
          border: '1px solid rgba(255,255,255,0.5)',
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          cursor: exiting ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {exiting ? 'Exiting…' : 'Exit impersonation →'}
      </button>
    </div>
  )
}
