'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * /admin/master — CEO Nucleus (2026-06-12 redesign per Peter).
 * Dense founder command center: Bloomberg Terminal, not a marketing
 * dashboard. Priority order on the page:
 *   1. CALL NOW queue — scored prospects (replied pinned, clicks decay,
 *      opens decay, +recency), phone click-to-copy + tel:, local time
 *      with outside-call-window flag, per-row dispositions.
 *   2. LEDGER — Today / Yesterday / All tabs, sortable, searchable.
 *   3. Metrics (demoted): money, campaigns, funnel strip, pushes, supply.
 * Auto-refresh 60s. No charts beyond the existing push bars. No animations.
 */

type QueueRow = {
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
  first_contacted: string | null
  stage: string
  score: number
  dispositioned: boolean
  disposition: string | null
}

type Master = {
  asOf: string
  call_queue: QueueRow[]
  ledger: QueueRow[]
  revenue: {
    paying_customers: number
    trialing: number
    mrr: number
    arr: number
    customers: Array<{ email: string | null; name: string | null; list_monthly: number; net_monthly: number; interval: string; status: string; promo_code: string | null; started: string | null; internal: boolean }>
    internal_subs: number
    internal_burn_monthly: number
    stripe_error: string | null
  }
  outreach: {
    pushed_total: number
    pushed_today: number
    emails_sent: number
    opened_total: number
    open_rate: number
    replies: number
    clicks: number
    report_visits: number
    text_opt_ins: number
    demos_booked: number
    trials: number
    paid_conversions: number
    campaigns: Array<{ name: string; status: string | number | null; sent: number; opens: number; replies: number; clicks: number; bounced: number }>
    instantly_error: string | null
    days: Array<{ date: string; sent: number }>
  }
  leads: { inventory_total: number; inventory_enforcement: number; drops_last_7d: number }
}

const TAN = '#F2EAD9'
const BORDER = '#E3D8C2'
const ORANGE = '#E8742B'
const INK = '#1f2937'
const MUTED = '#6b7280'
const RED = '#dc2626'
const AMBER = '#d97706'

const DISPOSITIONS: Array<{ key: string; label: string }> = [
  { key: 'called', label: 'Called' },
  { key: 'voicemail', label: 'VM' },
  { key: 'no_answer', label: 'No ans' },
  { key: 'bad_number', label: 'Bad #' },
  { key: 'booked_call', label: 'BOOKED' },
]

