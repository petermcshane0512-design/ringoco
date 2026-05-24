'use client'

/**
 * /admin/founder — Jarvis-style nucleus dashboard.
 *
 * Phase 1 (MVP): center node + business-metric ring + customer ring.
 * Phase 2 (next): infrastructure health ring (Twilio / Vapi / Supabase / etc).
 * Phase 3 (later): action queue + alerts.
 *
 * Auth: page itself is client-side; the data API
 * (/api/admin/founder-summary) gates via requireAdmin(). If the user
 * isn't admin they'll see "Forbidden" inside the canvas.
 *
 * Refresh: SWR polls every 5 minutes. Manual refresh button in corner.
 */

import { useMemo, useState, useEffect } from 'react'
import useSWR from 'swr'
import { ReactFlow, Background, MarkerType, type Node, type Edge } from '@xyflow/react'
import { motion, AnimatePresence } from 'framer-motion'
import '@xyflow/react/dist/style.css'

type FounderSummary = {
  asOf: string
  business: {
    activeCustomers: number
    totalProfiles: number
    mrr: number
    arr: number
    tierBreakdown: Record<string, number>
  }
  activity: {
    callsThisMonth: number
    callsToday: number
    callsLast7Days: number
    leadsCapturedMonth: number
    bookingsMonth: number
    bookingRate: number | null
  }
  economics: {
    cogsCallUsage: number
    cogsTwilioRental: number
    cogsTotal: number
    grossProfit: number
    grossMarginPct: number | null
    idiotIndex: number | null
    costToday?: number
    avgCostPerCall?: number | null
    realCostCoverage?: number | null
  }
  customers: Array<{
    user_id: string
    business_name: string
    tier: string
    tier_label: string
    mrr: number
    calls_this_month: number
    twilio_number: string | null
    first_call_at: string | null
    created_at: string
    health: 'green' | 'yellow' | 'red'
    health_note: string | null
  }>
  recentCalls?: Array<{
    user_id: string
    business_name: string
    caller_phone: string | null
    created_at: string
    lead_captured: boolean
    cost_usd: number | null
  }>
  infrastructure?: {
    twilio: {
      balance_usd: number | null
      error: string | null
      days_of_runway: number | null
    }
    vapi: {
      mtd_spend_usd: number
      balance_usd: number | null
      note: string
    }
  }
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`)
    return r.json() as Promise<FounderSummary>
  })

// ── Visual constants ────────────────────────────────────────────
const COLORS = {
  bg: '#070E1A',
  bgGradient: 'radial-gradient(ellipse at center, #0F1A2E 0%, #050911 100%)',
  panel: '#0F1A2E',
  panelBorder: 'rgba(122, 170, 178, 0.18)',
  text: '#E6EEF7',
  textMuted: '#7AAAB2',
  textDim: '#3D5A62',
  accent: '#0AA89F',
  accentGlow: 'rgba(10, 168, 159, 0.45)',
  green: '#22C55E',
  greenGlow: 'rgba(34, 197, 94, 0.40)',
  yellow: '#F59E0B',
  yellowGlow: 'rgba(245, 158, 11, 0.45)',
  red: '#EF4444',
  redGlow: 'rgba(239, 68, 68, 0.50)',
  edge: 'rgba(122, 170, 178, 0.28)',
}

function fmtMoney(n: number, compact = false): string {
  if (n === 0) return '$0'
  if (compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString()}`
}

function healthGlow(h: 'green' | 'yellow' | 'red'): string {
  return h === 'red' ? COLORS.redGlow : h === 'yellow' ? COLORS.yellowGlow : COLORS.greenGlow
}
function healthBorder(h: 'green' | 'yellow' | 'red'): string {
  return h === 'red' ? COLORS.red : h === 'yellow' ? COLORS.yellow : COLORS.green
}

// ── Layout math: position nodes around the center on a circle ──
function ringPositions(count: number, radius: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  // Start at 12 o'clock (-90°), distribute evenly
  for (let i = 0; i < count; i++) {
    const angle = (-Math.PI / 2) + (i / count) * 2 * Math.PI
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  }
  return positions
}

