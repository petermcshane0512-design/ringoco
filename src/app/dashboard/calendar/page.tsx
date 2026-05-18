'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Connection = {
  provider: string
  email: string | null
  name: string | null
  enabled: boolean
  connectedAt: string
  lastSyncedAt: string | null
  lastError: string | null
}

function CalendarPageInner() {
  const params = useSearchParams()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const flashStatus = params.get('calendar')
  const flashReason = params.get('reason')
  const flashAccount = params.get('account')
  const flashUnderlying = params.get('underlying')

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/calendar/status')
      const j = await res.json()
      setConnections(j.connections || [])
    } catch { setConnections([]) }
    finally { setLoading(false) }
  }

  const cronofyConnection = connections.find((c) => c.provider === 'cronofy' && c.enabled)

  async function disconnect() {
    if (!confirm('Disconnect your calendar? The AI will stop offering specific time slots from your calendar.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'cronofy' }),
      })
      await refresh()
    } finally { setDisconnecting(false) }
  }

  // Pretty name for the underlying provider on the success banner / connection chip
  const prettyProvider = (raw: string | null | undefined): string => {
    const p = (raw || '').toLowerCase()
    if (p.includes('google'))    return 'Google Calendar'
    if (p.includes('office365')) return 'Microsoft 365'
    if (p.includes('outlook'))   return 'Microsoft Outlook'
    if (p.includes('exchange'))  return 'Microsoft Exchange'
    if (p.includes('apple') || p.includes('icloud')) return 'Apple iCloud'
    if (p.includes('caldav'))    return 'CalDAV'
    if (p)                       return raw as string
    return 'your calendar'
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>
        ← Back to dashboard
      </Link>

      <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.04em', marginTop: 14, marginBottom: 8 }}>
        Connect your calendar.
      </h1>
      <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.55, maxWidth: 680, marginBottom: 24 }}>
        Give the AI receptionist access to your real-time availability and it&apos;ll <strong>offer specific time slots</strong> during the call — &quot;Mike has Tuesday at 2 PM or Wednesday at 9 AM, which works?&quot; — instead of just taking a message. Auto-booking ships in Phase 2 (Q3 2026).
      </p>

      {/* Flash banners from OAuth callback */}
      {flashStatus === 'connected' && (
        <FlashBanner kind="success">
          ✅ Connected to {prettyProvider(flashUnderlying)}{flashAccount ? ` (${flashAccount})` : ''}. The AI will start offering specific slots on the next inbound call.
        </FlashBanner>
      )}
      {flashStatus === 'error' && (
        <FlashBanner kind="error">
          Couldn&apos;t connect calendar. {flashReason ? <em>Reason: {flashReason}</em> : null} Try again, or text our team at 773-710-9565.
        </FlashBanner>
      )}

      {/* Single Connect-a-Calendar card — Cronofy handles the provider picker */}
      {cronofyConnection ? (
        // CONNECTED state
        <div style={{
          background: '#fff',
          border: '1.5px solid #22C55E',
          borderRadius: 16,
          padding: '24px 28px',
          boxShadow: '0 4px 20px rgba(7,27,58,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg, #22C55E, #16A34A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(34,197,94,0.32)',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: '#16A34A', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                Calendar connected
              </div>
              <div style={{ fontSize: 17, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>
                {cronofyConnection.name || prettyProvider(cronofyConnection.provider)}
              </div>
              {cronofyConnection.email && (
                <div style={{ fontSize: 13, color: '#7AAAB2', marginTop: 2 }}>{cronofyConnection.email}</div>
              )}
            </div>
            <button
              onClick={disconnect}
              disabled={disconnecting}
              style={{
                padding: '10px 18px', borderRadius: 9,
                background: '#FEF2F2', color: '#991B1B',
                border: '1px solid #FECACA',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
          <div style={{ padding: '12px 14px', background: '#F0FAF7', borderRadius: 10, fontSize: 13, color: '#0D8F87' }}>
            ✓ The AI now checks your real-time availability before offering appointment times on every call.
          </div>
        </div>
      ) : (
        // NOT-CONNECTED state — one big Connect button
        <div style={{
          background: 'linear-gradient(135deg, #FFF9F0 0%, #FFFFFF 60%)',
          border: '1.5px solid rgba(232,116,43,0.32)',
          borderRadius: 16,
          padding: '28px 32px',
          boxShadow: '0 8px 32px rgba(232,116,43,0.10)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 900, color: '#C84B26',
              background: 'rgba(232,116,43,0.12)', padding: '3px 9px', borderRadius: 99,
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              Recommended · 60 seconds
            </span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0B1F3A', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Let the AI offer real appointment times
          </h2>
          <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55, margin: '0 0 18px' }}>
            Connect <strong>any</strong> calendar — Google, Microsoft Outlook, Office 365, Apple iCloud, Exchange, or CalDAV — and the AI checks your real availability before offering specific slots to callers. You pick which calendar provider on the next screen.
          </p>
          <a
            href="/api/calendar/cronofy/connect"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '13px 26px', borderRadius: 11,
              background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
              color: '#0B1F3A', fontSize: 14, fontWeight: 900,
              textDecoration: 'none',
              boxShadow: '0 8px 22px rgba(232,116,43,0.32)',
            }}
          >
            Connect Calendar
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B1F3A" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>

          {/* Supported providers row */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(232,116,43,0.18)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              Supports
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { name: 'Google Calendar', color: '#4285F4' },
                { name: 'Microsoft 365', color: '#0078D4' },
                { name: 'Microsoft Outlook', color: '#0078D4' },
                { name: 'Exchange', color: '#00897B' },
                { name: 'Apple iCloud', color: '#0B1F3A' },
                { name: 'CalDAV', color: '#7C3AED' },
              ].map((p) => (
                <span key={p.name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 99,
                  background: '#fff', border: '1px solid rgba(10,168,159,0.18)',
                  fontSize: 11.5, fontWeight: 700, color: '#0B1F3A',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div style={{ marginTop: 32, padding: '22px 26px', background: '#F0FAF7', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: '#0B1F3A', marginTop: 0, marginBottom: 10 }}>
          How calendar-aware booking works
        </h3>
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#4A6670', lineHeight: 1.7 }}>
          <li>Click <strong>Connect Calendar</strong> → pick your calendar provider → grant access (60 seconds total)</li>
          <li>Caller asks to schedule. The AI checks your calendar in real time</li>
          <li>AI offers 3 actual open slots — &quot;Tuesday 2 PM, Wednesday 9 AM, or Thursday 11 AM&quot;</li>
          <li>Caller picks one. You get an SMS — &quot;Sarah picked Tuesday 2 PM. Reply YES to confirm.&quot;</li>
          <li>You confirm via YES — auto-create event in your calendar arrives in Phase 2 (Q3 2026)</li>
        </ol>
        <p style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 12, marginBottom: 0, fontStyle: 'italic' }}>
          Privacy: we only read free/busy windows — never event titles, attendees, or notes. Disconnect anytime. Powered by Cronofy.
        </p>
      </div>
    </main>
  )
}

function FlashBanner({ kind, children }: { kind: 'success' | 'error'; children: React.ReactNode }) {
  const isSuccess = kind === 'success'
  return (
    <div style={{
      marginBottom: 20,
      padding: '14px 18px',
      borderRadius: 12,
      fontSize: 13,
      background: isSuccess ? '#F0FDF4' : '#FEF2F2',
      border: `1px solid ${isSuccess ? '#86EFAC' : '#FECACA'}`,
      color: isSuccess ? '#166534' : '#991B1B',
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  )
}
