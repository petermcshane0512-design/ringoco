'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * /admin/master — THE one-page founder command view (2026-06-12 per
 * Peter: "the old live nucleus is garbage"). Replaces the ReactFlow
 * graph at /admin/founder with a flat, dense, readable page:
 *
 *   1. Money — paying customers, MRR/ARR, every subscription with the
 *      promo code it used (LIVE from Stripe).
 *   2. Cold email — sent/opened/replies from INSTANTLY (the
 *      outreach_leads.open_count column is polluted with review counts;
 *      Instantly is the open-tracking truth), per-campaign table,
 *      14-day push bars, downstream funnel, hottest prospects by opens.
 *   3. Lead supply pulse — inventory, enforcement share, drops shipped.
 *
 * Access: admin-only. Data comes from /api/admin/master which gates via
 * requireAdmin() (ADMIN_EMAILS — pmcshane@fordham.edu). Anyone else gets
 * 401/403 and this page shows "Not authorized".
 *
 * Auto-refreshes every 60s. No charts library — CSS bars only.
 */

type Master = {
  asOf: string
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
    top_openers: Array<{ email: string; opens: number; clicks: number; replies: number; business_name: string | null; owner_first_name: string | null; city: string | null; state: string | null; trade: string | null; report_visit_at: string | null; trial_started_at: string | null; paid_at: string | null; status: string | null }>
  }
  leads: {
    inventory_total: number
    inventory_enforcement: number
    drops_last_7d: number
  }
}

const TAN = '#F2EAD9'
const BORDER = '#E3D8C2'
const ORANGE = '#E8742B'
const INK = '#1f2937'
const MUTED = '#6b7280'