// ── Custom node renderers — Jarvis-style with breathing + hover effects ──
function CoreNode({ data }: { data: { mrr: number; arr: number; customers: number; tierBreakdown: Record<string, number> } }) {
  return (
    <motion.div
      // Continuous breathing — subtle pulse to make the core feel alive
      animate={{
        scale: [1, 1.04, 1],
        boxShadow: [
          `0 0 60px ${COLORS.accentGlow}, 0 0 120px ${COLORS.accentGlow}`,
          `0 0 100px ${COLORS.accentGlow}, 0 0 200px ${COLORS.accentGlow}`,
          `0 0 60px ${COLORS.accentGlow}, 0 0 120px ${COLORS.accentGlow}`,
        ],
      }}
      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      whileHover={{ scale: 1.12, transition: { type: 'spring', stiffness: 260, damping: 18 } }}
      style={{
        width: 260,
        height: 260,
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, ${COLORS.accentGlow} 0%, ${COLORS.panel} 60%)`,
        border: `2px solid ${COLORS.accent}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text,
        textAlign: 'center',
        padding: 24,
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {/* Rotating outer ring — gives the core a "scanning" Iron-Man feel */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          inset: -14,
          borderRadius: '50%',
          border: `1px dashed ${COLORS.accent}`,
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 42, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          inset: -26,
          borderRadius: '50%',
          border: `1px dotted ${COLORS.accent}`,
          opacity: 0.18,
          pointerEvents: 'none',
        }}
      />
      <div style={{ fontSize: 9, fontWeight: 800, color: COLORS.accent, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
        BellAveGo Core
      </div>
      <motion.div
        // Pulse the MRR number on update by re-keying
        key={data.mrr}
        initial={{ scale: 0.85, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 4 }}
      >
        {fmtMoney(data.mrr)}
      </motion.div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 14 }}>MRR · {fmtMoney(data.arr, true)} ARR</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.text }}>
        {data.customers}
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
        Active customer{data.customers === 1 ? '' : 's'}
      </div>
      {(data.tierBreakdown.officemgr > 0 || data.tierBreakdown.concierge > 0) && (
        <div style={{ fontSize: 9, color: COLORS.textDim, marginTop: 8, display: 'flex', gap: 8 }}>
          <span>{data.tierBreakdown.receptionist || 0} Starter</span>
          <span>·</span>
          <span>{data.tierBreakdown.officemgr || 0} Pro</span>
          {data.tierBreakdown.concierge > 0 && (
            <>
              <span>·</span>
              <span>{data.tierBreakdown.concierge} Elite</span>
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}

function MetricNode({ data }: { data: { label: string; value: string; sub?: string; health?: 'green' | 'yellow' | 'red' } }) {
  const h = data.health || 'green'
  return (
    <motion.div
      // Subtle continuous pulse — different phase per node so they don't sync
      animate={{
        boxShadow: [
          `0 0 24px ${healthGlow(h)}`,
          `0 0 42px ${healthGlow(h)}`,
          `0 0 24px ${healthGlow(h)}`,
        ],
      }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: Math.random() * 2 }}
      whileHover={{
        scale: 1.28,
        zIndex: 999,
        transition: { type: 'spring', stiffness: 320, damping: 16 },
      }}
      style={{
        width: 140,
        height: 140,
        borderRadius: '50%',
        background: COLORS.panel,
        border: `1.5px solid ${healthBorder(h)}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text,
        textAlign: 'center',
        padding: 14,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 8.5, fontWeight: 800, color: healthBorder(h), letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
        {data.label}
      </div>
      <motion.div
        key={data.value}
        initial={{ scale: 0.7, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: 'backOut' }}
        style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}
      >
        {data.value}
      </motion.div>
      {data.sub && (
        <div style={{ fontSize: 9.5, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.3 }}>{data.sub}</div>
      )}
    </motion.div>
  )
}

function CustomerNode({ data }: { data: { name: string; calls: number; tier: string; mrr: number; health: 'green' | 'yellow' | 'red'; note: string | null } }) {
  const h = data.health
  // Red customers pulse aggressively to demand attention
  const isRed = h === 'red'
  return (
    <motion.div
      title={data.note || ''}
      animate={isRed ? {
        boxShadow: [
          `0 0 14px ${healthGlow(h)}`,
          `0 0 38px ${healthGlow(h)}`,
          `0 0 14px ${healthGlow(h)}`,
        ],
        scale: [1, 1.06, 1],
      } : {
        boxShadow: [
          `0 0 14px ${healthGlow(h)}`,
          `0 0 22px ${healthGlow(h)}`,
          `0 0 14px ${healthGlow(h)}`,
        ],
      }}
      transition={{ duration: isRed ? 1.2 : 3.2, repeat: Infinity, ease: 'easeInOut', delay: Math.random() * 2 }}
      whileHover={{
        scale: 1.4,
        zIndex: 999,
        transition: { type: 'spring', stiffness: 360, damping: 14 },
      }}
      style={{
        width: 110,
        minHeight: 80,
        borderRadius: 14,
        background: COLORS.panel,
        border: `1.5px solid ${healthBorder(h)}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text,
        textAlign: 'center',
        padding: '10px 8px',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 8.5, fontWeight: 800, color: healthBorder(h), letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>
        {data.tier}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2, marginBottom: 4, maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {data.name}
      </div>
      <div style={{ fontSize: 9.5, color: COLORS.textMuted }}>
        {data.calls} calls · {fmtMoney(data.mrr)}/mo
      </div>
    </motion.div>
  )
}

// React-flow custom node type registry
const nodeTypes = {
  core: CoreNode,
  metric: MetricNode,
  customer: CustomerNode,
} as never

// ── Live counters strip — Jarvis HUD on top of the canvas ──
function LiveCountersStrip({ data }: { data: FounderSummary | undefined }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (!data) return null

  // Time since the most recent call (across the whole platform)
  const lastCallIso = data.recentCalls?.[0]?.created_at
  const secsSinceLastCall = lastCallIso
    ? Math.max(0, Math.floor((now - new Date(lastCallIso).getTime()) / 1000))
    : null
  const lastCallDisplay = secsSinceLastCall == null
    ? '—'
    : secsSinceLastCall < 60
    ? `${secsSinceLastCall}s ago`
    : secsSinceLastCall < 3600
    ? `${Math.floor(secsSinceLastCall / 60)}m ${secsSinceLastCall % 60}s ago`
    : `${Math.floor(secsSinceLastCall / 3600)}h ago`

  // Calls per hour rolling rate (over today's data)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const hoursElapsedToday = Math.max(0.5, (now - today.getTime()) / 1000 / 3600)
  const callsPerHour = data.activity.callsToday > 0
    ? (data.activity.callsToday / hoursElapsedToday).toFixed(1)
    : '0.0'

  // Infrastructure balance cells with red-pulse warnings when running low.
  const twilioBalance = data.infrastructure?.twilio.balance_usd ?? null
  const vapiSpend = data.infrastructure?.vapi.mtd_spend_usd ?? 0
  const twilioLow = twilioBalance != null && twilioBalance < 20
  const twilioCritical = twilioBalance != null && twilioBalance < 5

  const cells: Array<{ label: string; value: string; color: string; pulse?: boolean; sub?: string }> = [
    {
      label: 'Calls today',
      value: String(data.activity.callsToday),
      color: COLORS.accent,
      pulse: secsSinceLastCall != null && secsSinceLastCall < 30,
    },
    { label: 'Calls / hr', value: callsPerHour, color: '#5EEAD4' },
    {
      label: 'Spend today',
      value: data.economics.costToday != null ? `$${data.economics.costToday.toFixed(2)}` : '—',
      color: '#F59E0B',
    },
    { label: 'Last call', value: lastCallDisplay, color: COLORS.textMuted },
    {
      label: 'Twilio',
      value: twilioBalance != null ? `$${twilioBalance.toFixed(2)}` : '—',
      color: twilioCritical ? '#EF4444' : twilioLow ? '#F59E0B' : '#22C55E',
      pulse: twilioCritical,
      sub: data.infrastructure?.twilio.days_of_runway != null
        ? `~${data.infrastructure.twilio.days_of_runway}d runway`
        : undefined,
    },
    {
      label: 'Vapi MTD',
      value: `$${vapiSpend.toFixed(2)}`,
      color: '#8B5CF6',
      sub: 'check dashboard for bal',
    },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        top: 84,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 0,
        background: 'rgba(15,26,46,0.85)',
        backdropFilter: 'blur(8px)',
        border: `1px solid rgba(122,170,178,0.25)`,
        borderRadius: 14,
        padding: '4px 4px',
        zIndex: 10,
        boxShadow: `0 8px 32px rgba(0,0,0,0.45)`,
      }}
    >
      {cells.map((c, i) => (
        <div key={c.label} style={{ position: 'relative', padding: '10px 18px', borderRight: i < cells.length - 1 ? `1px solid rgba(122,170,178,0.12)` : 'none', textAlign: 'center', minWidth: 96 }}>
          {c.pulse && (
            <motion.div
              animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: c.color, boxShadow: `0 0 12px ${c.color}` }}
            />
          )}
          <div style={{ fontSize: 9, fontWeight: 800, color: c.color, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            {c.label}
          </div>
          <motion.div
            key={c.value}
            initial={{ scale: 0.7, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: 'backOut' }}
            style={{ fontSize: 18, fontWeight: 900, color: COLORS.text, letterSpacing: '-0.03em' }}
          >
            {c.value}
          </motion.div>
          {c.sub && (
            <div style={{ fontSize: 8.5, color: COLORS.textDim, marginTop: 2, letterSpacing: '0.04em' }}>
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Activity feed — bottom-right ticker of recent calls ──
function ActivityFeed({ calls }: { calls: FounderSummary['recentCalls'] }) {
  if (!calls || calls.length === 0) {
    return (
      <div style={feedShellStyle}>
        <div style={feedHeaderStyle}>Activity Feed</div>
        <div style={{ padding: 18, fontSize: 11, color: COLORS.textDim }}>
          Waiting for the next call…
        </div>
      </div>
    )
  }

  return (
    <div style={feedShellStyle}>
      <div style={feedHeaderStyle}>
        <span>Activity Feed</span>
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        <AnimatePresence initial={false}>
          {calls.slice(0, 12).map((c, i) => {
            const secsAgo = Math.max(0, Math.floor((Date.now() - new Date(c.created_at).getTime()) / 1000))
            const ago = secsAgo < 60 ? `${secsAgo}s` : secsAgo < 3600 ? `${Math.floor(secsAgo / 60)}m` : `${Math.floor(secsAgo / 3600)}h`
            return (
              <motion.div
                key={`${c.user_id}-${c.created_at}`}
                initial={{ opacity: 0, x: 30, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03, duration: 0.3, ease: 'easeOut' }}
                style={{
                  padding: '9px 14px',
                  borderTop: i > 0 ? '1px solid rgba(122,170,178,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 11,
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: c.lead_captured ? '#22C55E' : '#F59E0B',
                  boxShadow: `0 0 6px ${c.lead_captured ? '#22C55E' : '#F59E0B'}`,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: COLORS.text, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.business_name}
                  </div>
                  <div style={{ color: COLORS.textMuted, fontSize: 10 }}>
                    {c.caller_phone ?? 'no number'} · {c.lead_captured ? 'lead captured' : 'no message'}
                    {c.cost_usd != null && ` · $${c.cost_usd.toFixed(3)}`}
                  </div>
                </div>
                <span style={{ color: COLORS.textDim, fontSize: 10, flexShrink: 0 }}>{ago}</span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

const feedShellStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 36,
  right: 24,
  width: 320,
  background: 'rgba(15,26,46,0.92)',
  backdropFilter: 'blur(10px)',
  border: `1px solid rgba(122,170,178,0.22)`,
  borderRadius: 14,
  zIndex: 10,
  boxShadow: `0 12px 40px rgba(0,0,0,0.6)`,
  overflow: 'hidden',
}

const feedHeaderStyle: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: 10,
  fontWeight: 800,
  color: COLORS.accent,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  borderBottom: '1px solid rgba(122,170,178,0.12)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

// ── Main page ──────────────────────────────────────────────────
export default function FounderDashboard() {
  const { data, error, isLoading, mutate } = useSWR<FounderSummary>(
    '/api/admin/founder-summary',
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: true },
  )

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [] as Node[], edges: [] as Edge[] }

    const nodes: Node[] = []
    const edges: Edge[] = []

    // ── Center node ────────────────────────────────────────────
    nodes.push({
      id: 'core',
      type: 'core',
      position: { x: -130, y: -130 }, // offset by half-size to center
      data: {
        mrr: data.business.mrr,
        arr: data.business.arr,
        customers: data.business.activeCustomers,
        tierBreakdown: data.business.tierBreakdown,
      },
      draggable: false,
      selectable: false,
    } as Node)

    // ── Inner ring: business metrics ───────────────────────────
    const metrics = [
      {
        id: 'calls-month',
        label: 'Calls / mo',
        value: data.activity.callsThisMonth.toLocaleString(),
        sub: `${data.activity.callsToday} today`,
        health: 'green' as const,
      },
      {
        id: 'leads',
        label: 'Leads / mo',
        value: data.activity.leadsCapturedMonth.toString(),
        sub: data.activity.bookingsMonth > 0 ? `${data.activity.bookingsMonth} booked` : 'no bookings yet',
        health: 'green' as const,
      },
      {
        id: 'cogs',
        label: 'COGS / mo',
        value: fmtMoney(data.economics.cogsTotal),
        sub: `$${data.economics.cogsCallUsage} calls + $${data.economics.cogsTwilioRental} #s`,
        health: (data.economics.grossMarginPct ?? 100) < 50 ? 'red' : (data.economics.grossMarginPct ?? 100) < 70 ? 'yellow' : 'green',
      },
      {
        id: 'cost-today',
        label: 'Spend today',
        value: fmtMoney(data.economics.costToday ?? 0),
        sub: data.economics.avgCostPerCall != null
          ? `$${data.economics.avgCostPerCall.toFixed(3)} avg/call`
          : 'no calls yet',
        health: 'green' as const,
      },
      {
        id: 'margin',
        label: 'Gross margin',
        value: data.economics.grossMarginPct != null ? `${data.economics.grossMarginPct}%` : '—',
        sub: data.economics.grossProfit > 0 ? `${fmtMoney(data.economics.grossProfit)} profit` : 'no revenue yet',
        health: (data.economics.grossMarginPct ?? 100) < 50 ? 'red' : (data.economics.grossMarginPct ?? 100) < 70 ? 'yellow' : 'green',
      },
      {
        id: 'idiot-index',
        label: 'Idiot Index',
        value: data.economics.idiotIndex != null ? `${data.economics.idiotIndex}x` : '—',
        sub: 'price ÷ COGS',
        health: 'green' as const,
      },
      {
        id: 'week-trend',
        label: 'Calls / 7d',
        value: data.activity.callsLast7Days.toString(),
        sub: 'rolling 7-day',
        health: 'green' as const,
      },
    ]

    const innerRingRadius = 320
    const innerPositions = ringPositions(metrics.length, innerRingRadius)
    metrics.forEach((m, i) => {
      nodes.push({
        id: m.id,
        type: 'metric',
        position: { x: innerPositions[i].x - 70, y: innerPositions[i].y - 70 },
        data: m,
        draggable: false,
        selectable: false,
      } as Node)
      edges.push({
        id: `core-${m.id}`,
        source: 'core',
        target: m.id,
        style: { stroke: COLORS.accent, strokeWidth: 1.4, opacity: 0.55 },
        animated: true,
      })
    })

    // ── Outer ring: customer nodes ─────────────────────────────
    if (data.customers.length > 0) {
      const outerRingRadius = Math.max(560, 380 + data.customers.length * 4)
      const outerPositions = ringPositions(data.customers.length, outerRingRadius)
      data.customers.forEach((c, i) => {
        nodes.push({
          id: `cust-${c.user_id}`,
          type: 'customer',
          position: { x: outerPositions[i].x - 55, y: outerPositions[i].y - 40 },
          data: {
            name: c.business_name,
            calls: c.calls_this_month,
            tier: c.tier_label,
            mrr: c.mrr,
            health: c.health,
            note: c.health_note,
          },
          draggable: false,
          selectable: false,
        } as Node)
        edges.push({
          id: `core-cust-${c.user_id}`,
          source: 'core',
          target: `cust-${c.user_id}`,
          style: {
            stroke: c.health === 'red' ? COLORS.red : c.health === 'yellow' ? COLORS.yellow : COLORS.edge,
            strokeWidth: c.health === 'red' ? 1.2 : 0.8,
            strokeDasharray: '3 3',
            opacity: c.health === 'green' ? 0.5 : 0.9,
          },
          animated: c.health !== 'green',
        })
      })
    }

    return { nodes, edges }
  }, [data])

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>Founder dashboard unavailable</div>
        <div style={{ fontSize: 13, color: COLORS.textMuted }}>
          {(error as Error).message === '401' || (error as Error).message === '403'
            ? 'You are not logged in as an admin. Sign in with the admin Clerk account.'
            : `Error: ${(error as Error).message}`}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: COLORS.bgGradient,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      {/* Top header strip — minimal */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '18px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10,
          background: 'linear-gradient(180deg, rgba(7,14,26,0.92) 0%, transparent 100%)',
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: COLORS.accent, letterSpacing: '0.20em', textTransform: 'uppercase' }}>
            Founder Dashboard
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: COLORS.text, letterSpacing: '-0.02em', marginTop: 2 }}>
            BellAveGo · live nucleus
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, textAlign: 'right' }}>
            {data ? (
              <>
                As of {new Date(data.asOf).toLocaleTimeString()}
                <br />
                <span style={{ color: COLORS.textDim }}>Auto-refresh every 5 min</span>
              </>
            ) : (
              'Loading…'
            )}
          </div>
          <button
            onClick={() => mutate()}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              border: `1px solid ${COLORS.accent}`,
              background: 'transparent',
              color: COLORS.accent,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Loading veil */}
      {isLoading && !data && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, fontSize: 14 }}>
          Pulling live metrics…
        </div>
      )}

      {/* Scanning line — sweeps top-to-bottom every 8s like a Jarvis HUD */}
      <motion.div
        animate={{ y: ['-2%', '102%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${COLORS.accent} 50%, transparent 100%)`,
          opacity: 0.35,
          boxShadow: `0 0 24px ${COLORS.accent}`,
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />

      {/* Main canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        defaultEdgeOptions={{
          type: 'straight',
          markerEnd: { type: MarkerType.ArrowClosed, color: COLORS.edge, width: 10, height: 10 },
        }}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background color="rgba(122,170,178,0.08)" gap={32} size={1} />
      </ReactFlow>

      {/* Live counters strip — top-center overlay */}
      <LiveCountersStrip data={data} />

      {/* Activity feed — bottom-right overlay */}
      <ActivityFeed calls={data?.recentCalls} />

      {/* Bottom hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 10,
          color: COLORS.textDim,
          letterSpacing: '0.08em',
          pointerEvents: 'none',
        }}
      >
        scroll to zoom · drag to pan · hover customer nodes for health detail
      </div>
    </div>
  )
}
