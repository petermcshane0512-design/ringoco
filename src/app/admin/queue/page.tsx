'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type PromptRow = {
  id: string
  profile_id: string
  business_name: string | null
  suggestion: string
  based_on_call_count: number | null
  created_at: string
}
type ReviewRow = {
  id: string
  user_id: string
  business_name: string | null
  review_author: string | null
  review_text: string | null
  review_rating: number | null
  drafted_reply: string
  created_at: string
}
type ProvFail = {
  id: string
  user_id: string
  business_name: string | null
  owner_phone: string | null
  last_error: string
  attempts: number
  status: 'pending' | 'manual_review'
  next_retry_at: string
  created_at: string
}

type Queue = { prompts: PromptRow[]; reviews: ReviewRow[]; provisioning_failures: ProvFail[] }

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid rgba(10,168,159,0.14)', borderRadius: 14,
  padding: 20, boxShadow: '0 2px 14px rgba(7,27,58,0.06)', marginBottom: 16,
}
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }
const badge = (n: number, color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
  background: color, color: '#fff',
})
const btn: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 8, border: 'none',
  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

export default function AdminQueuePage() {
  const [data, setData] = useState<Queue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [editedReplies, setEditedReplies] = useState<Record<string, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/queue').then((r) => r.json())
      if (!r.ok) throw new Error(r.error || 'load failed')
      setData(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function act(kind: 'prompt' | 'review' | 'provisioning', id: string, action: string, payload?: unknown) {
    setActingId(`${kind}-${id}-${action}`)
    try {
      const res = await fetch('/api/admin/queue/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, action, payload }),
      })
      const j = await res.json()
      if (!j.ok) {
        alert(`Action failed: ${j.error || 'unknown'}`)
        return
      }
      await load()
    } finally {
      setActingId(null)
    }
  }

  if (loading) return <div style={pageStyle}>Loading queue…</div>
  if (error) return <div style={pageStyle}>Error: {error}</div>
  if (!data) return null

  const totalPending = data.prompts.length + data.reviews.length + data.provisioning_failures.length

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 60px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.04em' }}>
              Admin Queue {totalPending > 0 && <span style={{ ...badge(totalPending, '#22C55E'), marginLeft: 8 }}>{totalPending} pending</span>}
            </div>
            <div style={{ fontSize: 13, color: '#7AAAB2', marginTop: 4 }}>
              Single weekly sweep — every item Peter needs to act on, in one place.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin/customers" style={{ ...btn, background: '#fff', color: '#0AA89F', border: '1px solid rgba(10,168,159,0.25)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Customers →</Link>
            <Link href="/admin/support" style={{ ...btn, background: '#fff', color: '#0AA89F', border: '1px solid rgba(10,168,159,0.25)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Support →</Link>
          </div>
        </div>

        {/* Provisioning failures — highest priority */}
        <div style={card}>
          <div style={h2}>
            🚨 Provisioning failures
            <span style={badge(data.provisioning_failures.length, data.provisioning_failures.length > 0 ? '#DC2626' : '#7AAAB2')}>
              {data.provisioning_failures.length}
            </span>
          </div>
          {data.provisioning_failures.length === 0 ? (
            <div style={{ fontSize: 13, color: '#7AAAB2' }}>None — all paying customers have a provisioned number. ✓</div>
          ) : data.provisioning_failures.map((f) => (
            <div key={f.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(10,168,159,0.08)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A' }}>
                {f.business_name || f.user_id}
                <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: '#DC2626', textTransform: 'uppercase' }}>
                  {f.status === 'manual_review' ? `${f.attempts} attempts — manual` : `attempt ${f.attempts}, next retry ${new Date(f.next_retry_at).toLocaleString()}`}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#4A6670', marginTop: 4 }}>📞 {f.owner_phone || '—'}</div>
              <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>{f.last_error}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button
                  onClick={() => act('provisioning', f.id, 'retry')}
                  disabled={actingId === `provisioning-${f.id}-retry`}
                  style={{ ...btn, background: '#22C55E', color: '#fff' }}
                >
                  {actingId === `provisioning-${f.id}-retry` ? 'Retrying…' : 'Retry now'}
                </button>
                <button
                  onClick={() => act('provisioning', f.id, 'dismiss')}
                  disabled={!!actingId}
                  style={{ ...btn, background: '#fff', color: '#7AAAB2', border: '1px solid #DCE9E2' }}
                >
                  Mark resolved
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Review drafts */}
        <div style={card}>
          <div style={h2}>
            ⭐ Review reply drafts
            <span style={badge(data.reviews.length, data.reviews.length > 0 ? '#0AA89F' : '#7AAAB2')}>
              {data.reviews.length}
            </span>
          </div>
          {data.reviews.length === 0 ? (
            <div style={{ fontSize: 13, color: '#7AAAB2' }}>No drafted replies awaiting approval.</div>
          ) : data.reviews.map((r) => {
            const edited = editedReplies[r.id] ?? r.drafted_reply
            return (
              <div key={r.id} style={{ padding: '14px 0', borderTop: '1px solid rgba(10,168,159,0.08)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A' }}>
                  {r.business_name || r.user_id} — {'★'.repeat(r.review_rating || 0)} from {r.review_author || 'anonymous'}
                </div>
                {r.review_text && (
                  <div style={{ fontSize: 12, color: '#4A6670', marginTop: 6, fontStyle: 'italic', padding: '8px 12px', background: '#F5FDFB', borderRadius: 8, borderLeft: '3px solid #DCE9E2' }}>
                    &ldquo;{r.review_text}&rdquo;
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10, marginBottom: 4 }}>Drafted reply (editable)</div>
                <textarea
                  value={edited}
                  onChange={(e) => setEditedReplies((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid rgba(10,168,159,0.22)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => act('review', r.id, 'approve', { editedReply: edited })}
                    disabled={!!actingId}
                    style={{ ...btn, background: '#22C55E', color: '#fff' }}
                  >
                    Approve & SMS to contractor
                  </button>
                  <button
                    onClick={() => act('review', r.id, 'dismiss')}
                    disabled={!!actingId}
                    style={{ ...btn, background: '#fff', color: '#7AAAB2', border: '1px solid #DCE9E2' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Prompt suggestions */}
        <div style={card}>
          <div style={h2}>
            💡 AI prompt suggestions
            <span style={badge(data.prompts.length, data.prompts.length > 0 ? '#0AA89F' : '#7AAAB2')}>
              {data.prompts.length}
            </span>
          </div>
          {data.prompts.length === 0 ? (
            <div style={{ fontSize: 13, color: '#7AAAB2' }}>No new prompt suggestions.</div>
          ) : data.prompts.map((p) => (
            <div key={p.id} style={{ padding: '12px 0', borderTop: '1px solid rgba(10,168,159,0.08)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0B1F3A' }}>
                {p.business_name || p.profile_id}
                {p.based_on_call_count != null && (
                  <span style={{ marginLeft: 10, fontSize: 11, color: '#7AAAB2', fontWeight: 500 }}>
                    based on {p.based_on_call_count} calls
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#0B1F3A', marginTop: 8, padding: '10px 14px', background: '#F5FDFB', borderRadius: 8, lineHeight: 1.55 }}>
                {p.suggestion}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  onClick={() => act('prompt', p.id, 'apply')}
                  disabled={!!actingId}
                  style={{ ...btn, background: '#22C55E', color: '#fff' }}
                >
                  Apply to profile
                </button>
                <button
                  onClick={() => act('prompt', p.id, 'dismiss')}
                  disabled={!!actingId}
                  style={{ ...btn, background: '#fff', color: '#7AAAB2', border: '1px solid #DCE9E2' }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  background: 'linear-gradient(180deg, #F0F7F5 0%, #F5FCFA 100%)',
  color: '#0B1F3A',
  minHeight: '100vh',
}
