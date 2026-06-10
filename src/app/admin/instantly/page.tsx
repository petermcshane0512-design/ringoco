import { requireAdmin } from '@/lib/auth/requireAdmin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * /admin/instantly — 2026-06-10 mailbox throughput audit.
 *
 * Single-screen answer to "why am I capped at 450/day when I have 30
 * mailboxes across 6 domains?" Hits Instantly v2 /accounts directly,
 * shows per-mailbox state + per-domain aggregate + total capacity
 * math.
 *
 * No third-party UI — just a table. Peter scans, sees which mailboxes
 * are stalled/yellow/disconnected, fixes them in Instantly's own UI.
 *
 * Hormozi 100M Leads — volume negates luck. This page is here so the
 * volume bottleneck is visible in one place, not buried 4 clicks deep
 * in Instantly's settings.
 */

type InstantlyAccount = {
  email?: string
  status?: number               // 1 = active, 0 = paused (per Instantly v2 conventions)
  warmup_status?: number        // 1 = warming, 0 = off
  warmup_score?: number         // 0-100, deliverability health
  daily_limit?: number
  daily_sent?: number           // sometimes returned
  provider?: string             // 'google' | 'microsoft' | 'smtp' etc.
  created_at?: string
  last_warmup_at?: string
  setup_pending?: boolean
}

type AccountsResp = {
  items?: InstantlyAccount[]
  pagination_token?: string
}

async function fetchAllAccounts(apiKey: string): Promise<InstantlyAccount[]> {
  const accounts: InstantlyAccount[] = []
  let cursor: string | undefined
  let safety = 0
  do {
    const url = new URL('https://api.instantly.ai/api/v2/accounts')
    url.searchParams.set('limit', '100')
    if (cursor) url.searchParams.set('starting_after', cursor)
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    if (!r.ok) {
      throw new Error(`Instantly /accounts HTTP ${r.status}`)
    }
    const j = (await r.json()) as AccountsResp
    accounts.push(...(j.items || []))
    cursor = j.pagination_token
    safety++
  } while (cursor && safety < 10)
  return accounts
}

function extractDomain(email: string | undefined): string {
  if (!email) return 'unknown'
  const at = email.indexOf('@')
  return at >= 0 ? email.slice(at + 1).toLowerCase() : 'unknown'
}

function statusLabel(a: InstantlyAccount): { label: string; color: string } {
  if (a.setup_pending) return { label: 'pending setup', color: '#C84B26' }
  if (a.status === 0) return { label: 'paused', color: '#C84B26' }
  if (a.warmup_status === 0) return { label: 'warmup off', color: '#C84B26' }
  if (typeof a.warmup_score === 'number') {
    if (a.warmup_score >= 90) return { label: `warming (${a.warmup_score})`, color: '#16803F' }
    if (a.warmup_score >= 50) return { label: `warming (${a.warmup_score})`, color: '#E8742B' }
    return { label: `warming (${a.warmup_score})`, color: '#C84B26' }
  }
  return { label: 'active', color: '#16803F' }
}

