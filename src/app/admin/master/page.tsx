'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * /admin/master — CEO COMMAND CENTER (2026-06-15 full rebuild per Peter:
 * "every important metric, organized so I can read it in 5 seconds").
 * Sections, top to bottom:
 *   1. TODAY vs YESTERDAY email scoreboard (sent/opened/clicked/replied/bounce)
 *   2. MONEY (ARR/MRR/customers) + software account balances + health dots
 *   3. WHO TO CALL NOW (hot leads — replies/clicks)
 *   4. ENGAGEMENT lists: opened today · opened yesterday · clicked
 *   5. LEAD INVENTORY (cited-homeowner supply)
 * Data: /api/admin/master (20s) + /api/admin/connectors (120s).
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

type DayStat = { date: string; sent: number; opened: number; unique_opened: number; clicks: number; replies: number }

type Master = {
  asOf: string
  call_queue: Row[]
  openers: Row[]
  ledger: Row[]
  revenue: {
    paying_customers: number
    trialing: number
    mrr: number
    arr: number
    customers: Array<{ email: string | null; name: string | null; net_monthly: number; status: string; internal: boolean; promo_code: string | null }>
    internal_subs: number
  }
  outreach: {
    sent_today: number | null
    opened_today: number | null
    emails_sent: number
    opened_total: number
    open_rate: number
    bounce_rate: number
    bounced_total: number
    replies: number
    clicks: number
    report_visits: number
    trials: number
    paid_conversions: number
    daily: DayStat[]
  }
  leads: { inventory_total: number; inventory_enforcement: number; drops_last_7d: number }
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
const GREEN = '#16a34a'
const INK = '#1f2937'
const MUTED = '#6b7280'
const ORANGE = '#E8742B'
const CARDBG = '#fff'
const BORDER = '#E3D8C2'

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
// CST calendar-day key for bucketing opened-today vs opened-yesterday.
function cstDayKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
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
    const idC = setInterval(loadConn, 120_000)
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

  // hot board: replies OR 2+ clicks
  const board = useMemo(() => {
    if (!data) return []
    return data.ledger
      .filter((r) => !r.dispositioned && (r.replies > 0 || r.clicks >= 2))
      .sort((a, b) => (b.replies > 0 ? 1 : 0) - (a.replies > 0 ? 1 : 0) || b.clicks - a.clicks || b.score - a.score)
  }, [data])

  // engagement buckets by CST day
  const { openedToday, openedYesterday, clickers } = useMemo(() => {
    const todayKey = cstDayKey(new Date())
    const yKey = cstDayKey(new Date(Date.now() - 86400000))
    const op = data?.openers ?? []
    return {
      openedToday: op.filter((r) => r.last_activity && cstDayKey(new Date(r.last_activity)) === todayKey),
      openedYesterday: op.filter((r) => r.last_activity && cstDayKey(new Date(r.last_activity)) === yKey),
      clickers: op.filter((r) => r.clicks > 0).sort((a, b) => b.clicks - a.clicks),
    }
  }, [data])

  if (loading) return <Shell><p style={{ color: MUTED, fontWeight: 700, fontSize: 18 }}>Loading…</p></Shell>
  if (err || !data) return <Shell><p style={{ color: RED, fontWeight: 800, fontSize: 18 }}>{err || 'No data'}</p></Shell>

  const o = data.outreach
  const rev = data.revenue
  const visible = board.filter((r) => !hidden.has(r.email))
  const daily = o.daily ?? []
  const todayStat = daily[daily.length - 1]
  const ydayStat = daily[daily.length - 2]

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: INK, letterSpacing: '-0.03em' }}>Command Center</h1>
        <div style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>
          updated {new Date(data.asOf).toLocaleTimeString()} · auto 20s ·{' '}
          <button onClick={load} style={{ border: 'none', background: 'transparent', color: ORANGE, fontWeight: 800, cursor: 'pointer', fontSize: 12, padding: 0 }}>refresh</button>
        </div>
      </div>

      {/* ===== 1. EMAIL SCOREBOARD — today vs yesterday ===== */}
      <SectionTitle>📧 Outreach — today vs yesterday</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 10 }}>
        <Compare label="Sent" today={todayStat?.sent} yday={ydayStat?.sent} />
        <Compare label="Opened" today={todayStat?.opened} yday={ydayStat?.opened} />
        <Compare label="Unique opens" today={todayStat?.unique_opened} yday={ydayStat?.unique_opened} />
        <Compare label="Clicked" today={todayStat?.clicks} yday={ydayStat?.clicks} highlightZero />
        <Compare label="Replied" today={todayStat?.replies} yday={ydayStat?.replies} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
        <Pill label="Open rate" value={`${(o.open_rate * 100).toFixed(0)}%`} good={o.open_rate >= 0.25} />
        <Pill label="Bounce rate" value={`${(o.bounce_rate * 100).toFixed(1)}%`} good={o.bounce_rate < 0.05} warn={o.bounce_rate >= 0.05} />
        <Pill label="Total sent (all-time)" value={String(o.emails_sent)} />
        <Pill label="Free-lead visits" value={String(o.report_visits)} />
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 22 }}>Note: Instantly buckets days in UTC (rolls 7pm CST), so "today" mixes last night's tail + this morning. Clicks come from our free-lead pageview counter; Instantly's own click tracking reads 0.</div>

      {/* ===== 2. MONEY + ACCOUNTS + HEALTH ===== */}
      <SectionTitle>💰 Money &amp; accounts</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="ARR (real)" value={`$${(rev.arr || 0).toLocaleString()}`} accent={rev.arr > 0 ? GREEN : MUTED} big />
        <Stat label="MRR" value={`$${(rev.mrr || 0).toLocaleString()}`} accent={rev.mrr > 0 ? GREEN : MUTED} />
        <Stat label="Paying customers" value={String(rev.paying_customers)} accent={rev.paying_customers > 0 ? GREEN : MUTED} />
        <Stat label="Trialing" value={String(rev.trialing)} />
        {conn && <Stat label="Apify left / mo" value={conn.connectors.apify.used != null && conn.connectors.apify.cap != null ? `$${(conn.connectors.apify.cap - conn.connectors.apify.used).toFixed(0)}` : '—'} sub={conn.connectors.apify.used != null ? `$${conn.connectors.apify.used.toFixed(0)}/$${conn.connectors.apify.cap}` : undefined} accent={conn.connectors.apify.used != null && conn.connectors.apify.cap != null && (conn.connectors.apify.cap - conn.connectors.apify.used) < 15 ? AMBER : INK} />}
        {conn && <Stat label="BatchData today" value={`$${conn.connectors.batchdata.spent_today.toFixed(2)}`} sub={`$${conn.connectors.batchdata.spent_30d.toFixed(2)}/30d`} />}
        {conn && <Stat label="Instantly sent today" value={conn.connectors.instantly.sent_today != null ? String(conn.connectors.instantly.sent_today) : '—'} sub={`cap ${conn.connectors.instantly.daily_limit ?? '?'}`} />}
      </div>
      {/* health dots */}
      {conn && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
          <Dot on={conn.connectors.supabase.green} label="Supabase" />
          <Dot on={conn.connectors.vercel.green} label="Vercel" />
          <Dot on={!conn.connectors.apify.error} label="Apify" />
          <Dot on={!conn.connectors.batchdata.error} label="BatchData" />
          <Dot on={!conn.connectors.instantly.error && conn.connectors.instantly.status === 1} label="Instantly" />
          <Dot on={!conn.stripe_error} label="Stripe" />
        </div>
      )}
      {/* clients */}
      <div style={{ background: CARDBG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 16px', marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Signed-up customers ({rev.customers.filter((c) => !c.internal).length})</div>
        {rev.customers.filter((c) => !c.internal).length === 0 && <div style={{ fontSize: 13.5, color: MUTED, fontWeight: 600 }}>No paying customers yet — the call board below is how you land #1.</div>}
        {rev.customers.filter((c) => !c.internal).map((c, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 13.5, borderBottom: '1px solid #F1EBDD' }}>
            <span style={{ fontWeight: 700, color: INK }}>{c.email || c.name || '—'} <span style={{ color: MUTED, fontWeight: 600 }}>· {c.status}{c.promo_code ? ` · ${c.promo_code}` : ''}</span></span>
            <span style={{ fontWeight: 800, color: GREEN }}>${c.net_monthly}/mo</span>
          </div>
        ))}
      </div>

      {/* ===== 3. WHO TO CALL NOW ===== */}
      <SectionTitle>🔥 Who to call now ({visible.length})</SectionTitle>
      {visible.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', background: CARDBG, border: `1px solid ${BORDER}`, borderRadius: 14, marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Nobody at 2+ clicks / replied right now.</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4, fontWeight: 600 }}>Work the &ldquo;clicked&rdquo; + &ldquo;opened today&rdquo; lists below.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
          {visible.map((r) => {
            const replied = r.replies > 0
            const ph = r.phone || phones[r.email]
            return (
              <div key={r.email} style={{ background: replied ? '#fef2f2' : '#fffbeb', border: `2px solid ${replied ? RED : AMBER}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 900, background: replied ? RED : AMBER, color: '#fff', whiteSpace: 'nowrap' }}>{replied ? '🔥 REPLIED' : `👀 ${r.clicks} CLICKS`}</span>
                  <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: INK }}>{replied ? 'replied' : 'clicked'} {ago(r.last_activity)}</span>
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: MUTED }}>{clockTime(r.last_activity)}</span>
                  </span>
                </div>
                <div style={{ fontSize: 21, fontWeight: 900, color: INK, lineHeight: 1.1 }}>{r.business || r.email.split('@')[0]}</div>
                {ph ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a href={`tel:${ph}`} style={{ fontSize: 23, fontWeight: 900, color: ORANGE, textDecoration: 'none' }}>{ph}</a>
                    <button onClick={() => copyPhone(ph)} title="copy" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15 }}>{copied === ph ? '✓' : '⧉'}</button>
                  </div>
                ) : (
                  <button onClick={() => enrichPhone(r.email)} disabled={enriching.has(r.email)} style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer', border: `2px solid ${ORANGE}`, background: '#fff', color: ORANGE }}>{enriching.has(r.email) ? 'getting…' : '📞 get #'}</button>
                )}
                <div style={{ fontSize: 12.5, color: '#374151', fontWeight: 600 }}>{[r.city, r.state].filter(Boolean).join(', ') || 'location unknown'}<span style={{ color: r.in_call_window ? GREEN : RED, fontWeight: 700 }}> · {r.local_time}{!r.in_call_window && ' ⚠'}</span></div>
                <div style={{ fontSize: 11.5, color: MUTED }}>{r.email}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {DISPOS.map((d) => (
                    <button key={d.key} onClick={() => disposition(r.email, d.key)} style={{ flex: d.key === 'booked_call' ? '1 1 100%' : '1 1 auto', padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: `1px solid ${d.key === 'booked_call' ? GREEN : '#D3C5A9'}`, background: d.key === 'booked_call' ? GREEN : '#fff', color: d.key === 'booked_call' ? '#fff' : '#374151' }}>{d.label}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== 4. ENGAGEMENT LISTS ===== */}
      <SectionTitle>👥 Engagement</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }}>
        <EngList title={`Clicked their lead (${clickers.length})`} rows={clickers} accent={AMBER} phones={phones} enriching={enriching} onEnrich={enrichPhone} showMetric="clicks" />
        <EngList title={`Opened today (${openedToday.length})`} rows={openedToday} accent={GREEN} phones={phones} enriching={enriching} onEnrich={enrichPhone} showMetric="opens" />
        <EngList title={`Opened yesterday (${openedYesterday.length})`} rows={openedYesterday} accent={MUTED} phones={phones} enriching={enriching} onEnrich={enrichPhone} showMetric="opens" />
      </div>

      {/* ===== 5. LEAD INVENTORY ===== */}
      <SectionTitle>🏚️ Lead inventory (the product)</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 40 }}>
        <Stat label="Total leads banked" value={data.leads.inventory_total.toLocaleString()} />
        <Stat label="Cited homeowners (enforcement)" value={data.leads.inventory_enforcement.toLocaleString()} accent={ORANGE} />
        <Stat label="Leads dropped (last 7d)" value={String(data.leads.drops_last_7d)} />
        <Stat label="Trials started" value={String(o.trials)} />
        <Stat label="Paid conversions" value={String(o.paid_conversions)} accent={o.paid_conversions > 0 ? GREEN : MUTED} />
      </div>
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 900, color: INK, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</h2>
}

function Compare({ label, today, yday, highlightZero }: { label: string; today?: number; yday?: number; highlightZero?: boolean }) {
  const t = today ?? 0
  const zeroBad = highlightZero && t === 0
  return (
    <div style={{ background: CARDBG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: zeroBad ? RED : INK, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{t}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginTop: 3 }}>{label} today</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginTop: 2 }}>yest: {yday ?? '—'}</div>
    </div>
  )
}

function Stat({ label, value, sub, accent, big }: { label: string; value: string; sub?: string; accent?: string; big?: boolean }) {
  return (
    <div style={{ background: CARDBG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: big ? 26 : 21, fontWeight: 900, color: accent ?? INK, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Pill({ label, value, good, warn }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  const color = warn ? RED : good ? GREEN : INK
  return <span><span style={{ color, fontWeight: 900 }}>{value}</span> <span style={{ color: MUTED, fontWeight: 600 }}>{label}</span></span>
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: on ? GREEN : RED, marginRight: 5 }} />{label} {on ? 'ok' : 'DOWN'}</span>
}

function EngList({ title, rows, accent, phones, enriching, onEnrich, showMetric }: {
  title: string
  rows: Row[]
  accent: string
  phones: Record<string, string>
  enriching: Set<string>
  onEnrich: (email: string) => void
  showMetric: 'clicks' | 'opens'
}) {
  return (
    <div style={{ background: CARDBG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 12.5, fontWeight: 900, color: accent, marginBottom: 8 }}>{title}</div>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600 }}>None.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
        {rows.slice(0, 40).map((r) => {
          const ph = r.phone || phones[r.email]
          const metric = showMetric === 'clicks' ? `${r.clicks}clk` : `${r.opens}op`
          return (
            <div key={r.email} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, borderBottom: '1px solid #F4EFE3', paddingBottom: 4 }}>
              <span style={{ fontWeight: 800, color: accent, minWidth: 38 }}>{metric}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.business || r.email.split('@')[0]}</span>
                <span style={{ display: 'block', fontSize: 10.5, color: MUTED }}>{clockTime(r.last_activity)} · {[r.city, r.state].filter(Boolean).join(',') || '?'}</span>
              </span>
              {ph ? (
                <a href={`tel:${ph}`} style={{ fontWeight: 800, color: ORANGE, textDecoration: 'none', whiteSpace: 'nowrap', fontSize: 12.5 }}>{ph}</a>
              ) : (
                <button onClick={() => onEnrich(r.email)} disabled={enriching.has(r.email)} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: `1px solid ${ORANGE}`, background: '#fff', color: ORANGE, whiteSpace: 'nowrap' }}>{enriching.has(r.email) ? '…' : '📞'}</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
