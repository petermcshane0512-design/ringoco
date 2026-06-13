'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import SupportWidget from '@/components/SupportWidget'

// Mirror of requireAdmin's DEFAULT_ADMIN_EMAILS — keep in sync. Client
// code can't read process.env.ADMIN_EMAILS (server-only), so this gates
// only button VISIBILITY; the API gate is requireAdmin server-side.
const ADMIN_EMAILS = new Set(['pmcshane@fordham.edu', 'peter@bellavego.com', 'bellavegollc@gmail.com'])

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

  // 2026-06-11 LIGHT-MODE TRADE-SOFTWARE REDESIGN per Peter. This is THE
  // ONE header (the page-level dark bar was deleted) — logo left; Buy more
  // leads / Settings / Support / account right. Boring and trustworthy,
  // like Jobber — the buyer is a 45-65yo contractor on his phone outside.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', fontFamily: "Inter, system-ui, -apple-system, sans-serif", background: '#F2EAD9' }}>
      <ImpersonationBanner />

      <header className="bavg-dash-header" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px clamp(14px, 4vw, 28px)',
        background: '#ffffff',
        borderBottom: '1px solid #E3D8C2',
        position: 'sticky', top: 0, zIndex: 50,
        gap: 10,
      }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', minWidth: 0 }}>
          <Image src="/logo.png" alt="BellAveGo" width={170} height={52} style={{ objectFit: 'contain', maxWidth: 'min(38vw, 170px)', height: 'auto' }} priority />
        </Link>
        <div className="bavg-dash-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Link href="/dashboard/buy-leads" className="bavg-dash-primary" style={{
            fontSize: 13, fontWeight: 700, color: '#ffffff',
            textDecoration: 'none',
            padding: '10px 14px', borderRadius: 8, minHeight: 44, display: 'inline-flex', alignItems: 'center',
            background: '#E8742B', whiteSpace: 'nowrap',
          }}>Buy more leads</Link>
          <Link href="/dashboard/refer" className="bavg-dash-nav" style={{ ...navLink, color: '#15803D', borderColor: '#BBF7D0', background: '#F0FDF4', fontWeight: 700 }}>💰 Refer</Link>
          <Link href="/dashboard/settings" className="bavg-dash-nav" style={navLink}>Settings</Link>
          <Link href="/dashboard/support" className="bavg-dash-nav" style={navLink}>Support</Link>
          {/* Founder-only — gated by the same ADMIN_EMAILS check as the
              /api/admin/* routes; renders for no customer. Stays visible
              on mobile (not .bavg-dash-nav) — Peter checks from his phone. */}
          {isAdmin && (
            <Link href="/admin/master" style={{
              ...navLink, background: '#1f2937', color: '#ffffff', border: '1px solid #1f2937',
            }}>Admin</Link>
          )}
          <UserButton />
        </div>
      </header>
      {/* Mobile: logo + primary CTA + account stay; secondary nav (Settings/
          Support) collapses to keep the row from overflowing at 390px.
          They're still reachable from in-page links. */}
      <style>{`
        @media (max-width: 560px) {
          .bavg-dash-header { padding: 8px 12px !important; gap: 8px !important; }
          .bavg-dash-actions { gap: 6px !important; }
          .bavg-dash-nav { display: none !important; }
          .bavg-dash-primary { padding: 9px 12px !important; font-size: 12.5px !important; }
        }
      `}</style>

      <main style={{ flex: 1, overflowY: 'auto' }}>{children}</main>

      <SupportWidget />
    </div>
  )
}

const navLink: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#374151',
  textDecoration: 'none',
  padding: '10px 12px', borderRadius: 8, minHeight: 44, display: 'inline-flex', alignItems: 'center',
  border: '1px solid #E3D8C2',
  background: '#ffffff',
}
