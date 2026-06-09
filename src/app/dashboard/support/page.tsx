'use client'

import { useEffect, useState } from 'react'

type ThreadEntry = { from: 'customer' | 'peter'; body: string; at: string }
type Ticket = {
  id: string
  subject: string
  category: string
  status: string
  priority: string
  ai_summary: string | null
  thread: ThreadEntry[]
  created_at: string
  resolved_at: string | null
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '22px 26px' }

const statusColor: Record<string, string> = {
  new: '#2563EB', triaged: '#F59E0B', in_progress: '#7C3AED', resolved: '#16A34A', closed: '#94A3B8',
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ subject: '', body: '' })

  async function loadTickets() {
    const res = await fetch('/api/support/list').then(r => r.json()).catch(() => ({ tickets: [] }))
    setTickets(res.tickets || [])
    setLoading(false)
  }
  useEffect(() => { loadTickets() }, [])

  async function submit() {
    if (!form.subject.trim() || !form.body.trim()) return
    setSubmitting(true)
    const res = await fetch('/api/support/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ subject: '', body: '' })
      setShowForm(false)
      await loadTickets()
    } else {
      const j = await res.json().catch(() => ({}))
      alert(`Submit failed: ${j.error ?? 'unknown'}`)
    }
    setSubmitting(false)
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.5px' }}>Support</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>Direct line to the team. Responses within 24 hours (4 hours on Elite).</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '11px 22px', background: 'linear-gradient(135deg, #0AA89F, #0D8F87)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
          {showForm ? 'Cancel' : '+ New ticket'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A', display: 'block', marginBottom: 6 }}>Subject</label>
          <input
            value={form.subject}
            onChange={e => setForm({ ...form, subject: e.target.value })}
            placeholder="Short title"
            maxLength={200}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
          <div style={{ height: 12 }} />
          <label style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A', display: 'block', marginBottom: 6 }}>What's going on?</label>
          <textarea
            value={form.body}
            onChange={e => setForm({ ...form, body: e.target.value })}
            placeholder="Describe the issue in your own words. We'll route it to the right person."
            maxLength={8000}
            rows={6}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button onClick={submit} disabled={submitting} style={{ padding: '11px 24px', background: submitting ? '#94A3B8' : '#22C55E', color: '#fff', border: 'none', borderRadius: 10, cursor: submitting ? 'wait' : 'pointer', fontWeight: 800, fontSize: 13 }}>
              {submitting ? 'Submitting…' : 'Send to team →'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#64748B' }}>Loading…</p>
      ) : tickets.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>💬</p>
          <p style={{ fontWeight: 700, color: '#0B1F3A', marginBottom: 4 }}>No tickets yet</p>
          <p style={{ fontSize: 13, color: '#94A3B8' }}>Hit "+ New ticket" if anything comes up. We see every ticket on our phones.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {tickets.map(t => (
            <details key={t.id} style={{ ...card, padding: '14px 18px' }}>
              <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</p>
                  <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                    {new Date(t.created_at).toLocaleDateString()} · {t.category}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusColor[t.status] ?? '#64748B', background: (statusColor[t.status] ?? '#64748B') + '20', padding: '4px 10px', borderRadius: 14, textTransform: 'capitalize' }}>
                  {t.status.replace('_', ' ')}
                </span>
              </summary>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
                {(t.thread ?? []).map((e, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < t.thread.length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: e.from === 'peter' ? '#0AA89F' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                      {e.from === 'peter' ? '🛠 Team' : 'You'} · {new Date(e.at).toLocaleString()}
                    </p>
                    <p style={{ fontSize: 13, color: '#0B1F3A', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.55 }}>{e.body}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}
