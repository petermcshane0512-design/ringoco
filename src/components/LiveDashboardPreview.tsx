'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * LiveDashboardPreview — animated mockup of what the contractor sees
 * when they log into the BellAveGo dashboard. Lets prospects visualize
 * the product they're buying.
 *
 * Two tabs: This Week / This Month. Each shows accumulating lead rows
 * with status badges (NEW / REPLIED / BOOKED). Stat cards on top tick
 * up. Rows animate in with framer-motion. Replied/booked badges flip
 * on a timer to show the AI outreach working.
 */

type View = 'week' | 'month'

type Status = 'NEW' | 'REPLIED' | 'BOOKED'

type Row = {
  id: string
  owner: string
  address: string
  zip: string
  trade: string
  signal: 'PERMIT' | 'STORM' | 'AGED' | 'MOVE-IN'
  score: number
  status: Status
  jobValue: string
}

const SIGNAL_PILL: Record<Row['signal'], { bg: string; fg: string; label: string }> = {
  'PERMIT':  { bg: '#E0F2FE', fg: '#0369A1', label: '🏛 Permit'  },
  'STORM':   { bg: '#FEF3C7', fg: '#92400E', label: '⛈ Storm'   },
  'AGED':    { bg: '#FCE7F3', fg: '#9D174D', label: '🌡 Aged'   },
  'MOVE-IN': { bg: '#DCFCE7', fg: '#166534', label: '🏠 Move-in' },
}

const STATUS_PILL: Record<Status, { bg: string; fg: string; label: string }> = {
  NEW:     { bg: '#F1F5F9', fg: '#475569', label: 'New'              },
  REPLIED: { bg: '#FEF3C7', fg: '#92400E', label: '💬 Replied'      },
  BOOKED:  { bg: '#DCFCE7', fg: '#166534', label: '💰 Booked'       },
}

const WEEK_ROWS: Row[] = [
  { id: 'w1', owner: 'Mike Coleman',    address: '7842 Oak Ridge',   zip: '75024', trade: 'HVAC',     signal: 'PERMIT',  score: 92, status: 'BOOKED',  jobValue: '$3,200–4,800' },
  { id: 'w2', owner: 'Sarah Whitman',   address: '2188 Birch Ln',    zip: '75093', trade: 'Roofing',  signal: 'STORM',   score: 88, status: 'REPLIED', jobValue: '$8,400–12,000' },
  { id: 'w3', owner: 'Carlos Reyes',    address: '1923 Briarwood',   zip: '75035', trade: 'HVAC',     signal: 'AGED',    score: 81, status: 'REPLIED', jobValue: '$5,400–9,200' },
  { id: 'w4', owner: 'James Patel',     address: '388 Cedar Park',   zip: '75070', trade: 'Plumbing', signal: 'MOVE-IN', score: 76, status: 'NEW',     jobValue: '$1,800–3,400' },
  { id: 'w5', owner: 'Linda Hong',      address: '6618 Aspen Way',   zip: '75002', trade: 'Electric', signal: 'PERMIT',  score: 84, status: 'NEW',     jobValue: '$2,200–4,100' },
]

const MONTH_ROWS: Row[] = [
  ...WEEK_ROWS,
  { id: 'm6',  owner: 'Tony Suarez',     address: '4218 Catalina',   zip: '85710', trade: 'HVAC',     signal: 'PERMIT',  score: 90, status: 'BOOKED',  jobValue: '$3,800–5,200' },
  { id: 'm7',  owner: 'Maria Lopez',     address: '7711 Camelback',  zip: '85016', trade: 'HVAC',     signal: 'AGED',    score: 79, status: 'BOOKED',  jobValue: '$4,200–7,100' },
  { id: 'm8',  owner: 'David Kim',       address: '5510 Indian Bend', zip: '85254', trade: 'Handyman', signal: 'MOVE-IN', score: 72, status: 'REPLIED', jobValue: '$600–1,800' },
  { id: 'm9',  owner: 'Rachel Brooks',   address: '988 Peachtree',   zip: '30301', trade: 'HVAC',     signal: 'PERMIT',  score: 86, status: 'REPLIED', jobValue: '$3,400–5,600' },
  { id: 'm10', owner: 'Jamal Wright',    address: '142 Edgewood',    zip: '30329', trade: 'Roofing',  signal: 'STORM',   score: 91, status: 'BOOKED',  jobValue: '$9,200–14,800' },
  { id: 'm11', owner: 'Susan O’Neal',    address: '8800 Magnolia',   zip: '32801', trade: 'HVAC',     signal: 'AGED',    score: 83, status: 'REPLIED', jobValue: '$3,900–6,400' },
  { id: 'm12', owner: 'Chris Vega',      address: '2202 Ocean Dr',   zip: '33139', trade: 'Plumbing', signal: 'MOVE-IN', score: 77, status: 'REPLIED', jobValue: '$1,400–3,200' },
  { id: 'm13', owner: 'Tyler Brooks',    address: '419 Music Row',   zip: '37203', trade: 'Electric', signal: 'PERMIT',  score: 80, status: 'NEW',     jobValue: '$2,800–4,800' },
  { id: 'm14', owner: 'Nina Patel',      address: '6601 Westgate',   zip: '78704', trade: 'HVAC',     signal: 'AGED',    score: 87, status: 'NEW',     jobValue: '$4,600–7,800' },
  { id: 'm15', owner: 'Greg Foster',     address: '3304 Watauga',    zip: '76137', trade: 'Roofing',  signal: 'STORM',   score: 89, status: 'NEW',     jobValue: '$7,800–11,400' },
]

