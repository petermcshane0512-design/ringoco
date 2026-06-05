'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

/**
 * /admin/ig-creators
 *
 * Manual IG creator outreach tracker. NO scraping (per CLAUDE.md).
 * Peter saves accounts → DMs them → logs replies → tracks who becomes
 * active creators driving paid referrals.
 *
 * Workflow:
 *   1. Add creator (handle, follower count, trade, source hashtag)
 *   2. Click "Mark DM'd" after sending the cold DM
 *   3. Click "Replied YES" or "Replied NO" when they answer
 *   4. Click "Active" when they actually start posting + using free trial
 *   5. Log paid referrals as they convert
 *   6. Click "Bonus Hit" when 5+ paid referrals to mark commission owed
 */

type Creator = {
  id: string
  handle: string
  followers: number | null
  trade: string | null
  hashtag_source: string | null
  notes: string | null
  status: string
  dmed_at: string | null
  replied_at: string | null
  reply_summary: string | null
  free_trial_code: string | null
  free_trial_started_at: string | null
  first_post_at: string | null
  posts_count: number | null
  paid_referrals_count: number | null
  bonus_paid_at: string | null
  total_commission_paid_cents: number | null
  created_at: string
  updated_at: string
}

type Stats = {
  total: number
  by_status: Record<string, number>
  dmed_this_week: number
  replies_this_week: number
}

const STATUS_LABELS: Record<string, { label: string; emoji: string; bg: string }> = {
  saved: { label: 'Saved', emoji: '📌', bg: '#94a3b8' },
  dmed: { label: "DM'd", emoji: '✉️', bg: '#0AA89F' },
  replied_yes: { label: 'YES', emoji: '🔥', bg: '#22C55E' },
  replied_no: { label: 'NO', emoji: '✋', bg: '#DC2626' },
  active_creator: { label: 'Active', emoji: '🚀', bg: '#F59E0B' },
  paid_bonus_hit: { label: 'BONUS', emoji: '💰', bg: '#7C3AED' },
  dropped: { label: 'Dropped', emoji: '🗑️', bg: '#6b7280' },
}

const STATUS_ORDER = ['saved', 'dmed', 'replied_yes', 'replied_no', 'active_creator', 'paid_bonus_hit', 'dropped']

