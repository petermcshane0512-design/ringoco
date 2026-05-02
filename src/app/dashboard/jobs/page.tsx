'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState({ title: '', customer_name: '', customer_phone: '', address: '', job_type: '', scheduled_time: '', price: '' })

  useEffect(() => {
    fetchJobs()
  }, [])

  async function fetchJobs() {
    const { data } = await supabase.from('jobs').select('*').order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('jobs').insert({ ...form, user_id: 'manual', status: 'pending' })
    setShowForm(false)
    setForm({ title: '', customer_name: '', customer_phone: '', address: '', job_type: '', scheduled_time: '', price: '' })
    fetchJobs()
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('jobs').update({ status }).eq('id', id)
    fetchJobs()
  }

  const statusColor: Record<string, string> = {
    pending: '#2563EB', scheduled: '#2563EB',
    completed: '#22C55E', cancelled: '#EF4444',
  }

  const filtered = filter === 'all' ? jobs : jobs.filter(j => j.status === filter)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', margin: 0 }}>Jobs</h1>
          <p style={{ color: '#64748B', fontSize: 14, margin: '4px 0 0' }}>{jobs.length} total</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '10px 20px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          + New job
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'pending', 'completed', 'cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 16px', borderRadius: 8, border: filter === f ? '2px solid #2563EB' : '1.5px solid #E2E8F0', background: filter === f ? '#EFF6FF' : '#fff', color: filter === f ? '#2563EB' : '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      {/* New job form */}
      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 20 }}>Create job</h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {[
                { label: 'Job title', key: 'title', type: 'text', placeholder: 'AC repair, plumbing...' },
                { label: 'Job type', key: 'job_type', type: 'text', placeholder: 'HVAC, Plumbing...' },
                { label: 'Customer name', key: 'customer_name', type: 'text', placeholder: 'John Smith' },
                { label: 'Customer phone', key: 'customer_phone', type: 'text', placeholder: '+1 (555) 000-0000' },
                { label: 'Address', key: 'address', type: 'text', placeholder: '123 Main St, Chicago IL' },
                { label: 'Scheduled time', key: 'scheduled_time', type: 'text', placeholder: 'Tuesday 2pm' },
                { label: 'Price ($)', key: 'price', type: 'number', placeholder: '350' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.key === 'address' ? '1 / -1' : 'auto' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '9px 18px', border: '1.5px solid #E2E8F0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button type="submit" style={{ padding: '9px 20px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Create job</button>
            </div>
          </form>
        </div>
      )}

      {/* Jobs list */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading jobs...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📋</p>
            <p style={{ fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>No jobs yet</p>
            <p style={{ fontSize: 13, color: '#94A3B8' }}>Jobs booked by your AI receptionist will appear here automatically</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 24px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr', gap: 16 }}>
              {['Job', 'Customer', 'Scheduled', 'Price', 'Status'].map(h => (
                <span key={h} style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</span>
              ))}
            </div>
            {filtered.map((job, i) => (
              <div key={job.id} style={{ padding: '16px 24px', borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', margin: '0 0 2px' }}>{job.title || job.job_type || 'Job'}</p>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{job.address || ''}</p>
                </div>
                <div>
                  <p style={{ fontSize: 14, color: '#0F172A', margin: '0 0 2px', fontWeight: 500 }}>{job.customer_name || '—'}</p>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{job.customer_phone || ''}</p>
                </div>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{job.scheduled_time || '—'}</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: 0 }}>{job.price ? `$${job.price}` : '—'}</p>
                <select
                  value={job.status || 'pending'}
                  onChange={e => updateStatus(job.id, e.target.value)}
                  style={{ fontSize: 12, fontWeight: 600, color: statusColor[job.status] || '#64748B', background: (statusColor[job.status] || '#64748B') + '18', padding: '4px 8px', borderRadius: 20, border: 'none', cursor: 'pointer', outline: 'none' }}
                >
                  <option value="pending">Pending</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}