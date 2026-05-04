'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

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
        <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
          <UserButton afterSignOutUrl="/" />
          <span style={{ color: '#64748b', fontSize: 13 }}>Account</span>
        </div>
      </aside>
      <main style={{ flex: 1, background: '#f8fafc' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '14px 32px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
            {nav.find(n => path === n.href || path.startsWith(n.href + '/'))?.label ?? 'Dashboard'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="https://bellavego.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
              bellavego.com ↗
            </a>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
        <div style={{ padding: 32 }}>
          {children}
        </div>
      </main>
    </div>
  )
}