export default async function AdminInstantlyPage() {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/')

  const apiKey = process.env.INSTANTLY_API_KEY
  if (!apiKey) {
    return (
      <main style={pageStyle}>
        <Link href="/admin" style={backLink}>← admin</Link>
        <h1 style={h1Style}>Instantly audit</h1>
        <p style={{ color: '#C84B26', fontSize: 14 }}>INSTANTLY_API_KEY env var unset on Vercel. Add it under Vercel → Settings → Environment Variables → Production+Preview+Development, then redeploy.</p>
      </main>
    )
  }

  let accounts: InstantlyAccount[] = []
  let err: string | null = null
  try {
    accounts = await fetchAllAccounts(apiKey)
  } catch (e) {
    err = (e as Error).message
  }

  if (err) {
    return (
      <main style={pageStyle}>
        <Link href="/admin" style={backLink}>← admin</Link>
        <h1 style={h1Style}>Instantly audit</h1>
        <p style={{ color: '#C84B26', fontSize: 14 }}>Could not reach Instantly: {err}</p>
      </main>
    )
  }

  // Per-domain aggregation.
  const byDomain: Record<string, { count: number; active: number; warmingHealthy: number; dailyLimitSum: number; dailySentSum: number }> = {}
  for (const a of accounts) {
    const d = extractDomain(a.email)
    if (!byDomain[d]) byDomain[d] = { count: 0, active: 0, warmingHealthy: 0, dailyLimitSum: 0, dailySentSum: 0 }
    byDomain[d].count++
    if (a.status === 1 && !a.setup_pending) byDomain[d].active++
    if ((a.warmup_score ?? 0) >= 90) byDomain[d].warmingHealthy++
    byDomain[d].dailyLimitSum += a.daily_limit ?? 0
    byDomain[d].dailySentSum += a.daily_sent ?? 0
  }
  const domainRows = Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b))

  // Headline math.
  const total = accounts.length
  const active = accounts.filter((a) => a.status === 1 && !a.setup_pending).length
  const healthy = accounts.filter((a) => (a.warmup_score ?? 0) >= 90 && a.status === 1).length
  const dailyLimitTotal = accounts.reduce((acc, a) => acc + (a.daily_limit ?? 0), 0)
  const dailySentTotal = accounts.reduce((acc, a) => acc + (a.daily_sent ?? 0), 0)
  const theoreticalAt30 = active * 30
  const theoreticalAt50 = active * 50

  return (
    <main style={pageStyle}>
      <Link href="/admin" style={backLink}>← admin</Link>
      <h1 style={h1Style}>Instantly audit</h1>

      {/* HEADLINE TILE */}
      <div style={{
        padding: '20px 24px', borderRadius: 14,
        background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
        color: '#fff', marginBottom: 22,
        display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      }}>
        <Tile label="Mailboxes" value={total.toString()} />
        <Tile label="Active" value={active.toString()} accent="#5EEAD4" />
        <Tile label="Healthy (≥90)" value={healthy.toString()} accent="#5EEAD4" />
        <Tile label="Daily cap (sum)" value={dailyLimitTotal.toString()} accent="#FFD9A8" />
        <Tile label="Sent today" value={dailySentTotal.toString()} />
        <Tile label="If all @30/d" value={theoreticalAt30.toString()} />
        <Tile label="If all @50/d" value={theoreticalAt50.toString()} />
      </div>
      <p style={{ fontSize: 12, color: '#4A6670', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.55 }}>
        <strong>Diagnosis:</strong> {active === total ? `all ${total} mailboxes active. ` : `${total - active} mailbox(es) NOT active — those are eating your cap. `}
        {healthy === active && active > 0 && total > 0 ? 'All active mailboxes are fully warmed (≥90). ' : `${active - healthy} active mailbox(es) under warmup-90 — Instantly throttles them below their daily_limit. `}
        Current sum-of-daily-limits is {dailyLimitTotal}, but you actually shipped {dailySentTotal} today. If those numbers diverge by &gt;20%, some mailboxes are stalled.
      </p>

      {/* PER-DOMAIN */}
      <h2 style={h2Style}>Per burner domain</h2>
      <table style={tableStyle}>
        <thead><tr style={trHead}>
          <th style={th}>Domain</th>
          <th style={th}>Mailboxes</th>
          <th style={th}>Active</th>
          <th style={th}>Healthy</th>
          <th style={th}>Daily cap</th>
          <th style={th}>Sent today</th>
        </tr></thead>
        <tbody>
          {domainRows.map(([d, b]) => (
            <tr key={d} style={tr}>
              <td style={td}>{d}</td>
              <td style={td}>{b.count}</td>
              <td style={{ ...td, color: b.active < b.count ? '#C84B26' : '#16803F', fontWeight: 800 }}>{b.active}/{b.count}</td>
              <td style={{ ...td, color: b.warmingHealthy < b.active ? '#E8742B' : '#16803F', fontWeight: 800 }}>{b.warmingHealthy}/{b.active}</td>
              <td style={td}>{b.dailyLimitSum}</td>
              <td style={td}>{b.dailySentSum}</td>
            </tr>
          ))}
          {domainRows.length === 0 && <tr><td colSpan={6} style={tdEmpty}>No accounts found.</td></tr>}
        </tbody>
      </table>

      {/* PER-MAILBOX */}
      <h2 style={h2Style}>Every mailbox</h2>
      <table style={tableStyle}>
        <thead><tr style={trHead}>
          <th style={th}>Email</th>
          <th style={th}>Provider</th>
          <th style={th}>Status</th>
          <th style={th}>Daily cap</th>
          <th style={th}>Sent today</th>
        </tr></thead>
        <tbody>
          {accounts.map((a) => {
            const s = statusLabel(a)
            return (
              <tr key={a.email || Math.random()} style={tr}>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{a.email}</td>
                <td style={td}>{a.provider || '—'}</td>
                <td style={{ ...td, color: s.color, fontWeight: 800 }}>{s.label}</td>
                <td style={td}>{a.daily_limit ?? '—'}</td>
                <td style={td}>{a.daily_sent ?? '—'}</td>
              </tr>
            )
          })}
          {accounts.length === 0 && <tr><td colSpan={5} style={tdEmpty}>No mailboxes returned. Either the API key is wrong or no accounts connected.</td></tr>}
        </tbody>
      </table>

      <p style={{ fontSize: 12, color: '#7AAAB2', margin: '24px 0 0', lineHeight: 1.55 }}>
        Next action: any mailbox showing red {`(paused / warmup off / pending)`} = reconnect it in <a href="https://app.instantly.ai/app/accounts" target="_blank" rel="noreferrer" style={{ color: '#C84B26' }}>Instantly → Accounts</a>. Any mailbox in yellow warmup &lt;90 = wait 1-2 more weeks before bumping its daily_limit above 30.
      </p>
    </main>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: accent || 'rgba(255,255,255,0.55)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color: accent || '#fff', marginTop: 2, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { fontFamily: 'system-ui, sans-serif', padding: '24px 32px', maxWidth: 1240, margin: '0 auto', color: '#0B1F3A' }
const backLink: React.CSSProperties = { fontSize: 12, color: '#7AAAB2', textDecoration: 'none' }
const h1Style: React.CSSProperties = { fontSize: 22, fontWeight: 900, margin: '8px 0 16px' }
const h2Style: React.CSSProperties = { fontSize: 14, fontWeight: 900, color: '#C84B26', letterSpacing: '0.10em', textTransform: 'uppercase', margin: '24px 0 10px' }
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, border: '1px solid rgba(11,31,58,0.12)' }
const trHead: React.CSSProperties = { background: 'rgba(232,116,43,0.06)' }
const tr: React.CSSProperties = { borderTop: '1px solid rgba(11,31,58,0.08)' }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C84B26' }
const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' as const }
const tdEmpty: React.CSSProperties = { ...td, color: '#7AAAB2', textAlign: 'center' as const }
