'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * AddressAutocomplete — debounced Google Places dropdown for business
 * address entry. Used on /start/area and the dashboard ProfileGate.
 *
 * 2026-06-11 per Peter: free-text address entry produced un-geocodable
 * strings ("couldn't verify that address") which left business_lat null
 * and scattered the leads. Forcing a pick from real Google predictions
 * guarantees the downstream geocode resolves.
 *
 * Controlled input: parent owns `value`. onChange fires on every
 * keystroke (so manual entry still works as a fallback); onSelect fires
 * when the user picks a prediction (clean, guaranteed-geocodable string).
 * Dark command-center styling to match the surrounding UI.
 */

type Prediction = { description: string; place_id: string }

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  autoFocus,
  inputStyle,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  inputStyle?: React.CSSProperties
}) {
  const [preds, setPreds] = useState<Prediction[]>([])
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (picked) { setPicked(false); return } // don't re-query right after a pick
    const q = value.trim()
    if (q.length < 3) { setPreds([]); setOpen(false); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places-autocomplete?q=${encodeURIComponent(q)}`)
        const j = await r.json()
        setPreds(j.predictions || [])
        setOpen((j.predictions || []).length > 0)
      } catch { setPreds([]); setOpen(false) }
    }, 280)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(p: Prediction) {
    setPicked(true)
    onChange(p.description)
    setPreds([])
    setOpen(false)
  }

  const base: React.CSSProperties = inputStyle ?? {
    width: '100%', padding: '13px 15px', borderRadius: 10,
    border: '1px solid rgba(94,234,212,0.2)', background: 'rgba(2,8,16,0.6)',
    fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: '#F0FDFA',
    boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (preds.length) setOpen(true) }}
        placeholder={placeholder}
        style={base}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
          background: '#0A1726', border: '1px solid rgba(94,234,212,0.30)',
          borderRadius: 10, overflow: 'hidden',
          boxShadow: '0 16px 40px rgba(4,12,24,0.6)',
        }}>
          {preds.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '11px 14px', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(94,234,212,0.08)',
                color: '#D1FAE5', fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.10)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              📍 {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
