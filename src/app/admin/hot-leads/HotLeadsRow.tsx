'use client'

import { useState } from 'react'

type HotRow = {
  biz_id: string
  email: string | null
  city: string | null
  state: string | null
  zip: string | null
  trade: string | null
  visit_count: number
  last_visited_at: string | null
  hot_call_sms_sent_at: string | null
  hot_call_dialed_at: string | null
  signed_up_at: string | null
  business_name: string | null
  owner_first_name: string | null
}

/**
 * Row + Mark-Called button. Client component because the button POSTs
 * /api/admin/hot-leads/dial and updates local state optimistically so
 * the row visually drops to the "called" section without a hard reload.
 */
export default function HotLeadsRow({
  row, siteUrl, muted, won,
}: {
  row: HotRow
  siteUrl: string
  muted?: boolean
  won?: boolean
}) {
  const [dialed, setDialed] = useState<boolean>(!!row.hot_call_dialed_at)
  const [busy, setBusy] = useState(false)
  const landingUrl = `${siteUrl}/free-lead?b=${encodeURIComponent(row.biz_id)}`

  async function markCalled() {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/hot-leads/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ biz_id: row.biz_id }),
      })
      const j = await r.json().catch(() => ({}))
      if (j.ok) setDialed(true)
    } catch { /* swallow */ }
    finally { setBusy(false) }
  }

  return (
    <div style={{
      padding: 14, borderRadius: 10,
      background: won ? 'rgba(34,197,94,0.08)' : muted || dialed ? 'rgba(11,31,58,0.04)' : '#FFFFFF',
      border: won ? '1.5px solid rgba(34,197,94,0.30)' : '1px solid rgba(11,31,58,0.12)',
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0B1F3A' }}>
          {row.business_name || '(unknown shop)'}
          {row.owner_first_name && <span style={{ color: '#7AAAB2', fontWeight: 600 }}> · {row.owner_first_name}</span>}
        </div>
        <div style={{ fontSize: 12, color: '#4A6670', marginTop: 2 }}>
          <strong>{(row.trade || '').toUpperCase()}</strong>
          {(row.city || row.state || row.zip) && (
            <> · {row.city}{row.state ? `, ${row.state}` : ''} {row.zip || ''}</>
          )}
          <> · {row.visit_count} visit{row.visit_count === 1 ? '' : 's'}</>
        </div>
        <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 4 }}>
          {row.email && <>📧 {row.email} · </>}
          <a href={landingUrl} target="_blank" rel="noreferrer" style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 700 }}>
            Open landing ↗
          </a>
        </div>
        <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 4 }}>
          {row.hot_call_sms_sent_at && <>Alerted {new Date(row.hot_call_sms_sent_at).toLocaleString()}</>}
          {row.last_visited_at && <> · last visit {new Date(row.last_visited_at).toLocaleString()}</>}
          {row.signed_up_at && <> · SIGNED UP {new Date(row.signed_up_at).toLocaleString()}</>}
        </div>
      </div>

      {!won && !dialed && (
        <button
          onClick={markCalled}
          disabled={busy}
          style={{
            padding: '10px 16px', borderRadius: 10, border: 'none',
            background: busy ? 'rgba(11,31,58,0.3)' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
            color: '#fff', fontWeight: 900, fontSize: 13, cursor: busy ? 'wait' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? '…' : 'Mark called'}
        </button>
      )}
      {!won && dialed && (
        <div style={{ fontSize: 11, color: '#7AAAB2', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Called ✓
        </div>
      )}
      {won && (
        <div style={{ fontSize: 11, color: '#16803F', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          $$$ won
        </div>
      )}
    </div>
  )
}
