'use client'
import { useEffect, useState } from 'react'

/**
 * /admin/forward — mobile-optimized lead forwarding page for Peter's iPhone.
 *
 * Purpose: during the A2P 10DLC registration window (carriers block our
 * automated SMS for 1-3 weeks), Peter manually forwards lead alerts to
 * contractors using his personal iMessage. This page surfaces each new
 * call as a single tap target: tap → iMessage opens pre-filled with the
 * contractor's phone + a formatted message → Peter taps Send → done.
 *
 * Auto-refreshes every 10 seconds.
 *
 * Auth: server-side via /api/admin/leads which checks the Clerk session
 * email against an allowlist. This page just renders what that endpoint
 * returns. Non-admins see a "no leads" empty state.
 */

type Lead = {
  id: string
  created_at: string
  contractor: { business_name: string; owner_first_name: string; owner_phone: string | null }
  caller: { name: string; phone: string | null }
  message: string
  status: string
}

export default function ForwardPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forwarded, setForwarded] = useState<Set<string>>(new Set())

  async function fetchLeads() {
    try {
      const r = await fetch('/api/admin/leads?hours=48', { cache: 'no-store' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.error || `HTTP ${r.status}`)
        return
      }
      const j = await r.json()
      setLeads(j.leads || [])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 10_000)
    return () => clearInterval(interval)
  }, [])

  function buildSmsLink(lead: Lead): string | null {
    if (!lead.contractor.owner_phone) return null
    const callerPhone = lead.caller.phone || 'no phone captured'
    const body =
      `🚨 BellAveGo lead — ${lead.caller.name} just called\n` +
      `📞 ${callerPhone}\n` +
      `💬 ${lead.message}\n\n` +
      `Call back ASAP.`
    return `sms:${lead.contractor.owner_phone}?body=${encodeURIComponent(body)}`
  }

  function markForwarded(id: string) {
    setForwarded((s) => new Set(s).add(id))
  }

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <main style={{ minHeight: '100vh', background: '#FFF8F0', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif', color: '#0B1F3A' }}>
      <header style={{ position: 'sticky', top: 0, background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)', color: '#fff', padding: '16px 18px', boxShadow: '0 4px 18px rgba(232,116,43,0.28)', zIndex: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.9 }}>BellAveGo</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.4px', margin: '4px 0 0' }}>📱 Lead Forward Inbox</h1>
        <div style={{ fontSize: 11, opacity: 0.86, marginTop: 4 }}>
          {loading ? 'Loading…' : `${leads.length} lead${leads.length === 1 ? '' : 's'} in last 48 hr · auto-refresh 10s`}
        </div>
      </header>

      <div style={{ padding: '16px 14px 80px', maxWidth: 480, margin: '0 auto' }}>
        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {!loading && leads.length === 0 && !error && (
          <div style={{ background: '#fff', border: '1px solid rgba(232,116,43,0.18)', borderRadius: 14, padding: '30px 20px', textAlign: 'center', boxShadow: '0 4px 18px rgba(11,31,58,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A', marginBottom: 6 }}>No leads in the last 48 hours</div>
            <div style={{ fontSize: 12, color: '#7AAAB2', lineHeight: 1.5 }}>New AI receptionist calls will appear here automatically. Page auto-refreshes every 10 seconds.</div>
          </div>
        )}

        {leads.map((lead) => {
          const smsLink = buildSmsLink(lead)
          const wasForwarded = forwarded.has(lead.id)
          return (
            <div key={lead.id} style={{
              background: '#fff',
              border: wasForwarded ? '1px solid rgba(34,197,94,0.32)' : '1px solid rgba(232,116,43,0.18)',
              borderRadius: 14,
              padding: '16px 16px 14px',
              marginBottom: 12,
              boxShadow: '0 4px 14px rgba(11,31,58,0.06)',
              opacity: wasForwarded ? 0.72 : 1,
              transition: 'all 0.2s ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#C84B26', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                    For {lead.contractor.business_name}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.3px' }}>
                    {lead.caller.name}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#7AAAB2', fontWeight: 600, whiteSpace: 'nowrap', paddingTop: 4 }}>
                  {timeAgo(lead.created_at)}
                </div>
              </div>

              <div style={{ fontSize: 13, color: '#3D5A62', lineHeight: 1.5, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(232,116,43,0.10)' }}>
                {lead.message}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, marginBottom: 14 }}>
                <div>
                  <div style={{ color: '#7AAAB2', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Caller phone</div>
                  <a href={`tel:${lead.caller.phone || ''}`} style={{ color: '#0AA89F', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>{lead.caller.phone || '(none)'}</a>
                </div>
                <div>
                  <div style={{ color: '#7AAAB2', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Forward to</div>
                  <a href={`tel:${lead.contractor.owner_phone || ''}`} style={{ color: '#0AA89F', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>{lead.contractor.owner_phone || '(none)'}</a>
                </div>
              </div>

              {smsLink ? (
                <a
                  href={smsLink}
                  onClick={() => markForwarded(lead.id)}
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '14px',
                    borderRadius: 12,
                    background: wasForwarded ? '#22C55E' : 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: 14,
                    textDecoration: 'none',
                    boxShadow: wasForwarded ? '0 4px 16px rgba(34,197,94,0.32)' : '0 6px 22px rgba(232,116,43,0.36)',
                    letterSpacing: '0.02em',
                  }}
                >
                  {wasForwarded ? '✓ Sent — tap to resend' : `📱 Text ${lead.contractor.owner_first_name} now`}
                </a>
              ) : (
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E', textAlign: 'center' }}>
                  ⚠ No contractor phone on file
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
