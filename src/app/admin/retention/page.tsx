import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * /admin/retention — T5 of offer-rebuild plan (2026-06-10).
 *
 * The only number that matters: $97 first-month → $497 month-2
 * conversion. Drives every scaling decision.
 *
 * Three sections:
 *   1. Headline tile — single number, this is what we live or die by
 *   2. Cohort table — month-of-signup → starts / month-2-paid / churn
 *   3. UTM breakdown — which channel actually retains
 *
 * No charts, no dependencies. Just numbers and a table.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ProfileRow = {
  user_id: string
  paid_at: string | null
  first_paid_charge_at: string | null
  second_paid_charge_at: string | null
  plan_tier: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

const THIRTY_FIVE_DAYS_MS = 35 * 24 * 3600 * 1000

async function loadProfiles(): Promise<ProfileRow[]> {
  const { data } = await supabase
    .from('profiles')
    .select('user_id, paid_at, first_paid_charge_at, second_paid_charge_at, plan_tier, utm_source, utm_medium, utm_campaign')
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: false })
    .limit(5000)
  return (data as ProfileRow[]) || []
}

function cohortKey(iso: string | null): string {
  if (!iso) return 'unknown'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function bucketCounts(rows: ProfileRow[], keyOf: (r: ProfileRow) => string) {
  const buckets: Record<string, { starts: number; month2: number; churned: number; eligible: number }> = {}
  const now = Date.now()
  for (const r of rows) {
    const k = keyOf(r) || 'unknown'
    if (!buckets[k]) buckets[k] = { starts: 0, month2: 0, churned: 0, eligible: 0 }
    buckets[k].starts++
    if (r.second_paid_charge_at) buckets[k].month2++
    if (r.plan_tier === 'cancelled') buckets[k].churned++
    // "eligible" = old enough that month-2 conversion COULD have fired
    const paidMs = r.paid_at ? new Date(r.paid_at).getTime() : null
    if (paidMs && now - paidMs >= THIRTY_FIVE_DAYS_MS) buckets[k].eligible++
  }
  return buckets
}

export default async function AdminRetentionPage() {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/')

  const profiles = await loadProfiles()
  const cohorts = bucketCounts(profiles, (r) => cohortKey(r.paid_at))
  const sources = bucketCounts(profiles, (r) => r.utm_source || 'direct')

  // Overall month-2 rate (eligible cohort only — fair comparison).
  const eligibleTotal = profiles.reduce((acc, r) => {
    const paidMs = r.paid_at ? new Date(r.paid_at).getTime() : null
    return acc + (paidMs && Date.now() - paidMs >= THIRTY_FIVE_DAYS_MS ? 1 : 0)
  }, 0)
  const month2Total = profiles.reduce((acc, r) => acc + (r.second_paid_charge_at ? 1 : 0), 0)
  const month2Pct = eligibleTotal === 0 ? 0 : Math.round((month2Total / eligibleTotal) * 100)
  const churnedTotal = profiles.reduce((acc, r) => acc + (r.plan_tier === 'cancelled' ? 1 : 0), 0)

  const cohortRows = Object.entries(cohorts).sort(([a], [b]) => b.localeCompare(a))
  const sourceRows = Object.entries(sources).sort(([, a], [, b]) => b.starts - a.starts)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '24px 32px', maxWidth: 1240, margin: '0 auto', color: '#0B1F3A' }}>
      <Link href="/admin" style={{ fontSize: 12, color: '#7AAAB2', textDecoration: 'none' }}>← admin</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: '8px 0 6px' }}>Retention</h1>
      <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 }}>
        The only number that decides whether this scales: $97 first-month → $497 month-2 conversion.
        Below: <strong>eligible</strong> means a customer signed up at least 35 days ago (so month 2 could
        have fired). Pre-eligible rows excluded from the % math.
      </p>

      {/* HEADLINE TILE */}
      <div style={{
        padding: '24px 28px', borderRadius: 16,
        background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
        color: '#fff', boxShadow: '0 14px 40px rgba(7,27,58,0.22)',
        marginBottom: 28,
        display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <Tile label="Month-2 conversion" value={`${month2Pct}%`} accent="#5EEAD4" />
        <Tile label="Customers paid month 2" value={month2Total.toString()} />
        <Tile label="Eligible (≥35 days old)" value={eligibleTotal.toString()} />
        <Tile label="Total paid signups" value={profiles.length.toString()} />
        <Tile label="Cancelled" value={churnedTotal.toString()} accent="#FF9D5A" />
      </div>

      {/* COHORT TABLE */}
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: '0 0 10px' }}>By signup month</h2>
      <table style={tableStyle}>
        <thead>
          <tr style={trHead}>
            <th style={th}>Cohort</th>
            <th style={th}>Starts</th>
            <th style={th}>Eligible (35d+)</th>
            <th style={th}>Month-2 paid</th>
            <th style={th}>Month-2 rate</th>
            <th style={th}>Churned</th>
          </tr>
        </thead>
        <tbody>
          {cohortRows.map(([k, b]) => (
            <tr key={k} style={tr}>
              <td style={td}>{k}</td>
              <td style={td}>{b.starts}</td>
              <td style={td}>{b.eligible}</td>
              <td style={td}>{b.month2}</td>
              <td style={td}>{b.eligible === 0 ? '—' : `${Math.round((b.month2 / b.eligible) * 100)}%`}</td>
              <td style={td}>{b.churned}</td>
            </tr>
          ))}
          {cohortRows.length === 0 && <tr><td colSpan={6} style={tdEmpty}>No paid signups yet.</td></tr>}
        </tbody>
      </table>

      {/* UTM TABLE */}
      <h2 style={{ fontSize: 16, fontWeight: 900, margin: '28px 0 10px' }}>By traffic source</h2>
      <table style={tableStyle}>
        <thead>
          <tr style={trHead}>
            <th style={th}>UTM source</th>
            <th style={th}>Starts</th>
            <th style={th}>Eligible</th>
            <th style={th}>Month-2 paid</th>
            <th style={th}>Month-2 rate</th>
            <th style={th}>Churned</th>
          </tr>
        </thead>
        <tbody>
          {sourceRows.map(([k, b]) => (
            <tr key={k} style={tr}>
              <td style={td}>{k}</td>
              <td style={td}>{b.starts}</td>
              <td style={td}>{b.eligible}</td>
              <td style={td}>{b.month2}</td>
              <td style={td}>{b.eligible === 0 ? '—' : `${Math.round((b.month2 / b.eligible) * 100)}%`}</td>
              <td style={td}>{b.churned}</td>
            </tr>
          ))}
          {sourceRows.length === 0 && <tr><td colSpan={6} style={tdEmpty}>No source data yet.</td></tr>}
        </tbody>
      </table>
    </main>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: accent || 'rgba(255,255,255,0.55)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent || '#fff', marginTop: 2, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
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
const tdEmpty: React.CSSProperties = { ...td, color: '#7AAAB2', textAlign: 'center' as const }
