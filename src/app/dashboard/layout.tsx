'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

const nav = [
  { label: 'Command Center', href: '/dashboard' },
  { label: 'AI Receptionist', href: '/dashboard/receptionist', dot: true },
  { label: 'Office Manager', href: '/dashboard/office-manager' },
  { label: 'Invoicing', href: '/dashboard/invoicing' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  const isActive = (href: string) => href === '/dashboard' ? path === href : path === href || path.startsWith(href + '/')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: 'linear-gradient(145deg, #F5FCFA 0%, #EBF7F3 50%, #F0FAF7 100%)' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{ width: 300, background: '#ffffff', borderRight: '1px solid rgba(10,168,159,0.14)', display: 'flex', flexDirection: 'column', padding: '24px 16px 18px', flexShrink: 0, boxShadow: '2px 0 16px rgba(10,168,159,0.06)' }}>

        {/* Logo — top-left brand moment */}
        <div style={{ padding: '4px 0 22px', borderBottom: '1px solid rgba(10,168,159,0.12)', marginBottom: 22 }}>
          <Link href="/" style={{ display: 'block', textDecoration: 'none' }}>
            <Image
              src="/logo.png"
              alt="BellAveGo"
              width={665}
              height={210}
              style={{ objectFit: 'contain', width: '100%', height: 'auto', filter: 'brightness(1.05) drop-shadow(0 6px 18px rgba(10,168,159,0.38))' }}
              priority
            />
          </Link>
        </div>

        {/* Workspace nav */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 6 }}>Workspace</div>

        {[
          {
            href: '/dashboard', label: 'Command Center',
            icon: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
          },
          {
            href: '/dashboard/receptionist', label: 'AI Receptionist', dot: true,
            icon: <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>,
          },
          {
            href: '/dashboard/office-manager', label: 'Office Manager',
            icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
          },
          {
            href: '/dashboard/invoicing', label: 'Invoicing',
            icon: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
          },
        ].map(({ href, label, icon, dot }) => (
          <Link key={href} href={href} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
            borderRadius: 9, textDecoration: 'none', fontSize: 13, marginBottom: 2,
            background: isActive(href) ? 'rgba(10,168,159,0.1)' : 'transparent',
            borderLeft: `2.5px solid ${isActive(href) ? '#0AA89F' : 'transparent'}`,
            color: isActive(href) ? '#0AA89F' : '#4A7A80',
            fontWeight: isActive(href) ? 700 : 500,
            transition: 'all 0.15s ease',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{icon}</svg>
            {label}
            {dot && (
              <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            )}
          </Link>
        ))}

        {/* Account nav */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#7AAAB2', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px', margin: '18px 0 6px' }}>Account</div>
        <Link href="/dashboard/settings" style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
          borderRadius: 9, textDecoration: 'none', fontSize: 13, marginBottom: 2,
          background: isActive('/dashboard/settings') ? 'rgba(10,168,159,0.1)' : 'transparent',
          borderLeft: `2.5px solid ${isActive('/dashboard/settings') ? '#0AA89F' : 'transparent'}`,
          color: isActive('/dashboard/settings') ? '#0AA89F' : '#4A7A80',
          fontWeight: isActive('/dashboard/settings') ? 700 : 500,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
          </svg>
          Settings
        </Link>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(10,168,159,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9 }}>
            <UserButton />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1F3A' }}>Account</div>
              <div style={{ fontSize: 10, color: '#7AAAB2' }}>Owner</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Topbar */}
        <div style={{ height: 54, background: '#ffffff', borderBottom: '1px solid rgba(10,168,159,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0, boxShadow: '0 2px 10px rgba(10,168,159,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(10,168,159,0.2)', background: '#F5FCFA', color: '#0B1F3A', textDecoration: 'none', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              ← Back to home
            </Link>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A' }}>
              {nav.find(n => path === n.href || path.startsWith(n.href + '/'))?.label ?? 'Dashboard'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '5px 13px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#059669' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
              AI Online · (762) 371-3351
            </div>
          </div>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'transparent' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
