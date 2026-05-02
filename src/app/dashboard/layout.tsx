'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Jobs', href: '/dashboard/jobs' },
  { label: 'Customers', href: '/dashboard/customers' },
  { label: 'AI Receptionist', href: '/dashboard/receptionist' },
  { label: 'Scheduling', href: '/dashboard/scheduling' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 220, background: '#0f172a', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 24, padding: '0 8px' }}>BellAveGo</p>
        {nav.map(n => (
          <Link key={n.href} href={n.href} style={{
            padding: '10px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 14,
            background: path === n.href ? '#1e293b' : 'transparent',
            color: path === n.href ? '#fff' : '#94a3b8',
          }}>
            {n.label}
          </Link>
        ))}
      </aside>
      <main style={{ flex: 1, background: '#f8fafc', padding: 32 }}>
        {children}
      </main>
    </div>
  )
}
