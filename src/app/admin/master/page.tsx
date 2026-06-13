'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * /admin/master — CEO Nucleus, "WHO TO CALL RIGHT NOW" (2026-06-13 redesign
 * per Peter: strip to one job). Shows ONLY leads with 2+ clicks OR a reply,
 * as big urgent cards. Two stats (sent/opened today). Everything else —
 * revenue, funnel, campaigns, push chart, supply, test subs — removed.
 * Reuses /api/admin/master (engagement + sent/opened + disposition logic).
 * Auto-refresh 20s.
 */

type Row = {
  email: string
  business: string | null
  contact: string | null
  phone: string | null
  city: string | null
  state: string | null
  local_time: string
  in_call_window: boolean
  opens: number
  clicks: number
  replies: number
  last_activity: string | null
  stage: string
  score: number
  dispositioned: boolean
}

type Master = {
  asOf: string
  ledger: Row[]
  outreach: { sent_today: number | null; opened_today: number | null }
}

const TAN = '#F2EAD9'
const RED = '#dc2626'
const AMBER = '#d97706'
const INK = '#1f2937'
const MUTED = '#6b7280'
const ORANGE = '#E8742B'

const DISPOS: Array<{ key: string; label: string }> = [
  { key: 'called', label: 'Called' },
  { key: 'voicemail', label: 'VM' },
  { key: 'no_answer', label: 'No Answer' },
  { key: 'booked_call', label: 'BOOKED' },
]

export default function MasterPage() {
  const [data, setData] = useState<Master | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [phones, setPhones] = useState<Record<string, string>>({})
  const [enriching, setEnriching] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/master', { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setErr('Not authorized'); setLoading(false); return }
      const j = await r.json()
      if (!r.ok) { setErr(j.error || `HTTP ${r.status}`); setLoading(false); return }
      setData(j); setErr(null)
    } catch (e) { setErr((e as Error).message) }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 20_000)
    return () => clearInterval(id)
  }, [load])

  async function disposition(email: string, action: string) {
    setHidden((h) => new Set(h).add(email))
    const r = await fetch('/api/admin/dispositions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action }),
    })
    if (!r.ok) {
      setHidden((h) => { const n = new Set(h); n.delete(email); return n })
      const j = await r.json().catch(() => ({}))
      alert(`Disposition failed: ${j.error || r.status}`)
    }
  }
  async function enrichPhone(email: string) {
    setEnriching((s) => new Set(s).add(email))
    try {
      const r = await fetch('/api/admin/enrich-phone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json()
      if (j.ok && j.phone) setPhones((p) => ({ ...p, [email]: j.phone }))
      else alert(`No phone found: ${j.error || 'none on listing'}`)
    } catch (e) { alert(`Enrich failed: ${(e as Error).message}`) }
    setEnriching((s) => { const n = new Set(s); n.delete(email); return n })
  }
  function copyPhone(p: string) {
    navigator.clipboard?.writeText(p).then(() => { setCopied(p); setTimeout(() => setCopied(null), 1200) })
  }

  // THE board: replies OR 2+ clicks only. Replies first, then click count.
  const board = useMemo(() => {
    if (!data) return []
    return data.ledger
      .filter((r) => !r.dispositioned && (r.replies > 0 || r.clicks >= 2))
      .sort((a, b) => (b.replies > 0 ? 1 : 0) - (a.replies > 0 ? 1 : 0) || b.clicks - a.clicks || b.score - a.score)
  }, [data])

  if (loading) return <Shell><p style={{ color: MUTED, fontWeight: 700, fontSize: 18 }}>Loading…</p></Shell>
  if (err || !data) return <Shell><p style={{ color: RED, fontWeight: 800, fontSize: 18 }}>{err || 'No data'}</p></Shell>

  const o = data.outreach
  const visible = board.filter((r) => !hidden.has(r.email))

  return (
    <Shell>
      {/* header + 2 stats */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.03em' }}>Who to call right now</h1>
          <div style={{ fontSize: 12, color: MUTED, fontWeight: 600, marginTop: 2 }}>
            refreshed {new Date(data.asOf).toLocaleTimeString()} · auto 20s ·{' '}
            <button onClick={load} style={{ border: 'none', background: 'transparent', color: ORANGE, fontWeight: 800, cursor: 'pointer', fontSize: 12, padding: 0 }}>refresh</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <MiniStat label="Sent today" value={o.sent_today != null ? String(o.sent_today) : '—'} />
          <MiniStat label="Opened today" value={o.opened_today != null ? String(o.opened_today) : '—'} />
        </div>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: '#fff', border: `1px solid #E3D8C2`, borderRadius: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: INK }}>Nobody hot yet.</div>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 6, fontWeight: 600 }}>This board fills the moment a contractor clicks twice or replies. Refreshing every 20s.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {visible.map((r) => {
            const replied = r.replies > 0
            const ph = r.phone || phones[r.email]
            return (
              <div key={r.email} style={{
                background: replied ? '#fef2f2' : '#fffbeb',
                border: `2px solid ${replied ? RED : AMBER}`,
                borderRadius: 16, padding: 18,
                boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {/* badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 14, fontWeight: 900, letterSpacing: '0.02em',
                    background: replied ? RED : AMBER, color: '#fff', whiteSpace: 'nowrap',
                  }}>{replied ? '🔥 REPLIED' : `👀 ${r.clicks} CLICKS`}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.in_call_window ? '#15803d' : RED, whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {r.local_time}{!r.in_call_window && ' ⚠'}
                  </span>
                </div>

                {/* business name — largest */}
                <div style={{ fontSize: 22, fontWeight: 900, color: INK, lineHeight: 1.1, marginTop: 2 }}>{r.business || r.email.split('@')[0]}</div>
                {r.contact && <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginTop: -2 }}>{r.contact}</div>}

                {/* phone — second largest */}
                {ph ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <a href={`tel:${ph}`} style={{ fontSize: 24, fontWeight: 900, color: ORANGE, textDecoration: 'none', letterSpacing: '-0.01em' }}>{ph}</a>
                    <button onClick={() => copyPhone(ph)} title="copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, padding: 2 }}>{copied === ph ? '✓' : '⧉'}</button>
                  </div>
                ) : (
                  <button onClick={() => enrichPhone(r.email)} disabled={enriching.has(r.email)} style={{
                    marginTop: 4, alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 800,
                    cursor: enriching.has(r.email) ? 'wait' : 'pointer', border: `2px solid ${ORANGE}`, background: '#fff', color: ORANGE,
                  }}>{enriching.has(r.email) ? 'getting…' : '📞 get #'}</button>
                )}

                {/* where + email */}
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{[r.city, r.state].filter(Boolean).join(', ') || 'location unknown'}</div>
                <div style={{ fontSize: 12, color: MUTED }}>{r.email}</div>

                {/* dispositions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {DISPOS.map((d) => (
                    <button key={d.key} onClick={() => disposition(r.email, d.key)} style={{
                      flex: d.key === 'booked_call' ? '1 1 100%' : '1 1 auto',
                      padding: '9px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                      border: `1px solid ${d.key === 'booked_call' ? '#15803d' : '#D3C5A9'}`,
                      background: d.key === 'booked_call' ? '#15803d' : '#fff',
                      color: d.key === 'booked_call' ? '#fff' : '#374151',
                    }}>{d.label}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: TAN, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: INK, padding: '20px clamp(12px, 3vw, 36px) 60px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>
    </main>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E3D8C2', borderRadius: 12, padding: '8px 16px', textAlign: 'center', minWidth: 92 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: INK, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}
