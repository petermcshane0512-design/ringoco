'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Customer = {
  user_id: string
  email: string
  business_name: string
  plan_tier: string
  is_active: boolean
  setup_complete: boolean
  twilio_number: string
  owner_phone: string
  created_at: string
  welcomed_at: string
  forwarding_confirmed_at: string
  mrr: number
  calls_mtd: number
  bookings_mtd: number
  last_call_at?: string
}

type Totals = { count: number; active: number; mrr: number; calls_mtd: number }

const TIER_LABEL: Record<string, string> = {
  receptionist: 'Receptionist',
  officemgr: 'Office Mgr',
  concierge: 'Concierge',
  cancelled: 'Cancelled',
  starter: 'Starter (legacy)',
  growth: 'Growth (legacy)',
  scale: 'Scale (legacy)',
  foundation: 'Foundation (legacy)',
  premium: 'Premium (legacy)',
}

const TIER_COLOR: Record<string, { bg: string; fg: string; bd: string }> = {
  receptionist: { bg: '#EFF6FF', fg: '#1E40AF', bd: '#BFDBFE' },
  officemgr:    { bg: 'rgba(10,168,159,0.08)', fg: '#0AA89F', bd: 'rgba(10,168,159,0.25)' },
  concierge:    { bg: '#FDF4FF', fg: '#A21CAF', bd: '#F5D0FE' },
  cancelled:    { bg: '#FEF2F2', fg: '#DC2626', bd: '#FECACA' },
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'stalled'>('all')
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function viewAs(userId: string) {
    if (impersonatingId) return
    setImpersonatingId(userId)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Could not impersonate: ${j.error ?? 'unknown'}`)
        setImpersonatingId(null)
        return
      }
      window.location.assign('/dashboard')
    } catch (e) {
      alert(`Impersonate request failed: ${e instanceof Error ? e.message : String(e)}`)
      setImpersonatingId(null)
    }
  }

  async function load() {
    setLoading(true)
    const res = await fetch('/api/admin/customers')
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || `HTTP ${res.status}`)
      setLoading(false)
      return
    }
    const j = await res.json()
    setCustomers(j.customers ?? [])
    setTotals(j.totals ?? null)
    setLoading(false)
  }

  const filtered = customers.filter(c => {
    if (filter === 'active') return c.is_active
    if (filter === 'inactive') return !c.is_active
    if (filter === 'stalled') return c.is_active && !c.setup_complete
    return true
  })

  function daysAgo(iso?: string) {
    if (!iso) return '—'
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (d === 0) return 'today'
    if (d === 1) return '1d'
    return `${d}d`
  }

  if (loading) return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Loading customers…</div>
  if (error) return (
    <div style={{ padding: 40, fontFamily: 'system-ui', color: '#DC2626' }}>
      <h2>Error</h2>
      <p>{error}</p>
      <Link href="/dashboard">← Back to dashboard</Link>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px 60px', fontFamily: "'Inter', system-ui, sans-serif", color: '#0B1F3A' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Admin · Customer Health
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em' }}>All customers</div>
        </div>
        <Link href="/dashboard" style={{ fontSize: 13, color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>
          ← Dashboard
        </Link>
      </div>

      {/* Stat cards */}
      {totals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
          {[
            { label: 'Total signups', value: totals.count.toLocaleString() },
            { label: 'Active subscribers', value: totals.active.toLocaleString() },
            { label: 'MRR', value: `$${totals.mrr.toLocaleString()}` },
            { label: 'Calls this month', value: totals.calls_mtd.toLocaleString() },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 14px rgba(7,27,58,0.06)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {([
          { k: 'all', label: 'All' },
          { k: 'active', label: 'Active' },
          { k: 'inactive', label: 'Inactive' },
          { k: 'stalled', label: 'Stalled (paid, no setup)' },
        ] as const).map(p => (
          <button
            key={p.k}
            onClick={() => setFilter(p.k)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: filter === p.k ? '1px solid #0AA89F' : '1px solid rgba(10,168,159,0.2)',
              background: filter === p.k ? 'rgba(10,168,159,0.08)' : '#fff',
              color: filter === p.k ? '#0AA89F' : '#4A7A80',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 16px rgba(7,27,58,0.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(10,168,159,0.04)' }}>
                {['Business', 'Email', 'Tier', 'Status', 'BellAveGo #', 'MRR', 'Calls MTD', 'Bookings', 'Last call', 'Signed up'].map(h => (
                  <th key={h} style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '12px 14px', textAlign: 'left', borderBottom: '1px solid rgba(10,168,159,0.1)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#7AAAB2' }}>No customers match this filter.</td></tr>
              ) : filtered.map(c => {
                const color = TIER_COLOR[c.plan_tier] || { bg: 'rgba(10,168,159,0.06)', fg: '#4A7A80', bd: 'rgba(10,168,159,0.2)' }
                const stalled = c.is_active && !c.setup_complete
                const loadingThisRow = impersonatingId === c.user_id
                return (
                  <tr
                    key={c.user_id}
                    onClick={() => viewAs(c.user_id)}
                    title="Click to view as this customer (read-only)"
                    style={{
                      borderBottom: '1px solid rgba(10,168,159,0.07)',
                      cursor: impersonatingId ? 'wait' : 'pointer',
                      transition: 'background 0.12s ease',
                      opacity: impersonatingId && !loadingThisRow ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!impersonatingId) (e.currentTarget as HTMLElement).style.background = 'rgba(10,168,159,0.04)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0B1F3A' }}>
                      {c.business_name || '—'}
                      {loadingThisRow && <span style={{ marginLeft: 8, fontSize: 10, color: '#0AA89F' }}>opening…</span>}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#4A7A80', fontSize: 11 }}>{c.email}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: color.bg, color: color.fg, border: `1px solid ${color.bd}` }}>
                        {TIER_LABEL[c.plan_tier] || c.plan_tier}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {c.is_active ? (
                        stalled ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>Stalled</span>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>Active</span>
                        )
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>Inactive</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 11, color: '#0AA89F' }}>{c.twilio_number || '—'}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0B1F3A', fontVariantNumeric: 'tabular-nums' }}>${c.mrr}</td>
                    <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>{c.calls_mtd}</td>
                    <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>{c.bookings_mtd}</td>
                    <td style={{ padding: '12px 14px', color: '#7AAAB2' }}>{daysAgo(c.last_call_at)}</td>
                    <td style={{ padding: '12px 14px', color: '#7AAAB2' }}>{daysAgo(c.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
