'use client'

import { useEffect, useState } from 'react'

type ThreadEntry = { from: 'customer' | 'peter'; body: string; at: string }
type Ticket = {
  id: string
  user_id: string
  business_name: string | null
  subject: string
  body: string
  category: string
  status: string
  priority: string
  ai_summary: string | null
  thread: ThreadEntry[]
  created_at: string
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 22px' }

const priorityColor: Record<string, string> = {
  urgent: '#DC2626', high: '#F59E0B', normal: '#0AA89F', low: '#94A3B8',
}
const statusColor: Record<string, string> = {
  new: '#2563EB', triaged: '#F59E0B', in_progress: '#7C3AED', resolved: '#16A34A', closed: '#94A3B8',
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyMap, setReplyMap] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  async function loadTickets() {
    const res = await fetch('/api/admin/support/list')
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'failed to load')
      setLoading(false)
      return
    }
    const data = await res.json()
    setTickets(data.tickets || [])
    setLoading(false)
  }
  useEffect(() => { loadTickets() }, [])

  async function update(id: string, opts: { status?: string; reply?: string }) {
    setUpdatingId(id)
    const res = await fetch('/api/admin/support/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...opts }),
    })
    if (res.ok) {
      setReplyMap(m => ({ ...m, [id]: '' }))
      await loadTickets()
    } else {
      const j = await res.json().catch(() => ({}))
      alert(`Update failed: ${j.error ?? 'unknown'}`)
    }
    setUpdatingId(null)
  }

  if (loading) return <div style={{ padding: 40, color: '#64748B' }}>Loading…</div>
  if (error) return <div style={{ padding: 40, color: '#DC2626' }}>{error}</div>

  const visible = filter === 'open'
    ? tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed')
    : tickets

  const grouped = {
    urgent: visible.filter(t => t.priority === 'urgent'),
    high: visible.filter(t => t.priority === 'high'),
    normal: visible.filter(t => t.priority === 'normal'),
    low: visible.filter(t => t.priority === 'low'),
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.6px' }}>Support Triage</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>{visible.length} {filter === 'open' ? 'open' : 'total'} tickets</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['open', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '8px 18px', borderRadius: 8, border: filter === f ? '2px solid #0AA89F' : '1.5px solid #E2E8F0', background: filter === f ? '#F0FDFA' : '#fff', color: filter === f ? '#0AA89F' : '#64748B', fontSize: 12, fontWeight: 800, cursor: 'pointer', textTransform: 'capitalize' }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {(['urgent', 'high', 'normal', 'low'] as const).map(p => {
        const rows = grouped[p]
        if (rows.length === 0) return null
        return (
          <div key={p} style={{ marginBottom: 26 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: priorityColor[p], letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
              {p} · {rows.length}
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              {rows.map(t => (
                <details key={t.id} style={card}>
                  <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A', margin: '0 0 3px' }}>{t.subject}</p>
                      <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                        {t.business_name ?? t.user_id.slice(0, 12)} · {t.category} · {new Date(t.created_at).toLocaleString()}
                      </p>
                      {t.ai_summary && <p style={{ fontSize: 12, color: '#0AA89F', margin: '4px 0 0', fontStyle: 'italic' }}>AI: {t.ai_summary}</p>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[t.status] ?? '#64748B', background: (statusColor[t.status] ?? '#64748B') + '20', padding: '4px 10px', borderRadius: 14, textTransform: 'capitalize' }}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </summary>

                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
                    {(t.thread ?? []).map((e, i) => (
                      <div key={i} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 8, background: e.from === 'peter' ? '#F0FDFA' : '#F8FAFC' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: e.from === 'peter' ? '#0AA89F' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                          {e.from === 'peter' ? '🛠 Peter' : '👤 Customer'} · {new Date(e.at).toLocaleString()}
                        </p>
                        <p style={{ fontSize: 13, color: '#0B1F3A', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>{e.body}</p>
                      </div>
                    ))}

                    <div style={{ marginTop: 12 }}>
                      <textarea
                        value={replyMap[t.id] ?? ''}
                        onChange={e => setReplyMap(m => ({ ...m, [t.id]: e.target.value }))}
                        placeholder="Reply to customer — they get an SMS with the first 240 chars + a link to the full thread"
                        rows={3}
                        style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['triaged', 'in_progress', 'resolved', 'closed'] as const).map(s => (
                            <button key={s} onClick={() => update(t.id, { status: s })} disabled={updatingId === t.id || t.status === s} style={{ padding: '6px 12px', border: '1px solid #E2E8F0', borderRadius: 6, background: '#fff', cursor: t.status === s ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'capitalize', opacity: t.status === s ? 0.4 : 1 }}>
                              {s.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                        <button onClick={() => update(t.id, { reply: replyMap[t.id], status: t.status === 'new' ? 'in_progress' : undefined })} disabled={updatingId === t.id || !replyMap[t.id]?.trim()} style={{ padding: '8px 18px', background: replyMap[t.id]?.trim() ? '#22C55E' : '#94A3B8', color: '#fff', border: 'none', borderRadius: 8, cursor: replyMap[t.id]?.trim() ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 800 }}>
                          {updatingId === t.id ? 'Sending…' : 'Reply + SMS →'}
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )
      })}

      {visible.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
          <p style={{ fontWeight: 700, color: '#0B1F3A', marginBottom: 4 }}>{filter === 'open' ? 'Zero open tickets' : 'No tickets yet'}</p>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>{filter === 'open' ? 'Inbox zero. Touch grass.' : 'New tickets will land here. You also get an SMS on every new one.'}</p>
        </div>
      )}
    </div>
  )
}
