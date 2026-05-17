'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import ImpersonationBanner from '@/components/ImpersonationBanner'

const nav = [
  { label: 'Command Center', href: '/dashboard' },
  { label: 'AI Receptionist', href: '/dashboard/receptionist', dot: true },
  { label: 'Operator', href: '/dashboard/office-manager' },
  { label: 'Invoicing', href: '/dashboard/invoicing' },
  { label: 'Consulting Reports', href: '/dashboard/reports' },
  { label: 'Call Forwarding', href: '/dashboard/forwarding' },
]

function formatUS(num: string) {
  const d = (num || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  return num
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [twilioNumber, setTwilioNumber] = useState<string | null>(null)
  const [isActiveSub, setIsActiveSub] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (p && !p.error) {
        setTwilioNumber(p.twilio_number ?? null)
        setIsActiveSub(p.is_active ?? false)
      }
    }).catch(() => {})
  }, [])

  const isActive = (href: string) => href === '/dashboard' ? path === href : path === href || path.startsWith(href + '/')

  return (
    <div className="mc-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }}>

      <ImpersonationBanner />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

      {/* ── SIDEBAR — warm white, sunset-orange accents ── */}
      <aside style={{ width: 300, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderRight: '1px solid rgba(232,116,43,0.12)', display: 'flex', flexDirection: 'column', padding: '24px 16px 18px', flexShrink: 0, boxShadow: '4px 0 24px rgba(232,116,43,0.05), 4px 0 12px rgba(11,31,58,0.04)' }}>

        {/* Logo — original BellAveGo brand, no filters */}
        <div style={{ padding: '4px 0 22px', borderBottom: '1px solid rgba(232,116,43,0.10)', marginBottom: 22 }}>
          <Link href="/" style={{ display: 'block', textDecoration: 'none' }}>
            <Image
              src="/logo.png"
              alt="BellAveGo"
              width={665}
              height={210}
              style={{ objectFit: 'contain', width: '100%', height: 'auto' }}
              priority
            />
          </Link>
        </div>

        {/* Workspace nav */}
        <div style={{ fontSize: 10, fontWeight: 800, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 8px', marginBottom: 6 }}>Workspace</div>

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
            href: '/dashboard/office-manager', label: 'Operator',
            icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
          },
          {
            href: '/dashboard/invoicing', label: 'Invoicing',
            icon: <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>,
          },
          {
            href: '/dashboard/reports', label: 'Consulting Reports',
            icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></>,
          },
          {
            href: '/dashboard/forwarding', label: 'Call Forwarding',
            icon: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/><polyline points="15 4 20 4 20 9"/><line x1="15" y1="9" x2="20" y2="4"/></>,
          },
          {
            href: '/dashboard/calendar', label: 'Calendar Sync',
            icon: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
          },
        ].map(({ href, label, icon, dot }) => (
          <Link key={href} href={href} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px',
            borderRadius: 9, textDecoration: 'none', fontSize: 13, marginBottom: 2,
            background: isActive(href) ? 'linear-gradient(90deg, rgba(232,116,43,0.10), rgba(20,184,166,0.06))' : 'transparent',
            borderLeft: `2.5px solid ${isActive(href) ? '#E8742B' : 'transparent'}`,
            color: isActive(href) ? '#C84B26' : '#4A6670',
            fontWeight: isActive(href) ? 700 : 500,
            transition: 'all 0.18s ease',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive(href) ? '#0AA89F' : 'currentColor'} strokeWidth="1.8">{icon}</svg>
            {label}
            {dot && (
              <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
            )}
          </Link>
        ))}

        {/* Account nav */}
        <div style={{ fontSize: 10, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 8px', margin: '18px 0 6px' }}>Account</div>
        <Link href="/dashboard/settings" style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px',
          borderRadius: 9, textDecoration: 'none', fontSize: 13, marginBottom: 2,
          background: isActive('/dashboard/settings') ? 'linear-gradient(90deg, rgba(232,116,43,0.10), rgba(20,184,166,0.06))' : 'transparent',
          borderLeft: `2.5px solid ${isActive('/dashboard/settings') ? '#E8742B' : 'transparent'}`,
          color: isActive('/dashboard/settings') ? '#C84B26' : '#4A6670',
          fontWeight: isActive('/dashboard/settings') ? 700 : 500,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 10-16 0"/>
          </svg>
          Settings
        </Link>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(232,116,43,0.10)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9 }}>
            <UserButton />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F3A' }}>Account</div>
              <div style={{ fontSize: 10, color: '#7AAAB2' }}>Owner</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Topbar — warm white with sunset border accent */}
        <div style={{ height: 54, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(232,116,43,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(232,116,43,0.18)', background: '#FFF7EE', color: '#C84B26', textDecoration: 'none', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              ← Back to home
            </Link>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.1px' }}>
              {nav.find(n => path === n.href || path.startsWith(n.href + '/'))?.label ?? 'Dashboard'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isActiveSub && twilioNumber ? (
              <div className="mc-status-pill"><span className="mc-live-dot" /> AI Online · {formatUS(twilioNumber)}</div>
            ) : isActiveSub === false ? (
              <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#FEF2F2', border: '1px solid #FECACA', padding: '5px 13px', borderRadius: 99, fontSize: 11, fontWeight: 800, color: '#DC2626', textDecoration: 'none', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626' }} />
                AI Offline · Activate
              </Link>
            ) : null}
          </div>
        </div>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'transparent' }}>
          {children}
        </main>
      </div>
      </div>
    </div>
  )
}
