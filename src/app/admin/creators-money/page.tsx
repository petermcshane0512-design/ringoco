'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * /admin/creators-money
 *
 * What Peter owes each creator + lifetime they've earned. Reads directly
 * from the existing /api/admin/ig-creators endpoint which already returns
 * the payout columns (pending_payout_cents, payable_friday_cents,
 * lifetime_paid_cents, paid_referrals_count).
 *
 * Sort order:
 *   1. payable_friday_cents DESC  (highest cash owed THIS Friday at top)
 *   2. pending_payout_cents DESC  (next-up payable)
 *   3. lifetime_paid_cents DESC
 *
 * Auth: page is inside /admin so the layout's noindex + requireAdmin gate
 * on the upstream API keep it private.
 */

type Creator = {
  id: string
  handle: string
  status: string
  followers: number | null
  trade: string | null
  promo_code: string | null
  personal_promo_code: string | null
  paid_referrals_count: number | null
  pending_payout_cents: number | null
  payable_friday_cents: number | null
  lifetime_paid_cents: number | null
  last_payout_at: string | null
}

function usd(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

export default function CreatorsMoneyPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/ig-creators')
      .then((r) => r.json())
      .then((j) => {
        setCreators((j.creators ?? []) as Creator[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const sorted = [...creators].sort((a, b) => {
    const pa = (b.payable_friday_cents ?? 0) - (a.payable_friday_cents ?? 0)
    if (pa !== 0) return pa
    const pe = (b.pending_payout_cents ?? 0) - (a.pending_payout_cents ?? 0)
    if (pe !== 0) return pe
    return (b.lifetime_paid_cents ?? 0) - (a.lifetime_paid_cents ?? 0)
  })

  const totals = creators.reduce(
    (acc, c) => {
      acc.pending += c.pending_payout_cents ?? 0
      acc.payable += c.payable_friday_cents ?? 0
      acc.lifetime += c.lifetime_paid_cents ?? 0
      acc.refs += c.paid_referrals_count ?? 0
      return acc
    },
    { pending: 0, payable: 0, lifetime: 0, refs: 0 },
  )

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", padding: '24px 28px', maxWidth: 1280, margin: '0 auto', color: '#0B1F3A' }}>
      <Link href="/admin" style={{ fontSize: 12, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>← Admin</Link>
      <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', margin: '8px 0 24px' }}>
        Creators · Money owed
      </h1>

      {/* Totals strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Total paid refs" value={String(totals.refs)} tone="teal" />
        <StatCard label="Pending (in MBG)" value={usd(totals.pending)} tone="amber" />
        <StatCard label="Payable this Friday" value={usd(totals.payable)} tone="orange" hot />
        <StatCard label="Lifetime paid out" value={usd(totals.lifetime)} tone="green" />
      </div>

      <div style={{ marginBottom: 12, padding: '14px 18px', background: '#FFF7EE', border: '1px solid #FED7AA', borderRadius: 10, fontSize: 13, color: '#7C2D12' }}>
        🚨 Pay creators every Friday 10am UTC. The Friday cron drains <code>payable_friday_cents</code> and exports
        a CSV at <Link href="/api/admin/creator-payouts/export" style={{ color: '#C2410C', fontWeight: 700 }}>
          /api/admin/creator-payouts/export
        </Link> — import that into Mercury bulk ACH.
      </div>

      {/* Creator table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7AAAB2' }}>Loading…</div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7AAAB2' }}>No creators yet. Add via /admin/ig-creators or bulk endpoint.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(10,168,159,0.16)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr style={{ background: '#0B1F3A', color: '#fff' }}>
                <th style={th}>Status</th>
                <th style={th}>@handle</th>
                <th style={th}>Trade</th>
                <th style={th}>Followers</th>
                <th style={th}>Paid refs</th>
                <th style={{ ...th, textAlign: 'right' }}>Pending</th>
                <th style={{ ...th, textAlign: 'right', background: '#7C2D12' }}>Payable Fri</th>
                <th style={{ ...th, textAlign: 'right' }}>Lifetime paid</th>
                <th style={th}>Codes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => {
                const bg = c.status === 'active_creator' ? '#F0FDF4'
                  : c.status === 'paid_bonus_hit' ? '#FFFBEB'
                  : i % 2 === 0 ? '#fff' : '#F9FAFB'
                return (
                  <tr key={c.id} style={{ background: bg }}>
                    <td style={td}>
                      <span style={statusPill(c.status)}>{c.status}</span>
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>@{c.handle}</td>
                    <td style={td}>{c.trade ?? '—'}</td>
                    <td style={td}>{c.followers ? c.followers.toLocaleString() : '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{c.paid_referrals_count ?? 0}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#92400E' }}>{usd(c.pending_payout_cents)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: (c.payable_friday_cents ?? 0) > 0 ? '#C2410C' : '#9CA3AF' }}>
                      {usd(c.payable_friday_cents)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#15803D' }}>{usd(c.lifetime_paid_cents)}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>
                      <div>{c.promo_code ?? '—'}</div>
                      <div style={{ color: '#7AAAB2' }}>{c.personal_promo_code ?? '—'}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function StatCard({ label, value, tone, hot }: { label: string; value: string; tone: 'teal' | 'amber' | 'orange' | 'green'; hot?: boolean }) {
  const bg = tone === 'teal' ? '#F0FDFA' : tone === 'amber' ? '#FFFBEB' : tone === 'orange' ? '#FFF7ED' : '#F0FDF4'
  const border = tone === 'teal' ? '#5EEAD4' : tone === 'amber' ? '#FBBF24' : tone === 'orange' ? '#F97316' : '#22C55E'
  const color = tone === 'teal' ? '#0F766E' : tone === 'amber' ? '#92400E' : tone === 'orange' ? '#9A3412' : '#15803D'
  return (
    <div style={{
      padding: '16px 18px',
      background: bg,
      border: `1.5px solid ${border}`,
      borderRadius: 12,
      boxShadow: hot ? `0 6px 18px ${border}33` : 'none',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  )
}

function statusPill(status: string): React.CSSProperties {
  const colors: Record<string, [string, string]> = {
    active_creator: ['#15803D', '#D1FAE5'],
    paid_bonus_hit: ['#92400E', '#FFE4B5'],
    replied_yes:    ['#15803D', '#DDF7C2'],
    dmed:           ['#3730A3', '#E0E7FF'],
    saved:          ['#374151', '#F3F4F6'],
    replied_no:     ['#991B1B', '#FEE2E2'],
    dropped:        ['#6B7280', '#E5E7EB'],
  }
  const [color, bg] = colors[status] ?? ['#374151', '#F3F4F6']
  return {
    display: 'inline-block',
    padding: '3px 9px',
    borderRadius: 99,
    fontSize: 10,
    fontWeight: 800,
    color, background: bg,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  }
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 12px 10px',
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.10em',
  textTransform: 'uppercase' as const,
}

const td: React.CSSProperties = {
  padding: '12px 12px',
  fontSize: 13,
  borderBottom: '1px solid rgba(10,168,159,0.08)',
}
