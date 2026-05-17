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

type Provider = {
  key: string
  name: string
  tagline: string
  status: 'live' | 'soon'
  iconBg: string
  iconText: string
  iconColor?: string
  popularity?: string
}

const PROVIDERS: Provider[] = [
  { key: 'google',        name: 'Google Calendar',    tagline: 'Most popular — 60% of contractors use this',     status: 'live', iconBg: '#fff',     iconText: 'G', iconColor: '#4285F4', popularity: 'Most popular' },
  { key: 'microsoft',     name: 'Microsoft Outlook',  tagline: 'Microsoft 365 / Outlook.com — work + personal',  status: 'live', iconBg: '#0078D4', iconText: 'O' },
  { key: 'calendly',      name: 'Calendly',           tagline: 'Sales + intake call scheduling',                 status: 'live', iconBg: '#006BFF', iconText: 'C' },
  { key: 'apple',         name: 'Apple iCloud',       tagline: 'iCloud Calendar (iPhone, Mac)',                  status: 'soon', iconBg: '#000',     iconText: '' },
  { key: 'housecallpro',  name: 'Housecall Pro',      tagline: 'Top home-services SaaS — plumbing, HVAC',        status: 'soon', iconBg: '#FF6B35', iconText: 'H' },
  { key: 'jobber',        name: 'Jobber',             tagline: 'Landscaping, cleaning, handyman',                status: 'soon', iconBg: '#10B981', iconText: 'J' },
  { key: 'servicetitan',  name: 'ServiceTitan',       tagline: 'Enterprise HVAC + plumbing',                     status: 'soon', iconBg: '#E11D48', iconText: 'S' },
  { key: 'workiz',        name: 'Workiz',             tagline: 'Cleaning, handyman, locksmith',                  status: 'soon', iconBg: '#7C3AED', iconText: 'W' },
  { key: 'fieldedge',     name: 'FieldEdge',          tagline: 'HVAC-specific, popular in the South',            status: 'soon', iconBg: '#0EA5E9', iconText: 'F' },
  { key: 'acuity',        name: 'Acuity Scheduling',  tagline: 'Squarespace appointment booking',                status: 'soon', iconBg: '#222',     iconText: 'A' },
]

// Maps a live provider key to its OAuth start URL.
const CONNECT_URLS: Record<string, string> = {
  google:    '/api/calendar/google/connect',
  microsoft: '/api/calendar/microsoft/connect',
  calendly:  '/api/calendar/calendly/connect',
}

