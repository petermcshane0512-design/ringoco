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

type Connectors = {
  asOf: string
  arr: number
  clients: Array<{ email: string | null; name: string | null; monthly: number; status: string; since: string | null }>
  stripe_error: string | null
  connectors: {
    apify: { used: number | null; cap: number | null; error?: string }
    batchdata: { spent_today: number; spent_30d: number; daily_cap: number; error?: string }
    instantly: { sent_today: number | null; daily_limit: number | null; status: number | string | null; error?: string }
    supabase: { green: boolean }
    vercel: { green: boolean }
  }
}

const TAN = '#F2EAD9'
const RED = '#dc2626'
const AMBER = '#d97706'
const INK = '#1f2937'
const MUTED = '#6b7280'
const ORANGE = '#E8742B'

function ago(ts: string | null): string {
  if (!ts) return '—'
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function clockTime(ts: string | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

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
  const [conn, setConn] = useState<Connectors | null>(null)

  const loadConn = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/connectors', { cache: 'no-store' })
      if (r.ok) setConn(await r.json())
    } catch { /* non-fatal */ }
  }, [])

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
    load(); loadConn()
    const id = setInterval(load, 20_000)
    const idC = setInterval(loadConn, 120_000)   // money/health changes slowly
    return () => { clearInterval(id); clearInterval(idC) }
  }, [load, loadConn])

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
                  {/* LAST CLICK time — when they actually last engaged */}
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: INK }}>{replied ? 'replied' : 'clicked'} {ago(r.last_activity)}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: MUTED }}>{clockTime(r.last_activity)}</span>
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

                {/* where + their local time (call-window flag) + email */}
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                  {[r.city, r.state].filter(Boolean).join(', ') || 'location unknown'}
                  <span style={{ color: r.in_call_window ? '#15803d' : RED, fontWeight: 700 }}> · {r.local_time} their time{!r.in_call_window && ' ⚠'}</span>
                </div>
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

      {/* ── METRICS / CONNECTORS strip (below the board) ── */}
      {conn && <MetricsStrip conn={conn} />}
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

function MetricsStrip({ conn }: { conn: Connectors }) {
  const c = conn.connectors
  const apifyLeft = c.apify.used != null && c.apify.cap != null ? c.apify.cap - c.apify.used : null
  const dot = (green: boolean) => (
    <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: green ? '#16a34a' : RED, marginRight: 5 }} />
  )
  return (
    <div style={{ marginTop: 32, borderTop: `1px solid #E3D8C2`, paddingTop: 18 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Business & accounts</h2>

      {/* money + ARR */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Card label="ARR (real)" value={`$${conn.arr.toLocaleString()}`} big accent={conn.arr === 0 ? MUTED : '#16a34a'} />
        <Card label="Apify left (this mo)"
          value={apifyLeft != null ? `$${apifyLeft.toFixed(0)}` : (c.apify.error ? 'err' : '—')}
          sub={c.apify.used != null ? `$${c.apify.used.toFixed(0)} / $${c.apify.cap} used` : undefined}
          accent={apifyLeft != null && apifyLeft < 15 ? AMBER : INK} />
        <Card label="BatchData spend"
          value={`$${c.batchdata.spent_today.toFixed(2)}`}
          sub={`today · $${c.batchdata.spent_30d.toFixed(2)} 30d · $${c.batchdata.daily_cap}/day cap`} />
        <Card label="Instantly sent today"
          value={c.instantly.sent_today != null ? String(c.instantly.sent_today) : '—'}
          sub={`${c.instantly.daily_limit ?? '?'}/day cap · status ${c.instantly.status ?? '?'}`} />
      </div>

      {/* green status row */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>
        <span>{dot(c.supabase.green)} Supabase {c.supabase.green ? 'green' : 'DOWN'}</span>
        <span>{dot(c.vercel.green)} Vercel {c.vercel.green ? 'green' : 'DOWN'}</span>
        <span>{dot(!c.apify.error)} Apify {c.apify.error ? 'error' : 'ok'}</span>
        <span>{dot(!c.batchdata.error)} BatchData {c.batchdata.error ? 'error' : 'ok'}</span>
        <span>{dot(!c.instantly.error && c.instantly.status === 1)} Instantly {c.instantly.status === 1 ? 'active' : 'paused/err'}</span>
      </div>

      {/* signed-up clients */}
      <div style={{ background: '#fff', border: `1px solid #E3D8C2`, borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Signed-up clients ({conn.clients.length})
        </div>
        {conn.stripe_error && <div style={{ color: RED, fontSize: 12.5, fontWeight: 600 }}>Stripe error: {conn.stripe_error}</div>}
        {!conn.stripe_error && conn.clients.length === 0 && (
          <div style={{ fontSize: 13.5, color: MUTED, fontWeight: 600 }}>No paying clients yet — the board above is how you get the first one.</div>
        )}
        {conn.clients.map((cl, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: i < conn.clients.length - 1 ? '1px solid #F1EBDD' : 'none', fontSize: 13.5 }}>
            <span style={{ fontWeight: 700, color: INK }}>{cl.email || cl.name || '—'}</span>
            <span style={{ fontWeight: 700, color: '#16a34a' }}>${cl.monthly}/mo</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({ label, value, sub, big, accent }: { label: string; value: string; sub?: string; big?: boolean; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E3D8C2', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: big ? 24 : 19, fontWeight: 900, color: accent ?? INK, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
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