export default function IGCreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [newHandle, setNewHandle] = useState('')
  const [newFollowers, setNewFollowers] = useState('')
  const [newTrade, setNewTrade] = useState('HVAC')
  const [newHashtag, setNewHashtag] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = filter === 'all' ? '/api/admin/ig-creators' : `/api/admin/ig-creators?status=${filter}`
      const r = await fetch(url, { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) {
        setCreators(j.creators || [])
        setStats(j.stats || null)
      }
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function addCreator(e: React.FormEvent) {
    e.preventDefault()
    if (!newHandle.trim()) return
    const r = await fetch('/api/admin/ig-creators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: newHandle.trim().replace(/^@/, ''),
        followers: newFollowers ? parseInt(newFollowers, 10) : null,
        trade: newTrade,
        hashtag_source: newHashtag || null,
        notes: newNotes || null,
      }),
    })
    if (r.ok) {
      setNewHandle(''); setNewFollowers(''); setNewHashtag(''); setNewNotes('')
      setShowAdd(false)
      load()
    } else {
      const j = await r.json().catch(() => ({}))
      alert('Failed: ' + (j.error || r.status))
    }
  }

  async function updateStatus(id: string, status: string) {
    const r = await fetch(`/api/admin/ig-creators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (r.ok) load()
  }

  async function bumpReferrals(id: string, delta: number) {
    const current = creators.find((c) => c.id === id)
    if (!current) return
    const next = Math.max(0, (current.paid_referrals_count ?? 0) + delta)
    const r = await fetch(`/api/admin/ig-creators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paid_referrals_count: next,
        ...(next >= 5 && current.status === 'active_creator' ? { status: 'paid_bonus_hit' } : {}),
      }),
    })
    if (r.ok) load()
  }

  function rel(iso: string | null): string {
    if (!iso) return ''
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 60) return `${m}m`
    if (m < 1440) return `${Math.floor(m / 60)}h`
    return `${Math.floor(m / 1440)}d`
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 80px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Link href="/dashboard" style={{ fontSize: 12, color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>← Dashboard</Link>

      <header style={{ marginTop: 14, marginBottom: 22 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.025em', color: '#0B1F3A', margin: 0 }}>
          📲 IG Creator Outreach
        </h1>
        <p style={{ fontSize: 14, color: '#4A6670', margin: '6px 0 0' }}>
          Manual DM tracker. Goal: 30 DMs/day → 6 replies → 2 yes → 1 active creator → 5 paid referrals.
        </p>
      </header>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <StatCard label="Total tracked" value={stats.total} />
          <StatCard label="DMs this week" value={stats.dmed_this_week} accent="#0AA89F" />
          <StatCard label="Replies this week" value={stats.replies_this_week} accent="#22C55E" />
          <StatCard label="Active creators" value={stats.by_status.active_creator || 0} accent="#F59E0B" />
          <StatCard label="Bonus hits" value={stats.by_status.paid_bonus_hit || 0} accent="#7C3AED" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
        {STATUS_ORDER.map((s) => (
          <FilterPill
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            label={`${STATUS_LABELS[s].emoji} ${STATUS_LABELS[s].label}`}
          />
        ))}
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, background: '#0AA89F', color: '#fff', fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer' }}>
          + Add creator
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addCreator} style={{ background: '#F5FDFB', padding: 18, borderRadius: 14, border: '1px solid rgba(10,168,159,0.2)', marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>
            <input value={newHandle} onChange={e => setNewHandle(e.target.value)} placeholder="@handle" required style={inputStyle} />
            <input value={newFollowers} onChange={e => setNewFollowers(e.target.value)} placeholder="followers (e.g. 3500)" type="number" style={inputStyle} />
            <select value={newTrade} onChange={e => setNewTrade(e.target.value)} style={inputStyle}>
              <option>HVAC</option><option>Plumbing</option><option>Electrical</option>
              <option>Roofing</option><option>Handyman</option><option>Pool</option>
              <option>Landscaping</option><option>Pest Control</option>
            </select>
            <input value={newHashtag} onChange={e => setNewHashtag(e.target.value)} placeholder="#hashtag found via" style={inputStyle} />
          </div>
          <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="notes (optional: vibe, content style, etc)" style={{ ...inputStyle, width: '100%', marginBottom: 10 }} />
          <button type="submit" style={{ padding: '10px 20px', background: '#0AA89F', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>Save creator</button>
        </form>
      )}

      {loading ? <div style={{ padding: 60, textAlign: 'center', color: '#7AAAB2' }}>Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {creators.length === 0 && (
            <div style={{ padding: 50, textAlign: 'center', background: '#fff', borderRadius: 14, color: '#7AAAB2' }}>
              No creators yet. Click + Add creator above.
            </div>
          )}
          {creators.map((c) => {
            const s = STATUS_LABELS[c.status] || STATUS_LABELS.saved
            return (
              <div key={c.id} style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(10,168,159,0.14)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <a href={`https://instagram.com/${c.handle}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 16, fontWeight: 800, color: '#0B1F3A', textDecoration: 'none' }}>
                      @{c.handle}
                    </a>
                    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: s.bg, color: '#fff', fontWeight: 800 }}>{s.emoji} {s.label}</span>
                    {c.followers != null && <span style={{ fontSize: 11, color: '#7AAAB2' }}>· {c.followers.toLocaleString()} followers</span>}
                    {c.trade && <span style={{ fontSize: 11, color: '#0AA89F', fontWeight: 700 }}>· {c.trade}</span>}
                    {c.hashtag_source && <span style={{ fontSize: 10, color: '#94a3b8' }}>· via {c.hashtag_source}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#7AAAB2' }}>
                    {c.dmed_at && <span>DM'd {rel(c.dmed_at)} ago</span>}
                    {c.replied_at && <span> · replied {rel(c.replied_at)} ago</span>}
                    {(c.paid_referrals_count ?? 0) > 0 && (
                      <span style={{ color: '#7C3AED', fontWeight: 700 }}> · {c.paid_referrals_count} paid referral{c.paid_referrals_count === 1 ? '' : 's'}</span>
                    )}
                    {c.free_trial_code && <span> · code <code style={{ background: '#F5FDFB', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>{c.free_trial_code}</code></span>}
                  </div>
                  {c.notes && <div style={{ fontSize: 11, color: '#4A6670', marginTop: 4, fontStyle: 'italic' }}>"{c.notes.slice(0, 100)}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {c.status === 'saved' && <ActionBtn onClick={() => updateStatus(c.id, 'dmed')} bg="#0AA89F">✉️ Mark DM'd</ActionBtn>}
                  {c.status === 'dmed' && <>
                    <ActionBtn onClick={() => updateStatus(c.id, 'replied_yes')} bg="#22C55E">🔥 YES</ActionBtn>
                    <ActionBtn onClick={() => updateStatus(c.id, 'replied_no')} bg="#DC2626">✋ NO</ActionBtn>
                  </>}
                  {c.status === 'replied_yes' && <ActionBtn onClick={() => updateStatus(c.id, 'active_creator')} bg="#F59E0B">🚀 Active</ActionBtn>}
                  {c.status === 'active_creator' && <>
                    <ActionBtn onClick={() => bumpReferrals(c.id, 1)} bg="#7C3AED">+1 paid ref</ActionBtn>
                    <ActionBtn onClick={() => bumpReferrals(c.id, -1)} bg="#94a3b8">−1</ActionBtn>
                  </>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(10,168,159,0.2)',
  fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

function StatCard({ label, value, accent = '#0B1F3A' }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(10,168,159,0.14)' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 12px', borderRadius: 99,
      background: active ? '#0AA89F' : '#fff',
      color: active ? '#fff' : '#4A6670',
      border: active ? 'none' : '1px solid rgba(10,168,159,0.2)',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
    }}>{label}</button>
  )
}

function ActionBtn({ children, onClick, bg }: { children: React.ReactNode; onClick: () => void; bg: string }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 12px', borderRadius: 8, background: bg, color: '#fff',
      fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer',
    }}>{children}</button>
  )
}
