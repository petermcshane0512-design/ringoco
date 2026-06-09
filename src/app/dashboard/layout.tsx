'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import SupportWidget from '@/components/SupportWidget'

const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com'])

/**
 * Dashboard layout — 2026-06-09 ONE-PAGE PIVOT.
 *
 * Per Peter: dashboard is ONE page. Stripped sidebar + mobile tab bar.
 * Top bar = logo + "Settings" + UserButton. Everything else lives on
 * /dashboard root (leads + buy-extra + this-week summary).
 *
 * Sub-routes (leads/[id], setup, settings, cancel etc) remain reachable
 * by direct URL but are NOT in nav.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user } = useUser()
  const isAdmin = !!user?.primaryEmailAddress?.emailAddress &&
    ADMIN_EMAILS.has(user.primaryEmailAddress.emailAddress.toLowerCase())
  const [isActiveSub, setIsActiveSub] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then(p => {
      if (p && !p.error) setIsActiveSub(p.is_active ?? false)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (isActiveSub === false && !isAdmin) router.replace('/pricing?subscribe=1')
  }, [isActiveSub, isAdmin, router])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0' }}>
      <ImpersonationBanner />

      {/* Top bar — logo left, account right. That's it. */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px clamp(16px, 4vw, 32px)',
        background: 'rgba(255,248,240,0.92)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(232,116,43,0.16)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={220} height={68} style={{ objectFit: 'contain' }} priority />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/dashboard/setup" style={{
            fontSize: 13, fontWeight: 700, color: '#4A6670',
            textDecoration: 'none',
            padding: '8px 14px', borderRadius: 9,
            border: '1px solid rgba(232,116,43,0.20)',
            background: '#FFF7EE',
          }}>Settings</Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>

      <SupportWidget />
    </div>
  )
}
