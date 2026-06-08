'use client'

import { useState } from 'react'

export default function CopyBlock({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }
  return (
    <div style={{
      display: 'flex', alignItems: multiline ? 'flex-start' : 'center', gap: 10,
      padding: '12px 14px', borderRadius: 10,
      background: 'rgba(0,0,0,0.30)',
      border: '1px solid rgba(255,255,255,0.10)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
        <div style={{
          fontSize: 13,
          color: '#FFD9A8',
          fontFamily: multiline ? "'Inter', system-ui, sans-serif" : "'JetBrains Mono', ui-monospace, monospace",
          wordBreak: 'break-word',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          overflow: multiline ? 'visible' : 'hidden',
          textOverflow: multiline ? 'clip' : 'ellipsis',
          lineHeight: multiline ? 1.5 : 1.3,
        }}>{value}</div>
      </div>
      <button onClick={onCopy} style={{
        padding: '7px 12px', borderRadius: 8,
        background: copied ? '#5EEAD4' : 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: copied ? '#0B1F3A' : '#fff',
        fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}