function ago(ts: string | null): string {
  if (!ts) return '—'
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function MasterPage() {
  const [data, setData] = useState<Master | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'today' | 'yesterday' | 'all'>('today')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<keyof QueueRow>('score')
  const [sortDesc, setSortDesc] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [phones, setPhones] = useState<Record<string, string>>({})   // email → fetched phone
  const [enriching, setEnriching] = useState<Set<string>>(new Set())

  async function enrichPhone(email: string) {
    setEnriching((s) => new Set(s).add(email))
    try {
      const r = await fetch('/api/admin/enrich-phone', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const j = await r.json()
      if (j.ok && j.phone) setPhones((p) => ({ ...p, [email]: j.phone }))
      else alert(`No phone found: ${j.error || 'Google listing had none'}`)
    } catch (e) { alert(`Enrich failed: ${(e as Error).message}`) }
    setEnriching((s) => { const n = new Set(s); n.delete(email); return n })
  }

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
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  async function disposition(email: string, action: string) {
    setHidden((h) => new Set(h).add(email))  // optimistic
    const r = await fetch('/api/admin/dispositions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, action }),
    })
    if (!r.ok) {
      setHidden((h) => { const n = new Set(h); n.delete(email); return n })
      const j = await r.json().catch(() => ({}))
      alert(`Disposition failed: ${j.error || r.status}${String(j.error || '').includes('lead_dispositions') ? '\n\nRun sql/2026-06-12-lead-dispositions.sql in Supabase SQL Editor first.' : ''}`)
    }
  }

  function copyPhone(p: string) {
    navigator.clipboard?.writeText(p).then(() => { setCopied(p); setTimeout(() => setCopied(null), 1200) })
  }

  const ledgerRows = useMemo(() => {
    if (!data) return []
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const todayStart = now.getTime()
    const yStart = todayStart - 86_400_000
    let rows = data.ledger
    if (tab !== 'all') {
      rows = rows.filter((r) => {
        if (!r.last_activity) return false
        const t = new Date(r.last_activity).getTime()
        return tab === 'today' ? t >= todayStart : t >= yStart && t < todayStart
      })
    }
    const q = search.toLowerCase().trim()
    if (q) rows = rows.filter((r) => [r.business, r.email, r.city, r.state, r.phone].some((f) => (f || '').toLowerCase().includes(q)))
    const dir = sortDesc ? -1 : 1
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [data, tab, search, sortKey, sortDesc])

  if (loading) return <Shell><p style={{ color: MUTED, fontWeight: 600 }}>Loading…</p></Shell>
  if (err || !data) return <Shell><p style={{ color: RED, fontWeight: 700 }}>{err || 'No data'}</p></Shell>

  const { revenue: rev, outreach: o, leads } = data
  const queue = data.call_queue.filter((r) => !hidden.has(r.email))
  const maxSent = Math.max(1, ...o.days.map((d) => d.sent))

  const th = (label: string, key: keyof QueueRow) => (
    <th
      onClick={() => { if (sortKey === key) setSortDesc(!sortDesc); else { setSortKey(key); setSortDesc(true) } }}
      style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 800, color: sortKey === key ? INK : MUTED, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
    >{label}{sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : ''}</th>
  )

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>Nucleus</h1>
        <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>
          refreshed {new Date(data.asOf).toLocaleTimeString()} · auto 60s ·{' '}
          <button onClick={load} style={{ border: 'none', background: 'transparent', color: ORANGE, fontWeight: 700, cursor: 'pointer', fontSize: 11, padding: 0 }}>refresh</button>
        </span>
      </div>

      {/* ════ 1. CALL NOW ════ */}
      <Section title={`📞 CALL NOW — ${queue.length} in queue`} accent>
        {queue.length === 0 ? (
          <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>Queue empty — nobody hot right now. It refills as opens/clicks/replies land.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr>
                <th style={thStatic}>SCORE</th><th style={thStatic}>BUSINESS</th><th style={thStatic}>PHONE</th>
                <th style={thStatic}>EMAIL</th><th style={thStatic}>WHERE</th><th style={thStatic}>LOCAL</th>
                <th style={thStatic}>OP</th><th style={thStatic}>CL</th><th style={thStatic}>LAST</th>
                <th style={thStatic}>STAGE</th><th style={thStatic}>DISPOSITION</th>
              </tr></thead>
              <tbody>
                {queue.map((r) => (
                  <tr key={r.email} style={{
                    borderLeft: r.replies > 0 ? `3px solid ${RED}` : r.clicks > 0 ? `3px solid ${AMBER}` : '3px solid transparent',
                    background: r.replies > 0 ? '#fef2f2' : r.stage === 'CLICKED LEAD' ? '#fffbeb' : undefined,
                  }}>
                    <Td strong>{r.score}</Td>
                    <Td strong>{r.business || '—'}{r.contact ? <span style={{ color: MUTED, fontWeight: 500 }}> · {r.contact}</span> : null}</Td>
                    <Td>
                      {(r.phone || phones[r.email]) ? (() => {
                        const ph = r.phone || phones[r.email]
                        return (
                          <span style={{ whiteSpace: 'nowrap' }}>
                            <a href={`tel:${ph}`} style={{ color: ORANGE, fontWeight: 800, textDecoration: 'none' }}>{ph}</a>
                            <button onClick={() => copyPhone(ph)} title="copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, padding: '0 4px' }}>
                              {copied === ph ? '✓' : '⧉'}
                            </button>
                          </span>
                        )
                      })() : (
                        <button onClick={() => enrichPhone(r.email)} disabled={enriching.has(r.email)} style={{
                          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 800, cursor: enriching.has(r.email) ? 'wait' : 'pointer',
                          border: '1px solid #fed7aa', background: '#fef3ec', color: '#c2410c',
                        }}>{enriching.has(r.email) ? '…' : '📞 get #'}</button>
                      )}
                    </Td>
                    <Td>{r.email}</Td>
                    <Td>{[r.city, r.state].filter(Boolean).join(', ') || '—'}</Td>
                    <Td><span style={{ color: r.in_call_window ? INK : RED, fontWeight: 700 }}>{r.local_time}{!r.in_call_window && ' ⚠'}</span></Td>
                    <Td>{r.opens}</Td>
                    <Td>{r.clicks}</Td>
                    <Td>{ago(r.last_activity)}</Td>
                    <Td><Badge bg={r.stage === 'REPLIED' ? '#fef2f2' : r.stage.startsWith('CLICKED') ? '#fffbeb' : '#F9F5EC'} color={r.stage === 'REPLIED' ? RED : r.stage.startsWith('CLICKED') ? AMBER : MUTED}>{r.stage === 'CLICKED LEAD' ? '👀 CLICKED LEAD' : r.stage}</Badge></Td>
                    <Td>
                      <span style={{ display: 'inline-flex', gap: 3 }}>
                        {DISPOSITIONS.map((d) => (
                          <button key={d.key} onClick={() => disposition(r.email, d.key)} style={{
                            padding: '2px 6px', borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            border: `1px solid ${d.key === 'booked_call' ? '#bbf7d0' : BORDER}`,
                            background: d.key === 'booked_call' ? '#f0fdf4' : '#fff',
                            color: d.key === 'booked_call' ? '#15803d' : '#374151',
                          }}>{d.label}</button>
                        ))}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ════ 2. LEDGER ════ */}
      <Section title="Lead activity ledger">
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['today', 'yesterday', 'all'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${tab === t ? ORANGE : BORDER}`,
              background: tab === t ? '#fef3ec' : '#fff',
              color: tab === t ? '#c2410c' : MUTED, textTransform: 'capitalize',
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search business / email / city / phone"
            style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, minWidth: 240, fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{ledgerRows.length} rows</span>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              {th('Score', 'score')}{th('Business', 'business')}{th('Email', 'email')}{th('Phone', 'phone')}
              {th('Where', 'city')}{th('Opens', 'opens')}{th('Clicks', 'clicks')}{th('Replies', 'replies')}
              {th('First contact', 'first_contacted')}{th('Last activity', 'last_activity')}{th('Stage', 'stage')}
            </tr></thead>
            <tbody>
              {ledgerRows.map((r) => (
                <tr key={r.email} style={{ borderLeft: r.replies > 0 ? `3px solid ${RED}` : r.clicks > 0 ? `3px solid ${AMBER}` : '3px solid transparent' }}>
                  <Td strong>{r.score}</Td>
                  <Td strong>{r.business || '—'}</Td>
                  <Td>{r.email}</Td>
                  <Td>{r.phone || '—'}</Td>
                  <Td>{[r.city, r.state].filter(Boolean).join(', ') || '—'}</Td>
                  <Td>{r.opens}</Td><Td>{r.clicks}</Td><Td>{r.replies}</Td>
                  <Td>{r.first_contacted ? new Date(r.first_contacted).toLocaleDateString() : '—'}</Td>
                  <Td>{ago(r.last_activity)}</Td>
                  <Td><Badge bg="#F9F5EC" color={MUTED}>{r.stage}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ════ 3. METRICS (demoted) ════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Stat label="Paying (real)" value={String(rev.paying_customers)} big />
        <Stat label="MRR (net)" value={`$${rev.mrr.toLocaleString()}`} big />
        <Stat label="Sent today (pushed)" value={String(o.pushed_today)} />
        <Stat label="Emails sent" value={o.emails_sent.toLocaleString()} />
        <Stat label="Open rate" value={`${(o.open_rate * 100).toFixed(1)}%`} />
        <Stat label="Replies" value={String(o.replies)} />
        <Stat label="Site visits" value={String(o.report_visits)} />
        <Stat label="Test subs ($/mo)" value={`${rev.internal_subs} ($${rev.internal_burn_monthly})`} />
      </div>

      {/* Funnel strip */}
      <Section title="Funnel">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, alignItems: 'center' }}>
          {[
            ['sent', o.emails_sent], ['opens', o.opened_total], ['clicks', o.clicks], ['replies', o.replies],
            ['visits', o.report_visits], ['trials', o.trials], ['PAID', o.paid_conversions],
          ].map(([l, n], i, arr) => (
            <span key={String(l)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ padding: '4px 10px', borderRadius: 6, background: l === 'PAID' ? '#f0fdf4' : '#F9F5EC', border: `1px solid ${l === 'PAID' ? '#bbf7d0' : BORDER}`, color: l === 'PAID' ? '#15803d' : INK }}>
                {String(n).toLocaleString()} <span style={{ color: MUTED, fontWeight: 600 }}>{l}</span>
              </span>
              {i < arr.length - 1 && <span style={{ color: MUTED }}>→</span>}
            </span>
          ))}
        </div>
      </Section>

      {/* Campaigns */}
      <Section title={`Campaigns${o.instantly_error ? ' — INSTANTLY ERROR' : ''}`}>
        {o.instantly_error && <p style={{ color: RED, fontSize: 12, fontWeight: 600 }}>{o.instantly_error}</p>}
        {o.campaigns.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, fontSize: 12, fontWeight: 600, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800 }}>{c.name}</span>
            <span>status {String(c.status)}</span>
            <span>{c.sent.toLocaleString()} sent</span>
            <span>{c.opens} opens ({c.sent ? ((c.opens / c.sent) * 100).toFixed(1) : 0}%)</span>
            <span>{c.clicks} clicks</span>
            <span style={{ color: c.replies ? RED : MUTED }}>{c.replies} replies</span>
            <span style={{ color: c.bounced / Math.max(1, c.sent) > 0.03 ? RED : MUTED }}>{c.bounced} bounced</span>
          </div>
        ))}
      </Section>

      {/* Pushes + supply */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }} className="nuc-bottom">
        <Section title="Prospects pushed — 14d">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70 }}>
            {o.days.map((d) => (
              <div key={d.date} title={`${d.date}: ${d.sent}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: `${(d.sent / maxSent) * 85}%`, minHeight: d.sent > 0 ? 2 : 0, background: ORANGE, borderRadius: '2px 2px 0 0' }} />
                <div style={{ fontSize: 8, color: MUTED, textAlign: 'center', fontWeight: 600 }}>{d.date.slice(8)}</div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Lead supply">
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', lineHeight: 1.9 }}>
            {leads.inventory_total.toLocaleString()} homeowner leads<br />
            {leads.inventory_enforcement.toLocaleString()} city-cited ({leads.inventory_total ? Math.round((leads.inventory_enforcement / leads.inventory_total) * 100) : 0}%)<br />
            {leads.drops_last_7d} delivered last 7d
          </div>
        </Section>
      </div>

      {/* Test subs (kept as-is, bottom) */}
      {rev.customers.some((c) => c.internal) && (
        <Section title={`Your own test subs — NOT revenue (${rev.internal_subs} subs, $${rev.internal_burn_monthly}/mo billing your card)`}>
          <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {rev.customers.filter((c) => c.internal).map((c, i) => (
                  <tr key={i}>
                    <Td strong>{c.email || c.name || '—'}</Td>
                    <Td>${c.net_monthly}/mo <span style={{ color: MUTED }}>(list ${c.list_monthly})</span></Td>
                    <Td>{c.promo_code || '—'}</Td>
                    <Td>{c.started ? new Date(c.started).toLocaleDateString() : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <style>{`
        @media (max-width: 900px) { .nuc-bottom { grid-template-columns: 1fr !important; } }
      `}</style>
    </Shell>
  )
}

const thStatic: React.CSSProperties = {
  textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 800, color: MUTED,
  textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: TAN, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: INK, padding: '16px clamp(10px, 2vw, 28px) 60px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>{children}</div>
    </main>
  )
}

function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <section style={{
      background: '#ffffff',
      border: accent ? `2px solid ${ORANGE}` : `1px solid ${BORDER}`,
      borderRadius: 10, padding: '10px 14px', marginBottom: 12,
    }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color: accent ? '#c2410c' : MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 11px' }}>
      <div style={{ fontSize: big ? 21 : 16, fontWeight: 800, color: big ? ORANGE : INK, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <td style={{ padding: '5px 8px', borderBottom: '1px solid #F1EBDD', fontWeight: strong ? 700 : 500, color: strong ? INK : '#374151', whiteSpace: 'nowrap' }}>{children}</td>
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ padding: '1px 7px', borderRadius: 5, fontSize: 10, fontWeight: 800, background: bg, color }}>{children}</span>
}
