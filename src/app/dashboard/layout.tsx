'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

const nav = [
  { label: 'Command Center', href: '/dashboard' },
  { label: 'AI Receptionist', href: '/dashboard/receptionist', dot: true },
  { label: 'Invoicing', href: '/dashboard/invoicing' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', background: '#07101F' }}>
      <aside style={{ width: 220, background: '#060E1C', borderRight: '1px solid #0F2040', display: 'flex', flexDirection: 'column', padding: '20px 14px', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: '8px 4px 20px', borderBottom: '1px solid #0F2040', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <style>{`
            @keyframes greenGlow {
              0%, 100% { filter: drop-shadow(0 0 6px #22C55E) drop-shadow(0 0 12px #22C55E); }
              50% { filter: drop-shadow(0 0 16px #4ADE80) drop-shadow(0 0 32px #22C55E) drop-shadow(0 0 48px #16A34A); }
            }
            .logo-glow {
              animation: greenGlow 2.5s ease-in-out infinite;
            }
          `}</style>
          <img
            src="/logo3.png"
            alt="RingoCo"
            className="logo-glow"
            style={{ height: 92, width: 'auto', objectFit: 'contain' }}
          />
        </div>

        {/* Main nav */}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 6 }}>Workspace</div>

        {/* Command Center */}
        <Link href="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
          borderRadius: 8, textDecoration: 'none', fontSize: 13, marginBottom: 2,
          background: path === '/dashboard' ? '#0C1F3D' : 'transparent',
          color: path === '/dashboard' ? '#38BDF8' : '#64748B',
          fontWeight: path === '/dashboard' ? 500 : 400,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Command Center
        </Link>

        {/* AI Receptionist */}
        <Link href="/dashboard/receptionist" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
          borderRadius: 8, textDecoration: 'none', fontSize: 13, marginBottom: 2,
          background: path === '/dashboard/receptionist' ? '#0C1F3D' : 'transparent',
          color: path === '/dashboard/receptionist' ? '#38BDF8' : '#64748B',
          fontWeight: path === '/dashboard/receptionist' ? 500 : 400,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
          </svg>
          AI Receptionist
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', marginLeft: 'auto' }} />
        </Link>

        {/* Invoicing */}
        <Link href="/dashboard/invoicing" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
          borderRadius: 8, textDecoration: 'none', fontSize: 13, marginBottom: 2,
          background: path === '/dashboard/invoicing' ? '#0C1F3D' : 'transparent',
          color: path === '/dashboard/invoicing' ? '#38BDF8' : '#64748B',
          fontWeight: path === '/dashboard/invoicing' ? 500 : 400,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
          </svg>
          Invoicing
        </Link>

        {/* Account section */}
        <div style={{ fontSize: 10, fontWeight: 600, color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 8px', margin: '16px 0 6px' }}>Account</div>
        <Link href="/dashboard/settings" style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
          borderRadius: 8, textDecoration: 'none', fontSize: 13, marginBottom: 2,
          background: path === '/dashboard/settings' ? '#0C1F3D' : 'transparent',
          color: path === '/dashboard/settings' ? '#38BDF8' : '#64748B',
          fontWeight: path === '/dashboard/settings' ? 500 : 400,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4"/>
            <path d="M20 21a8 8 0 10-16 0"/>
          </svg>
          Settings
        </Link>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #0F2040' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8 }}>
            <UserButton />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8' }}>Account</div>
              <div style={{ fontSize: 10, color: '#334155' }}>Owner</div>
            </div>
          </div>
        </div>

      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ height: 52, background: '#060E1C', borderBottom: '1px solid #0F2040', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>
            {nav.find(n => path === n.href || path.startsWith(n.href + '/'))?.label ?? 'Dashboard'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0C1F10', border: '1px solid #166534', padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: '#86EFAC' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E' }} />
              AI Online · (762) 371-3351
            </div>
          </div>
        </div>

        <main style={{ flex: 1, background: '#07101F', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}