'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

/**
 * Admin /admin/hot-prospects
 *
 * Single-screen dial list of prospects who CLICKED their personalized
 * report from a cold email. Ordered by most-recent open. One-tap to
 * dial, text, or mark booked. Drops the row once contacted.
 *
 * The whole point: signal > volume. Calling a clicker beats blind dials
 * 10-20x. This is the page Peter loads before every call session.
 */

type Prospect = {
  id: string
  email: string
  business_name: string | null
  owner_first_name: string | null
  owner_phone: string | null
  city: string | null
  state: string | null
  trade: string | null
  first_opened_at: string | null
  last_opened_at: string | null
  open_count: number | null
  report_visit_at: string | null
  call_attempted_at: string | null
  text_sent_at: string | null
  demo_booked_at: string | null
  paid_at: string | null
  buyer_score: number | null
  status: string | null
  dnc_until: string | null
}

function relTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function reportUrl(p: Prospect): string {
  const params = new URLSearchParams({
    for: p.business_name || '',
    type: p.trade || 'HVAC',
    l: p.id,
  })
  if (p.city) params.set('city', p.city)
  return `/sample-report?${params.toString()}`
}

export default function HotProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(14)
  const [includeContacted, setIncludeContacted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ days: String(days), includeContacted: String(includeContacted) })
      const r = await fetch(`/api/admin/hot-prospects?${qs}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setProspects(j.prospects || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [days, includeContacted])

  useEffect(() => { load() }, [load])

  async function markAction(id: string, action: 'dialed' | 'texted' | 'demo_booked' | 'paid', outcome?: string, notes?: string) {
    try {
      const r = await fetch('/api/admin/hot-prospects/contacted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, outcome, notes }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        alert(`Failed: ${j.error || r.status}`)
        return
      }
      load()
    } catch (e) {
      alert(`Failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const heat = (p: Prospect): { label: string; bg: string } => {
    const opens = p.open_count ?? 0
    if (opens >= 5) return { label: 'BLAZING', bg: '#DC2626' }
    if (opens >= 3) return { label: 'HOT', bg: '#EA580C' }
    if (opens >= 2) return { label: 'WARM', bg: '#F59E0B' }
    return { label: 'OPENED', bg: '#0AA89F' }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#F5FCFA', fontFamily: "'Inter', system-ui, sans-serif", padding: '32px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em', marginBottom: 4 }}>
              🔥 Hot prospects
            </h1>
            <p style={{ fontSize: 13, color: '#7AAAB2' }}>
              Cold-email recipients who opened their personalized report. Dial these first.
            </p>
          </div>
          <Link href="/admin/queue" style={{ fontSize: 12, color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>
            ← Queue
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, padding: 14, background: '#fff', borderRadius: 12, border: '1px solid rgba(10,168,159,0.14)' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>
            Window:
            <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))}
              style={{ marginLeft: 8, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(10,168,159,0.2)', fontSize: 12 }}>
              <option value={1}>24 hours</option>
              <option value={3}>3 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={includeContacted} onChange={e => setIncludeContacted(e.target.checked)} />
            Include already-contacted
          </label>
          <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: '#0AA89F' }}>
            {prospects.length} prospects
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 60, color: '#7AAAB2' }}>Loading…</div>}
        {error && <div style={{ padding: 20, background: '#FEE2E2', color: '#991B1B', borderRadius: 10 }}>{error}</div>}
        {!loading && !error && prospects.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, background: '#fff', borderRadius: 12, color: '#7AAAB2' }}>
            No clicks yet. Once Instantly emails roll, prospects who open the report show up here.
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {prospects.map(p => {
            const h = heat(p)
            return (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid rgba(10,168,159,0.14)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: h.bg, color: '#fff', letterSpacing: '0.05em' }}>{h.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7AAAB2' }}>
                      {p.open_count ?? 0} open{(p.open_count ?? 0) === 1 ? '' : 's'} · last {relTime(p.last_opened_at)}
                    </span>
                    {p.buyer_score != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0AA89F' }}>· buyer {p.buyer_score}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0B1F3A' }}>
                    {p.business_name || '(no name)'}
                    {p.owner_first_name && <span style={{ fontWeight: 600, color: '#4A7A80', marginLeft: 8 }}>· {p.owner_first_name}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 2 }}>
                    {p.trade || 'HVAC'} · {p.city || '?'}{p.state ? `, ${p.state}` : ''} · {p.email}
                    {p.owner_phone && <span style={{ marginLeft: 8, color: '#0B1F3A', fontWeight: 700 }}>📞 {p.owner_phone}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <a href={reportUrl(p)} target="_blank" rel="noopener noreferrer"
                    style={{ padding: '8px 12px', borderRadius: 8, background: '#F5FDFB', color: '#0AA89F', fontSize: 12, fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(10,168,159,0.3)' }}>
                    👁 Report
                  </a>
                  {p.owner_phone && (
                    <a href={`tel:${p.owner_phone}`}
                      onClick={() => markAction(p.id, 'dialed')}
                      style={{ padding: '8px 14px', borderRadius: 8, background: '#22C55E', color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                      📞 Dial
                    </a>
                  )}
                  {p.owner_phone && (
                    <a href={`sms:${p.owner_phone}`}
                      onClick={() => markAction(p.id, 'texted')}
                      style={{ padding: '8px 12px', borderRadius: 8, background: '#0AA89F', color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                      💬 Text
                    </a>
                  )}
                  <button onClick={() => markAction(p.id, 'demo_booked')}
                    style={{ padding: '8px 12px', borderRadius: 8, background: '#fff', color: '#0B1F3A', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(10,168,159,0.3)' }}>
                    Booked
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
