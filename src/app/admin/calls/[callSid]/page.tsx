'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

/**
 * /admin/calls/[callSid]
 *
 * Single call detail page. Demo-line notifications deep-link here so
 * Peter taps the notification → lands directly on the call's summary +
 * transcript instead of bouncing to the homepage.
 *
 * Auth: requireAdmin via /api/admin/calls/[callSid].
 */

type CallDetail = {
  id: string
  user_id: string | null
  caller_phone: string | null
  caller_name: string | null
  job_type: string | null
  transcript: string | null
  summary: string | null
  booking_completed: boolean | null
  hangup_turn: number | null
  job_id: string | null
  created_at: string
  viewed_at: string | null
  viewed_count: number | null
  recording_url: string | null
}

export default function CallDetailPage() {
  const params = useParams<{ callSid: string }>()
  const callSid = params?.callSid as string | undefined
  const [call, setCall] = useState<CallDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!callSid) return
    fetch(`/api/admin/calls/${encodeURIComponent(callSid)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        setCall(j.call)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [callSid])

  if (loading) {
    return (
      <main style={shellStyle}>
        <div style={{ textAlign: 'center', padding: 60, color: '#7AAAB2' }}>Loading call…</div>
      </main>
    )
  }
  if (error || !call) {
    return (
      <main style={shellStyle}>
        <div style={{ padding: 20, background: '#FEE2E2', color: '#991B1B', borderRadius: 12 }}>
          {error || 'Call not found'}
        </div>
        <Link href="/admin/forward" style={backLink}>← Lead list</Link>
      </main>
    )
  }

  const transcriptLines = (call.transcript || '').split(/\n/).filter(Boolean)
  const created = new Date(call.created_at).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  return (
    <main style={shellStyle}>
      <Link href="/admin/forward" style={backLink}>← All leads</Link>

      <header style={{
        marginTop: 12,
        background: 'linear-gradient(135deg, #0B1F3A 0%, #0D8F87 100%)',
        color: '#fff',
        borderRadius: 18,
        padding: '22px 24px',
        marginBottom: 18,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.14em', marginBottom: 8 }}>
          📞 CALL DETAIL · {created}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
          {call.caller_name || call.caller_phone || 'Unknown caller'}
        </h1>
        {call.caller_phone && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', marginTop: 4 }}>
            <a href={`tel:${call.caller_phone}`} style={{ color: '#fff', textDecoration: 'underline' }}>
              {call.caller_phone}
            </a>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {call.booking_completed && <Pill bg="#22C55E">✓ Booked</Pill>}
          {call.job_type && <Pill bg="#0AA89F">{call.job_type}</Pill>}
          {call.hangup_turn != null && <Pill bg="#F59E0B">Hung up turn {call.hangup_turn}</Pill>}
        </div>
      </header>

      {call.summary && (
        <section style={card}>
          <h2 style={h2}>Summary</h2>
          <div style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.6 }}>{call.summary}</div>
        </section>
      )}

      {transcriptLines.length > 0 && (
        <section style={card}>
          <h2 style={h2}>Transcript</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {transcriptLines.map((line, i) => {
              const isUser = /^(user|caller|customer):/i.test(line)
              const isAI = /^(ai|emma|assistant|bot):/i.test(line)
              const text = line.replace(/^[a-z]+:\s*/i, '')
              return (
                <div
                  key={i}
                  style={{
                    alignSelf: isUser ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    background: isUser ? '#E5E7EB' : isAI ? '#0AA89F' : '#F5FDFB',
                    color: isUser ? '#0B1F3A' : isAI ? '#fff' : '#0B1F3A',
                    padding: '10px 14px',
                    borderRadius: 14,
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{
                    fontSize: 10,
                    fontWeight: 800,
                    opacity: 0.7,
                    letterSpacing: '0.08em',
                    marginBottom: 3,
                  }}>
                    {isUser ? 'CALLER' : isAI ? 'EMMA · AI' : ''}
                  </div>
                  {text}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {call.recording_url && (
        <section style={card}>
          <h2 style={h2}>Recording</h2>
          <audio controls src={call.recording_url} style={{ width: '100%' }} />
        </section>
      )}

      {call.viewed_count != null && call.viewed_count > 0 && (
        <div style={{ fontSize: 11, color: '#7AAAB2', textAlign: 'center', marginTop: 18 }}>
          Viewed {call.viewed_count} {call.viewed_count === 1 ? 'time' : 'times'}
        </div>
      )}
    </main>
  )
}

const Pill = ({ bg, children }: { bg: string; children: React.ReactNode }) => (
  <span style={{
    fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99,
    background: bg, color: '#fff',
  }}>
    {children}
  </span>
)

const shellStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '20px 16px 60px',
  fontFamily: "'Inter', system-ui, sans-serif",
  background: '#F5FCFA',
  minHeight: '100vh',
}

const backLink: React.CSSProperties = {
  fontSize: 12,
  color: '#0AA89F',
  fontWeight: 700,
  textDecoration: 'none',
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  padding: '18px 20px',
  marginBottom: 14,
  border: '1px solid rgba(10,168,159,0.14)',
  boxShadow: '0 4px 16px rgba(7,27,58,0.05)',
}

const h2: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: '#0AA89F',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  margin: '0 0 12px',
}
