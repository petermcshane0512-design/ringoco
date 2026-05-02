'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function DashboardPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const [{ data: jobsData }, { data: customersData }] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('*'),
      ])
      setJobs(jobsData || [])
      setCustomers(customersData || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const completedJobs = jobs.filter(j => j.status === 'completed')
  const scheduledJobs = jobs.filter(j => j.status === 'pending' || j.status === 'scheduled')
  const revenue = completedJobs.reduce((sum, j) => sum + (parseFloat(j.price) || 0), 0)
  const recentJobs = jobs.slice(0, 5)

  const statusColor: Record<string, string> = {
    pending: '#2563EB',
    scheduled: '#2563EB',
    completed: '#22C55E',
    cancelled: '#EF4444',
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Overview</h1>
        <p style={{ color: '#64748B', fontSize: 14 }}>Welcome back. Here&apos;s what&apos;s happening.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Scheduled Jobs', value: loading ? '...' : scheduledJobs.length, icon: '📅', color: '#EFF6FF', border: '#BFDBFE' },
          { label: 'Completed Jobs', value: loading ? '...' : completedJobs.length, icon: '✅', color: '#F0FDF4', border: '#BBF7D0' },
          { label: 'Revenue', value: loading ? '...' : `$${revenue.toLocaleString()}`, icon: '💰', color: '#F0FDF4', border: '#BBF7D0' },
          { label: 'Total Customers', value: loading ? '...' : customers.length, icon: '👤', color: '#EFF6FF', border: '#BFDBFE' },
        ].map(s => (
          <div key={s.label} style={{ background: s.color, border: `1px solid ${s.border}`, borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <p style={{ fontSize: 28, fontWeight: 800, color: '#0F172A', margin: '0 0 4px' }}>{s.value}</p>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Jobs */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>Recent Jobs</h2>
          <Link href="/dashboard/jobs" style={{ fontSize: 13, color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>View all →</Link>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>Loading...</div>
        ) : recentJobs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📞</p>
            <p style={{ fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>No jobs yet</p>
            <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 20 }}>Jobs booked by your AI will appear here automatically</p>
            <Link href="/dashboard/receptionist" style={{ padding: '10px 20px', background: '#2563EB', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Set up AI Receptionist
            </Link>
          </div>
        ) : recentJobs.map((job, i) => (
          <div key={job.id} style={{ padding: '14px 24px', borderBottom: i < recentJobs.length - 1 ? '1px solid #F1F5F9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', margin: '0 0 3px' }}>{job.title || job.job_type || 'Job'}</p>
              <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{job.customer_name} · {job.address || ''}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {job.price && <p style={{ fontWeight: 600, fontSize: 14, color: '#0F172A', margin: 0 }}>${job.price}</p>}
              <span style={{ fontSize: 12, fontWeight: 600, color: statusColor[job.status] || '#64748B', background: (statusColor[job.status] || '#64748B') + '18', padding: '4px 10px', borderRadius: 20 }}>
                {job.status || 'pending'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {[
          { icon: '📞', title: 'AI Receptionist', desc: 'Set up call answering', href: '/dashboard/receptionist', color: '#EFF6FF' },
          { icon: '📅', title: 'Scheduling', desc: 'Set your availability', href: '/dashboard/scheduling', color: '#F0FDF4' },
          { icon: '👤', title: 'Customers', desc: 'View your customer database', href: '/dashboard/customers', color: '#EFF6FF' },
        ].map(q => (
          <Link key={q.title} href={q.href} style={{ background: q.color, border: '1px solid #E2E8F0', borderRadius: 14, padding: '20px 22px', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>{q.icon}</div>
            <p style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', margin: '0 0 4px' }}>{q.title}</p>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{q.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}