function CalendarPageInner() {
  const params = useSearchParams()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [voting, setVoting] = useState<string | null>(null)
  const flashStatus = params.get('calendar')
  const flashProvider = params.get('provider')
  const flashReason = params.get('reason')
  const flashAccount = params.get('account')

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

  function isConnected(provider: string): Connection | undefined {
    return connections.find((c) => c.provider === provider && c.enabled)
  }

  async function disconnect(provider: string) {
    if (!confirm(`Disconnect ${provider}? The AI will stop offering specific slots from this calendar.`)) return
    setDisconnecting(provider)
    try {
      await fetch('/api/calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      await refresh()
    } finally { setDisconnecting(null) }
  }

  async function voteForProvider(providerKey: string, providerName: string) {
    setVoting(providerKey)
    try {
      // Reuse the waitlist endpoint as a generic interest signal —
      // tier_interested is repurposed to "calendar:<provider>" so it lands in
      // the same Twilio alert to Peter as Concierge waitlist signups.
      await fetch('/api/waitlist/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'calendar-vote@bellavego.internal',
          notes: `Voted for ${providerName} calendar integration`,
          tier_interested: 'concierge',  // route through existing waitlist table
        }),
      })
      alert(`Got it — we'll notify you when ${providerName} integration ships. Vote logged.`)
    } catch { alert('Vote failed — try again.') }
    finally { setVoting(null) }
  }

  return (
    <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>
        ← Back to dashboard
      </Link>

      <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.04em', marginTop: 14, marginBottom: 8 }}>
        Connect a calendar.
      </h1>
      <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.55, maxWidth: 680, marginBottom: 24 }}>
        Give the AI receptionist access to your real-time availability and it'll <strong>offer specific time slots</strong> during the call — "Mike has Tuesday at 2 PM or Wednesday at 9 AM, which works?" — instead of just taking a message. You still confirm every booking via SMS.
      </p>

      {/* Flash banners from OAuth callback */}
      {flashStatus === 'connected' && (
        <FlashBanner kind="success">
          ✅ {flashProvider === 'google' ? 'Google Calendar' : 'Calendar'} connected{flashAccount ? ` (${flashAccount})` : ''}. The AI will start offering specific slots on the next inbound call.
        </FlashBanner>
      )}
      {flashStatus === 'error' && (
        <FlashBanner kind="error">
          Couldn't connect calendar. {flashReason ? <em>Reason: {flashReason}</em> : null} Try again, or text our team at 773-710-9565.
        </FlashBanner>
      )}

      {/* The 10 provider list */}
      <div style={{ display: 'grid', gap: 10 }}>
        {PROVIDERS.map((p) => {
          const conn = isConnected(p.key)
          const isLive = p.status === 'live'
          return (
            <div key={p.key} style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr auto',
              alignItems: 'center',
              gap: 14,
              padding: '16px 18px',
              background: '#fff',
              border: conn ? '1.5px solid #22C55E' : '1px solid rgba(10,168,159,0.16)',
              borderRadius: 14,
              boxShadow: '0 2px 12px rgba(7,27,58,0.04)',
            }}>
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: p.iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 18,
                color: p.iconColor || '#fff',
                border: p.iconBg === '#fff' ? '1px solid #E2E8F0' : 'none',
              }}>
                {p.iconText || (p.key === 'apple' ? '' : p.name[0])}
              </div>

              {/* Name + tagline */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A' }}>{p.name}</span>
                  {p.popularity && !conn && (
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#C84B26', background: 'rgba(232,116,43,0.10)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {p.popularity}
                    </span>
                  )}
                  {conn && (
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#16A34A', background: 'rgba(34,197,94,0.10)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      Connected
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#7AAAB2', lineHeight: 1.45 }}>
                  {conn ? (conn.email || 'Connected') : p.tagline}
                </div>
              </div>

              {/* Action button */}
              <div>
                {conn ? (
                  <button
                    onClick={() => disconnect(p.key)}
                    disabled={disconnecting === p.key}
                    style={{
                      padding: '9px 16px', borderRadius: 9,
                      background: '#FEF2F2', color: '#991B1B',
                      border: '1px solid #FECACA',
                      fontSize: 12, fontWeight: 800, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {disconnecting === p.key ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                ) : isLive ? (
                  <a
                    href={CONNECT_URLS[p.key] || '#'}
                    style={{
                      display: 'inline-block',
                      padding: '10px 18px', borderRadius: 9,
                      background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)',
                      color: '#fff', fontSize: 12, fontWeight: 800,
                      textDecoration: 'none',
                      boxShadow: '0 4px 12px rgba(10,168,159,0.28)',
                    }}
                  >
                    Connect →
                  </a>
                ) : (
                  <button
                    onClick={() => voteForProvider(p.key, p.name)}
                    disabled={voting === p.key || loading}
                    style={{
                      padding: '9px 14px', borderRadius: 9,
                      background: 'rgba(10,168,159,0.08)',
                      color: '#0D8F87', border: '1px solid rgba(10,168,159,0.22)',
                      fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {voting === p.key ? 'Voting…' : 'Coming soon · Vote'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* How it works */}
      <div style={{ marginTop: 32, padding: '22px 26px', background: '#F0FAF7', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 900, color: '#0B1F3A', marginTop: 0, marginBottom: 10 }}>
          How calendar-aware booking works
        </h3>
        <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: '#4A6670', lineHeight: 1.7 }}>
          <li>Connect a calendar (this page). Takes 30 seconds.</li>
          <li>Caller asks to schedule. The AI calls a real-time check against your calendar.</li>
          <li>AI offers 3 actual open slots — "Tuesday 2 PM, Wednesday 9 AM, or Thursday 11 AM."</li>
          <li>Caller picks one. You get an SMS — "Sarah picked Tuesday 2 PM. Reply YES to lock in."</li>
          <li>You confirm via YES/NO. We don't auto-create the event yet — that's coming in Phase 2 (Q3 2026).</li>
        </ol>
        <p style={{ fontSize: 11.5, color: '#7AAAB2', marginTop: 12, marginBottom: 0, fontStyle: 'italic' }}>
          Privacy: we only read free/busy windows — never event titles, attendees, or notes. Disconnect anytime.
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