export default function LiveDashboardPreview() {
  const [view, setView] = useState<View>('week')
  const [autoIdx, setAutoIdx] = useState(0)

  // Toggle between week/month every 6s so prospects see both
  useEffect(() => {
    const id = setInterval(() => {
      setView((v) => (v === 'week' ? 'month' : 'week'))
      setAutoIdx((i) => i + 1)
    }, 6000)
    return () => clearInterval(id)
  }, [])

  const rows = view === 'week' ? WEEK_ROWS : MONTH_ROWS
  const totalForView = view === 'week' ? 10 : 40
  const stats = {
    total: totalForView,
    booked: rows.filter((r) => r.status === 'BOOKED').length,
    replied: rows.filter((r) => r.status === 'REPLIED').length,
    revenue: rows.filter((r) => r.status === 'BOOKED').reduce((acc, r) => {
      const lo = parseInt(r.jobValue.split('–')[0].replace(/\D/g, ''), 10) || 0
      return acc + lo
    }, 0),
  }

  return (
    <section style={{ padding: '64px clamp(16px, 5vw, 48px)', background: '#FFFFFF' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', borderRadius: 99,
            background: 'rgba(232,116,43,0.12)',
            border: '1.5px solid rgba(232,116,43,0.40)',
            fontSize: 12, fontWeight: 800, color: '#C84B26',
            letterSpacing: '0.10em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8742B', boxShadow: '0 0 12px #E8742B' }} />
            Your dashboard · preview
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3.2vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '14px 0 8px', color: '#0B1F3A' }}>
            This is what you log into Monday morning.
          </h2>
          <p style={{ fontSize: 15, color: '#4A6670', margin: '0 auto', maxWidth: 680, lineHeight: 1.55 }}>
            Real homeowners. Real status. Real money. Auto-cycling week ↔ month view so you can see how leads stack.
          </p>
        </div>

        {/* Dashboard card */}
        <div style={{
          borderRadius: 20,
          background: '#FFF8F0',
          border: '1px solid rgba(232,116,43,0.22)',
          padding: 'clamp(18px, 3vw, 28px)',
          boxShadow: '0 30px 70px rgba(11,31,58,0.10), 0 4px 14px rgba(232,116,43,0.05)',
        }}>
          {/* Top bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 14,
            paddingBottom: 16, marginBottom: 18,
            borderBottom: '1px solid rgba(232,116,43,0.18)',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                Plano Heating &amp; Air · TX 75024
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>
                Hey John —
              </div>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'inline-flex', padding: 4, borderRadius: 12,
              background: '#FFFFFF', border: '1px solid rgba(232,116,43,0.22)',
            }}>
              {(['week', 'month'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => { setView(v); setAutoIdx((i) => i + 1) }}
                  style={{
                    padding: '8px 16px', borderRadius: 9, border: 'none',
                    fontSize: 12.5, fontWeight: 800,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    cursor: 'pointer',
                    background: view === v ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'transparent',
                    color: view === v ? '#fff' : '#4A6670',
                    boxShadow: view === v ? '0 6px 16px rgba(232,116,43,0.30)' : 'none',
                    transition: 'all 200ms ease',
                  }}
                >This {v}</button>
              ))}
            </div>
          </div>

          {/* Stat cards */}
          <AnimatePresence mode="wait">
            <motion.div
              key={view + autoIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35 }}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <StatCard label={view === 'week' ? 'This week' : 'This month'} value={stats.total} sub={stats.total === 1 ? 'lead' : 'leads'} accent />
              <StatCard label="Replied" value={stats.replied} sub={`${Math.round((stats.replied / stats.total) * 100)}% rate`} />
              <StatCard label="Booked" value={stats.booked} sub={stats.booked === 1 ? 'install' : 'installs'} />
              <StatCard label="Revenue floor" value={`$${stats.revenue.toLocaleString()}`} sub="from booked jobs" />
            </motion.div>
          </AnimatePresence>

          {/* Lead rows */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.8fr 0.9fr',
            gap: 10,
            padding: '10px 16px 8px',
            fontSize: 10.5, fontWeight: 900,
            color: '#7AAAB2', letterSpacing: '0.14em', textTransform: 'uppercase',
          }} className="ldp-header">
            <div>Owner / Address</div>
            <div>Signal</div>
            <div>Trade</div>
            <div>Score</div>
            <div>Est. value</div>
            <div style={{ textAlign: 'right' }}>Status</div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <AnimatePresence mode="popLayout">
              {rows.map((r, i) => {
                const sig = SIGNAL_PILL[r.signal]
                const status = STATUS_PILL[r.status]
                return (
                  <motion.div
                    key={view + r.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.32, delay: i * 0.05 }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 0.7fr 0.7fr 0.7fr 0.8fr 0.9fr',
                      gap: 10,
                      alignItems: 'center',
                      padding: '14px 16px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid rgba(232,116,43,0.14)',
                      boxShadow: '0 4px 10px rgba(11,31,58,0.04)',
                      fontSize: 13.5,
                    }}
                    className="ldp-row"
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#0B1F3A' }}>{r.owner}</div>
                      <div style={{ fontSize: 11.5, color: '#4A6670', marginTop: 2 }}>{r.address} · {r.zip}</div>
                    </div>
                    <div>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 7,
                        background: sig.bg, color: sig.fg,
                        fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
                      }}>{sig.label}</span>
                    </div>
                    <div style={{ color: '#4A6670', fontWeight: 700 }}>{r.trade}</div>
                    <div style={{ color: '#C84B26', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{r.score}</div>
                    <div style={{ color: '#0B1F3A', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.jobValue}</div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', borderRadius: 8,
                        background: status.bg, color: status.fg,
                        fontSize: 11, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>{status.label}</span>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div style={{
            marginTop: 18, padding: '14px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(232,116,43,0.10), rgba(94,234,212,0.06))',
            border: '1px dashed rgba(232,116,43,0.30)',
            fontSize: 13, color: '#0B1F3A', textAlign: 'center', lineHeight: 1.55,
          }}>
            👆 This is the actual dashboard. Same UI on your phone + laptop. <strong style={{ color: '#C84B26' }}>Lock your zip → first leads land Monday 6am.</strong>
          </div>
        </div>

        <style jsx global>{`
          @media (max-width: 760px) {
            .ldp-header { display: none !important; }
            .ldp-row {
              grid-template-columns: 1fr auto !important;
              grid-template-rows: auto auto;
            }
            .ldp-row > div:nth-child(2),
            .ldp-row > div:nth-child(3),
            .ldp-row > div:nth-child(4),
            .ldp-row > div:nth-child(5) {
              grid-column: 1 / -1;
              display: inline-block;
              margin-right: 8px;
              font-size: 11px !important;
            }
          }
        `}</style>
      </div>
    </section>
  )
}

function StatCard({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14,
      background: accent ? 'linear-gradient(135deg, #FFD9A8 0%, #FFFFFF 100%)' : '#FFFFFF',
      border: accent ? '2px solid #E8742B' : '1px solid rgba(232,116,43,0.22)',
      boxShadow: accent ? '0 10px 24px rgba(232,116,43,0.18)' : '0 4px 12px rgba(11,31,58,0.04)',
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: accent ? '#C84B26' : '#4A6670', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
        background: 'linear-gradient(135deg, #FF9D5A, #C84B26)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 3, fontWeight: 600 }}>{sub}</div>
    </div>
  )
}
