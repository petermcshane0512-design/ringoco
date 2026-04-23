'use client'
import { useState } from 'react'

export default function JobsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', customer: '', scheduled_at: '', price: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const newJob = { ...form, id: Date.now().toString(), status: 'scheduled', created_at: new Date().toISOString() }
    setJobs([newJob, ...jobs])
    setShowForm(false)
    setForm({ title: '', customer: '', scheduled_at: '', price: '' })
  }

  const statusColor: Record<string, string> = {
    scheduled: '#3b82f6',
    in_progress: '#f59e0b',
    completed: '#16a34a',
    cancelled: '#ef4444',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Jobs</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0' }}>{jobs.length} total</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '10px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          + New job
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Create job</h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'Job title *', key: 'title', type: 'text', placeholder: 'AC repair, heating tune-up...' },
              { label: 'Customer name *', key: 'customer', type: 'text', placeholder: 'John Smith' },
              { label: 'Scheduled date/time *', key: 'scheduled_at', type: 'datetime-local', placeholder: '' },
              { label: 'Price ($)', key: 'price', type: 'number', placeholder: '350' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 13, color: '#64748b', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} placeholder={f.placeholder}
                  value={form[f.key as keyof typeof form]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 20px', background: '#000', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Create job</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {jobs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
            <p style={{ margin: '0 0 8px', fontSize: 16 }}>No jobs yet</p>
            <p style={{ fontSize: 14, margin: 0 }}>Click "New job" to get started</p>
          </div>
        ) : jobs.map(job => (
          <div key={job.id} style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 500, margin: '0 0 3px', fontSize: 15 }}>{job.title}</p>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                {job.customer} · {new Date(job.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {job.price && <p style={{ fontWeight: 500, margin: 0 }}>${job.price}</p>}
              <span style={{ fontSize: 12, fontWeight: 500, color: statusColor[job.status], background: statusColor[job.status] + '18', padding: '4px 10px', borderRadius: 20 }}>
                {job.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}