export default function MasterPage() {
  const [data, setData] = useState<Master | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/master', { cache: 'no-store' })
      if (r.status === 401 || r.status === 403) { setErr('Not authorized — sign in as pmcshane@fordham.edu'); setLoading(false); return }
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

  if (loading) return <Shell><p style={{ color: MUTED, fontWeight: 600 }}>Loading…</p></Shell>
  if (err || !data) return <Shell><p style={{ color: '#b91c1c', fontWeight: 700 }}>{err || 'No data'}</p></Shell>

  const { revenue: rev, outreach: o, leads } = data
  const maxSent = Math.max(1, ...o.days.map((d) => d.sent))

  return (
    <Shell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: INK, letterSpacing: '-0.02em' }}>Master</h1>
        <span style={{ fontSize: 11.5, color: MUTED, fontWeight: 600 }}>
          as of {new Date(data.asOf).toLocaleTimeString()} · refreshes every 60s ·{' '}
          <button onClick={load} style={{ border: 'none', background: 'transparent', color: ORANGE, fontWeight: 700, cursor: 'pointer', fontSize: 11.5, padding: 0 }}>refresh now</button>
        </span>
      </div>

      {/* ── TOP STATS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 22 }}>
        <Stat label="Paying customers (real)" value={String(rev.paying_customers)} big />
        <Stat label="MRR (real, net of coupons)" value={`$${rev.mrr.toLocaleString()}`} big />
        <Stat label="ARR" value={`$${rev.arr.toLocaleString()}`} />
        <Stat label="Your test subs (burn/mo)" value={`${rev.internal_subs} ($${rev.internal_burn_monthly})`} />
        <Stat label="Emails sent" value={o.emails_sent.toLocaleString()} />
        <Stat label="Open rate" value={`${(o.open_rate * 100).toFixed(1)}%`} big />
        <Stat label="Replies" value={String(o.replies)} />
      </div>

      {/* ── MONEY ── */}
      <Section title={`Real customers${rev.stripe_error ? ' — STRIPE ERROR' : ' (live from Stripe, net of coupons)'}`}>
        {rev.stripe_error && <p style={{ color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>Stripe unreachable: {rev.stripe_error}</p>}
        {!rev.stripe_error && rev.customers.filter((c) => !c.internal).length === 0 && (
          <p style={{ color: MUTED, fontSize: 13 }}>No real customers yet — campaign is live, first one lands here.</p>
        )}
        {rev.customers.filter((c) => !c.internal).length > 0 && (
          <Table head={['Customer', 'Status', 'Bills $/mo', 'Promo used', 'Since']}>
            {rev.customers.filter((c) => !c.internal).map((c, i) => (
              <tr key={i}>
                <Td strong>{c.name || c.email || '—'}{c.name && c.email ? <span style={{ color: MUTED, fontWeight: 500 }}> · {c.email}</span> : null}</Td>
                <Td><Badge bg={c.status === 'active' ? '#f0fdf4' : c.status === 'trialing' ? '#fef3ec' : '#fef2f2'} color={c.status === 'active' ? '#15803d' : c.status === 'trialing' ? '#c2410c' : '#b91c1c'}>{c.status}</Badge></Td>
                <Td strong>${c.net_monthly}{c.net_monthly !== c.list_monthly ? <span style={{ color: MUTED, fontWeight: 500 }}> (list ${c.list_monthly})</span> : ''}{c.interval === 'year' ? ' (annual)' : ''}</Td>
                <Td>{c.promo_code ? <code style={{ background: '#F9F5EC', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{c.promo_code}</code> : '—'}</Td>
                <Td>{c.started ? new Date(c.started).toLocaleDateString() : '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {rev.customers.some((c) => c.internal) && (
        <Section title={`Your own test subs — NOT revenue (${rev.internal_subs} subs, $${rev.internal_burn_monthly}/mo actually billing your card)`}>
          <p style={{ color: MUTED, fontSize: 12, margin: '0 0 10px', fontWeight: 600 }}>
            Signup-flow test runs + your real account. Anything billing &gt;$0 here is money you pay yourself minus Stripe fees — cancel the dupes in Stripe → Subscriptions.
          </p>
          <Table head={['Account', 'Bills $/mo', 'Promo', 'Since']}>
            {rev.customers.filter((c) => c.internal).map((c, i) => (
              <tr key={i}>
                <Td strong>{c.email || c.name || '—'}</Td>
                <Td strong>{c.net_monthly > 0 ? `$${c.net_monthly}` : '$0'}<span style={{ color: MUTED, fontWeight: 500 }}> (list ${c.list_monthly})</span></Td>
                <Td>{c.promo_code ? <code style={{ background: '#F9F5EC', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{c.promo_code}</code> : '—'}</Td>
                <Td>{c.started ? new Date(c.started).toLocaleDateString() : '—'}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {/* ── CAMPAIGNS (Instantly truth) ── */}
      <Section title={`Email campaigns${o.instantly_error ? ' — INSTANTLY ERROR' : ' (live from Instantly)'}`}>
        {o.instantly_error && <p style={{ color: '#b91c1c', fontSize: 12.5, fontWeight: 600 }}>Instantly unreachable: {o.instantly_error}</p>}
        {o.campaigns.length > 0 && (
          <Table head={['Campaign', 'Sent', 'Opens', 'Open rate', 'Clicks', 'Replies', 'Bounced']}>
            {o.campaigns.map((c, i) => (
              <tr key={i}>
                <Td strong>{c.name}</Td>
                <Td>{c.sent.toLocaleString()}</Td>
                <Td strong>{c.opens.toLocaleString()}</Td>
                <Td>{c.sent > 0 ? `${((c.opens / c.sent) * 100).toFixed(1)}%` : '—'}</Td>
                <Td>{c.clicks}</Td>
                <Td strong>{c.replies}</Td>
                <Td>{c.bounced}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ── FUNNEL ── */}
      <Section title="Funnel — email to paid (all-time)">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Funnel n={o.emails_sent} label="emails sent" />
          <Funnel n={o.opened_total} label="opens" prev={o.emails_sent} />
          <Funnel n={o.clicks} label="clicks" prev={o.opened_total} />
          <Funnel n={o.replies} label="replies" prev={o.opened_total} />
          <Funnel n={o.report_visits} label="visited site" />
          <Funnel n={o.trials} label="trials" />
          <Funnel n={o.paid_conversions} label="PAID" hot />
        </div>
      </Section>

      {/* ── 14-DAY PUSHES ── */}
      <Section title="Last 14 days — new prospects pushed to Instantly">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110 }}>
          {o.days.map((d) => (
            <div key={d.date} title={`${d.date}: ${d.sent} pushed`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2, height: '100%' }}>
              <div style={{ height: `${(d.sent / maxSent) * 88}%`, minHeight: d.sent > 0 ? 3 : 0, background: ORANGE, borderRadius: '3px 3px 0 0' }} />
              <div style={{ fontSize: 8.5, color: MUTED, textAlign: 'center', fontWeight: 600 }}>{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: MUTED, fontWeight: 600, margin: '8px 0 0' }}>{o.pushed_today} pushed today · {o.pushed_total.toLocaleString()} all-time</p>
      </Section>

      {/* ── HOTTEST PROSPECTS ── */}
      <Section title="Hottest prospects — most opens (Instantly)">
        {o.top_openers.length === 0 ? <p style={{ color: MUTED, fontSize: 13 }}>No opens yet — campaigns warming.</p> : (
          <Table head={['Business', 'Email', 'Where', 'Opens', 'Clicks', 'Stage']}>
            {o.top_openers.map((t, i) => (
              <tr key={i}>
                <Td strong>{t.business_name || t.owner_first_name || '—'}</Td>
                <Td>{t.email}</Td>
                <Td>{[t.city, t.state].filter(Boolean).join(', ') || '—'}</Td>
                <Td strong>{t.opens}</Td>
                <Td>{t.clicks}</Td>
                <Td>
                  {t.paid_at ? <Badge bg="#f0fdf4" color="#15803d">PAID</Badge>
                    : t.trial_started_at ? <Badge bg="#fef3ec" color="#c2410c">TRIAL</Badge>
                    : t.replies > 0 ? <Badge bg="#eff6ff" color="#1d4ed8">REPLIED</Badge>
                    : t.report_visit_at ? <Badge bg="#eff6ff" color="#1d4ed8">VISITED</Badge>
                    : <Badge bg="#F9F5EC" color={MUTED}>{t.status || 'opened'}</Badge>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* ── LEAD SUPPLY ── */}
      <Section title="Lead supply pulse">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
          <Stat label="Inventory (real leads)" value={leads.inventory_total.toLocaleString()} />
          <Stat label="Enforcement (legal-pressure)" value={`${leads.inventory_enforcement.toLocaleString()} (${leads.inventory_total ? Math.round((leads.inventory_enforcement / leads.inventory_total) * 100) : 0}%)`} />
          <Stat label="Leads delivered last 7d" value={String(leads.drops_last_7d)} />
        </div>
      </Section>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: TAN, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: INK, padding: '24px clamp(14px, 4vw, 40px) 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h2>
      {children}
    </section>
  )
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ background: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: big ? 26 : 20, fontWeight: 800, color: big ? ORANGE : INK, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginTop: 3 }}>{label}</div>
    </div>
  )
}

function Funnel({ n, label, prev, hot }: { n: number; label: string; prev?: number; hot?: boolean }) {
  const pct = prev && prev > 0 ? ` · ${((n / prev) * 100).toFixed(1)}%` : ''
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, minWidth: 96,
      background: hot ? '#f0fdf4' : '#F9F5EC',
      border: `1px solid ${hot ? '#bbf7d0' : BORDER}`,
    }}>
      <div style={{ fontSize: 19, fontWeight: 800, color: hot ? '#15803d' : INK, fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED }}>{label}{pct}</div>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{head.map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10.5, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${BORDER}` }}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <td style={{ padding: '8px 10px', borderBottom: '1px solid #F1EBDD', fontWeight: strong ? 700 : 500, color: strong ? INK : '#374151', whiteSpace: 'nowrap' }}>{children}</td>
}

function Badge({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, background: bg, color }}>{children}</span>
}
