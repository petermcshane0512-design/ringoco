'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function DashboardPage() {
  const [stats] = useState({
    scheduled: 0,
    completed: 0,
    revenue: 0,
    customers: 0,
  })

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Overview</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>Welcome to RingoCo</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
        {[
          { label: 'Scheduled jobs', value: stats.scheduled },
          { label: 'Completed this month', value: stats.completed },
          { label: 'Revenue this month', value: `$${stats.revenue}` },
          { label: 'Total customers', value: stats.customers },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px' }}>{s.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>You're all set up</p>
        <p style={{ color: '#64748b', marginBottom: 24 }}>Start by adding your first customer or job</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link href="/dashboard/customers" style={{ padding: '10px 20px', background: '#000', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
            Add customer
          </Link>
          <Link href="/dashboard/jobs" style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, textDecoration: 'none', color: '#000', fontSize: 14 }}>
            Create job
          </Link>
        </div>
      </div>
    </div>
  )
}