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

import { useMemo } from 'react'
import useSWR from 'swr'
import { ReactFlow, Background, MarkerType, type Node, type Edge } from '@xyflow/react'
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

// ── Custom node renderers (passed as children inside default nodes) ──
function CoreNode({ data }: { data: { mrr: number; arr: number; customers: number; tierBreakdown: Record<string, number> } }) {
  return (
    <div
      style={{
        width: 260,
        height: 260,
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, ${COLORS.accentGlow} 0%, ${COLORS.panel} 60%)`,
        border: `2px solid ${COLORS.accent}`,
        boxShadow: `0 0 60px ${COLORS.accentGlow}, 0 0 120px ${COLORS.accentGlow}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, color: COLORS.accent, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
        BellAveGo Core
      </div>
      <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 4 }}>
        {fmtMoney(data.mrr)}
      </div>
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
    </div>
  )
}

function MetricNode({ data }: { data: { label: string; value: string; sub?: string; health?: 'green' | 'yellow' | 'red' } }) {
  const h = data.health || 'green'
  return (
    <div
      style={{
        width: 140,
        height: 140,
        borderRadius: '50%',
        background: COLORS.panel,
        border: `1.5px solid ${healthBorder(h)}`,
        boxShadow: `0 0 24px ${healthGlow(h)}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text,
        textAlign: 'center',
        padding: 14,
      }}
    >
      <div style={{ fontSize: 8.5, fontWeight: 800, color: healthBorder(h), letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6 }}>
        {data.label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {data.value}
      </div>
      {data.sub && (
        <div style={{ fontSize: 9.5, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.3 }}>{data.sub}</div>
      )}
    </div>
  )
}

function CustomerNode({ data }: { data: { name: string; calls: number; tier: string; mrr: number; health: 'green' | 'yellow' | 'red'; note: string | null } }) {
  const h = data.health
  return (
    <div
      title={data.note || ''}
      style={{
        width: 110,
        minHeight: 80,
        borderRadius: 14,
        background: COLORS.panel,
        border: `1.5px solid ${healthBorder(h)}`,
        boxShadow: `0 0 14px ${healthGlow(h)}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLORS.text,
        textAlign: 'center',
        padding: '10px 8px',
        cursor: 'help',
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
    </div>
  )
}

// React-flow custom node type registry
const nodeTypes = {
  core: CoreNode,
  metric: MetricNode,
  customer: CustomerNode,
} as never

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
        style: { stroke: COLORS.edge, strokeWidth: 1.2 },
        animated: false,
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
          style: { stroke: COLORS.edge, strokeWidth: 0.8, strokeDasharray: '3 3' },
          animated: false,
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
