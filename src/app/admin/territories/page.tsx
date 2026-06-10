import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * /admin/territories — T3 of offer-rebuild plan (2026-06-10).
 *
 * Read-only table view of every (zip, trade) territory and its current
 * status. No styling beyond table-strapping — Peter just needs to see
 * what's claimed, by whom, and what's in grace.
 *
 * Auth: requireAdmin (Clerk session OR x-admin-secret header).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type TerritoryRow = {
  id: string
  zip: string
  trade: string
  metro: string | null
  status: 'open' | 'claimed' | 'grace'
  customer_id: string | null
  stripe_customer_id: string | null
  business_name: string | null
  claimed_at: string | null
  released_at: string | null
}

type WaitlistRow = {
  id: string
  zip: string
  trade: string
  email: string
  business_name: string | null
  created_at: string
}

async function loadData(): Promise<{ territories: TerritoryRow[]; waitlist: WaitlistRow[] }> {
  const [terrRes, waitRes] = await Promise.all([
    supabase
      .from('territories')
      .select('id, zip, trade, metro, status, customer_id, stripe_customer_id, business_name, claimed_at, released_at')
      .order('claimed_at', { ascending: false, nullsFirst: false })
      .limit(500),
    supabase
      .from('territory_waitlist')
      .select('id, zip, trade, email, business_name, created_at')
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  return {
    territories: (terrRes.data as TerritoryRow[]) || [],
    waitlist: (waitRes.data as WaitlistRow[]) || [],
  }
}

export default async function AdminTerritoriesPage() {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/')

  const { territories, waitlist } = await loadData()
  const counts = {
    total: territories.length,
    claimed: territories.filter((t) => t.status === 'claimed').length,
    grace: territories.filter((t) => t.status === 'grace').length,
    open: territories.filter((t) => t.status === 'open').length,
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '24px 32px', maxWidth: 1240, margin: '0 auto', color: '#0B1F3A' }}>
      <Link href="/admin" style={{ fontSize: 12, color: '#7AAAB2', textDecoration: 'none' }}>← admin</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: '8px 0 6px' }}>Territories</h1>
      <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 18px' }}>
        Total: <strong>{counts.total}</strong> · Claimed: <strong>{counts.claimed}</strong> · In grace: <strong>{counts.grace}</strong> · Open: <strong>{counts.open}</strong>
      </p>

      <table style={tableStyle}>
        <thead>
          <tr style={trHead}>
            <th style={th}>Zip</th>
            <th style={th}>Trade</th>
            <th style={th}>Status</th>
            <th style={th}>Business</th>
            <th style={th}>Customer ID</th>
            <th style={th}>Claimed</th>
            <th style={th}>Grace expires</th>
          </tr>
        </thead>
        <tbody>
          {territories.map((t) => (
            <tr key={t.id} style={tr}>
              <td style={td}>{t.zip}</td>
              <td style={td}>{t.trade}</td>
              <td style={{ ...td, color: t.status === 'claimed' ? '#16803F' : t.status === 'grace' ? '#C84B26' : '#7AAAB2', fontWeight: 800 }}>
                {t.status}
              </td>
              <td style={td}>{t.business_name || '—'}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{t.customer_id ?? '—'}</td>
              <td style={td}>{t.claimed_at ? new Date(t.claimed_at).toLocaleString() : '—'}</td>
              <td style={td}>{t.released_at ? new Date(t.released_at).toLocaleString() : '—'}</td>
            </tr>
          ))}
          {territories.length === 0 && (
            <tr><td colSpan={7} style={{ ...td, color: '#7AAAB2', textAlign: 'center' }}>No territories yet.</td></tr>
          )}
        </tbody>
      </table>

      <h2 style={{ fontSize: 18, fontWeight: 900, margin: '32px 0 6px' }}>Waitlist</h2>
      <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 12px' }}>
        Contractors who tried to claim a taken zip+trade. Notify them when territory opens.
      </p>
      <table style={tableStyle}>
        <thead>
          <tr style={trHead}>
            <th style={th}>Zip</th>
            <th style={th}>Trade</th>
            <th style={th}>Email</th>
            <th style={th}>Business</th>
            <th style={th}>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {waitlist.map((w) => (
            <tr key={w.id} style={tr}>
              <td style={td}>{w.zip}</td>
              <td style={td}>{w.trade}</td>
              <td style={td}>{w.email}</td>
              <td style={td}>{w.business_name || '—'}</td>
              <td style={td}>{new Date(w.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {waitlist.length === 0 && (
            <tr><td colSpan={5} style={{ ...td, color: '#7AAAB2', textAlign: 'center' }}>No waitlist entries yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  )
}

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
  border: '1px solid rgba(11,31,58,0.12)',
}
const trHead: React.CSSProperties = { background: 'rgba(232,116,43,0.06)' }
const tr: React.CSSProperties = { borderTop: '1px solid rgba(11,31,58,0.08)' }
const th: React.CSSProperties = {
  textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 800,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C84B26',
}
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' as const }
