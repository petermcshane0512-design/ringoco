import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

export const metadata: Metadata = {
  title: 'Top BellAveGo Creators — Live Leaderboard',
  description: 'See who\'s earning the most from the BellAveGo creator program. Live rankings. Real cash. Updated daily.',
}

export const revalidate = 3600  // refresh hourly

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Creator = {
  id: string
  handle: string
  paid_referrals_count: number | null
  lifetime_paid_cents: number | null
  payable_friday_cents: number | null
  followers: number | null
}

function usd(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function mask(handle: string): string {
  // privacy: show first 2 chars + last char only on public leaderboard.
  if (handle.length <= 4) return handle
  return `@${handle.slice(0, 2)}${'•'.repeat(Math.max(2, handle.length - 3))}${handle.slice(-1)}`
}

export default async function CreatorLeaderboardPage() {
  const { data: rows } = await supabase
    .from('ig_creator_outreach')
    .select('id, handle, paid_referrals_count, lifetime_paid_cents, payable_friday_cents, followers')
    .or('paid_referrals_count.gt.0,lifetime_paid_cents.gt.0,payable_friday_cents.gt.0')
    .order('lifetime_paid_cents', { ascending: false, nullsFirst: false })
    .limit(50)

  const creators = (rows ?? []) as Creator[]

  const totals = creators.reduce(
    (acc, c) => {
      acc.refs += c.paid_referrals_count ?? 0
      acc.paid += c.lifetime_paid_cents ?? 0
      acc.payable += c.payable_friday_cents ?? 0
      return acc
    },
    { refs: 0, paid: 0, payable: 0 },
  )

  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 55%, #112C4A 100%)',
      color: '#fff',
      minHeight: '100vh',
    }}>
      <section style={{ padding: '64px 24px 36px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 14px', borderRadius: 99,
            background: 'rgba(94,234,212,0.10)',
            border: '1px solid rgba(94,234,212,0.30)',
            fontSize: 10.5, fontWeight: 800, color: '#5EEAD4',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            marginBottom: 16,
          }}>🔥 Live · Creator Leaderboard</span>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 46px)',
            fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05,
            margin: '0 0 14px',
          }}>
            Top BellAveGo creators.{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>Real cash. Updated hourly.</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55, maxWidth: 580, margin: '0 auto 26px' }}>
            Every creator below is earning $200 per home-service contractor they refer, paid every Friday via ACH. Plus $1K @ 5 refs and $3K @ 15 refs as cash bonuses on top.
          </p>
          <Link href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '13px 22px', borderRadius: 11,
            background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
            color: '#0B1F3A', textDecoration: 'none',
            fontWeight: 900, fontSize: 14,
            boxShadow: '0 10px 28px rgba(232,116,43,0.42)',
          }}>
            Want a code? Sign up to join →
          </Link>
        </div>
      </section>

      {/* Totals strip */}
      <section style={{ padding: '0 24px 30px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14,
            padding: '20px 24px',
            background: 'linear-gradient(165deg, rgba(15,37,66,0.6) 0%, rgba(10,27,51,0.7) 100%)',
            border: '1px solid rgba(94,234,212,0.22)',
            borderRadius: 16,
          }}>
            <Stat label="Total paid refs" value={String(totals.refs)} tone="teal" />
            <Stat label="Lifetime payouts" value={usd(totals.paid)} tone="money" />
            <Stat label="Payable this Friday" value={usd(totals.payable)} tone="money" hot />
            <Stat label="Active creators" value={String(creators.length)} tone="teal" />
          </div>
        </div>
      </section>

      {/* Leaderboard table */}
      <section style={{ padding: '0 24px 64px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {creators.length === 0 ? (
            <div style={{
              padding: 60, textAlign: 'center',
              background: 'rgba(15,37,66,0.5)',
              border: '1px solid rgba(94,234,212,0.18)',
              borderRadius: 14,
              color: 'rgba(255,255,255,0.55)',
            }}>
              First cohort is still ramping. Check back this week.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid rgba(94,234,212,0.22)', borderRadius: 14, background: 'rgba(15,37,66,0.5)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead>
                  <tr style={{ background: 'rgba(11,31,58,0.7)' }}>
                    <th style={th}>#</th>
                    <th style={th}>Creator</th>
                    <th style={th}>Followers</th>
                    <th style={th}>Paid refs</th>
                    <th style={{ ...th, textAlign: 'right' }}>Payable Fri</th>
                    <th style={{ ...th, textAlign: 'right' }}>Lifetime paid</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((c, i) => {
                    const isPodium = i < 3
                    const trophy = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                    return (
                      <tr key={c.id} style={{
                        background: isPodium ? 'rgba(232,116,43,0.08)' : 'transparent',
                        borderTop: '1px solid rgba(94,234,212,0.10)',
                      }}>
                        <td style={td}>
                          {trophy ? <span style={{ fontSize: 18 }}>{trophy}</span> : <span style={{ color: 'rgba(255,255,255,0.4)' }}>{i + 1}</span>}
                        </td>
                        <td style={{ ...td, fontWeight: 800 }}>{mask(c.handle)}</td>
                        <td style={td}>{c.followers ? c.followers.toLocaleString() : '—'}</td>
                        <td style={{ ...td, fontWeight: 800, color: '#5EEAD4' }}>{c.paid_referrals_count ?? 0}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: (c.payable_friday_cents ?? 0) > 0 ? '#FF9D5A' : 'rgba(255,255,255,0.4)' }}>
                          {usd(c.payable_friday_cents)}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#FFD9A8' }}>{usd(c.lifetime_paid_cents)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            Handles partially masked for privacy. Cash amounts are real and updated hourly.
          </div>
        </div>
      </section>
    </main>
  )
}

function Stat({ label, value, tone, hot }: { label: string; value: string; tone: 'teal' | 'money'; hot?: boolean }) {
  return (
    <div style={hot ? { padding: '8px 12px', borderRadius: 10, background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.30)' } : {}}>
      <div style={{
        fontSize: 22, fontWeight: 900,
        background: tone === 'money'
          ? 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)'
          : 'linear-gradient(135deg, #5EEAD4, #14B8A6)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        letterSpacing: '-0.5px', lineHeight: 1.1,
      }}>{value}</div>
      <div style={{
        fontSize: 10.5, fontWeight: 700,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        marginTop: 4,
      }}>{label}</div>
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '14px 14px 10px',
  fontSize: 10.5, fontWeight: 800,
  letterSpacing: '0.10em', textTransform: 'uppercase' as const,
  color: '#5EEAD4',
}

const td: React.CSSProperties = {
  padding: '14px 14px',
  fontSize: 13,
  color: 'rgba(255,255,255,0.85)',
  verticalAlign: 'middle' as const,
}
