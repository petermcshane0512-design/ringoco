import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type ReportNarrative = {
  exec_summary?: string[]
  key_wins?: string[]
  what_to_fix?: string[]
  competitive_intel?: string[]
  this_weeks_action?: string[]
}

type WeeklyData = {
  weekStart: string
  weekEnd: string
  calls: { received: number; booked: number; missed: number; bookingRate: number }
  jobs: { created: number; completed: number; revenue: number }
  collections: { invoicesChased: number; recoveredCents: number }
  quotes: { sent: number; closed: number; closeRate: number }
  ads: { campaigns: number; spendCents: number; impressions: number; clicks: number; conversions: number }
  leads: { sourced: number; contacted: number; booked: number }
}

type Payload = { data: WeeklyData; narrative: ReportNarrative; business_name: string }

export default async function PublicReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params

  const { data: row } = await supabase
    .from('concierge_reports')
    .select('id, week_start, payload, opened_at')
    .eq('id', reportId)
    .maybeSingle()

  if (!row) notFound()

  // Best-effort mark opened (don't block render)
  if (!row.opened_at) {
    supabase.from('concierge_reports').update({ opened_at: new Date().toISOString() }).eq('id', reportId).then(() => {})
  }

  const payload = row.payload as Payload
  const { data, narrative, business_name } = payload

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F9F5', minHeight: '100vh', padding: '48px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 8px' }}>
            BellAveGo · Weekly Strategy Report
          </p>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-1px', lineHeight: 1.1, margin: '0 0 8px' }}>
            {business_name}
          </h1>
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Week of {data.weekStart} → {data.weekEnd}</p>
        </div>

        {/* Exec summary */}
        {narrative.exec_summary && narrative.exec_summary.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', color: '#fff', borderRadius: 16, padding: '28px 32px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'rgba(94, 234, 212, 0.85)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 14px' }}>Executive Summary</p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {narrative.exec_summary.map((b, i) => (
                <li key={i} style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 12px', paddingLeft: 22, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, color: '#5EEAD4', fontWeight: 800 }}>→</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Metrics row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Calls', value: data.calls.received, sub: `${data.calls.booked} booked` },
            { label: 'Revenue', value: `$${data.jobs.revenue.toLocaleString()}`, sub: `${data.jobs.completed} jobs` },
            { label: 'Collected', value: `$${(data.collections.recoveredCents / 100).toLocaleString()}`, sub: `${data.collections.invoicesChased} chased` },
            { label: 'New leads', value: data.leads.sourced, sub: `${data.leads.booked} booked` },
          ].map(m => (
            <div key={m.label} style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', border: '1px solid #DCE9E2' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#7AAAB2', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>{m.label}</p>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', margin: '0 0 2px', letterSpacing: '-0.5px' }}>{m.value}</p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* Wins / Fix / Intel sections */}
        {(['key_wins', 'what_to_fix', 'competitive_intel', 'this_weeks_action'] as const).map(key => {
          const items = narrative[key]
          if (!items || items.length === 0) return null
          const titles = {
            key_wins: { label: 'What worked', color: '#16A34A', bg: '#F0FDF4' },
            what_to_fix: { label: 'What to fix', color: '#DC2626', bg: '#FEF2F2' },
            competitive_intel: { label: 'Competitive intel', color: '#0AA89F', bg: '#ECFEFF' },
            this_weeks_action: { label: 'This week\'s actions', color: '#7C3AED', bg: '#FAF5FF' },
          }
          const t = titles[key]
          return (
            <div key={key} style={{ background: t.bg, borderRadius: 14, padding: '24px 28px', marginBottom: 16, border: `1px solid ${t.color}30` }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: t.color, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>{t.label}</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {items.map((b, i) => (
                  <li key={i} style={{ fontSize: 15, lineHeight: 1.55, color: '#0B1F3A', margin: '0 0 10px', paddingLeft: 20, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, top: 0, color: t.color, fontWeight: 800 }}>✓</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

        {/* Footer */}
        <div style={{ marginTop: 36, textAlign: 'center', padding: '24px 0', borderTop: '1px solid #DCE9E2' }}>
          <p style={{ fontSize: 12, color: '#7AAAB2', margin: 0 }}>Generated by BellAveGo AI Account Manager · A new report ships next Monday.</p>
        </div>
      </div>
    </main>
  )
}
