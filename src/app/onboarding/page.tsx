'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

/**
 * /onboarding — 2026-06-09 LEADS-ONLY PIVOT.
 *
 * Legacy receptionist onboarding (trade picker + AI greeting style chooser)
 * deprecated. The actual onboarding now lives at /dashboard/setup which
 * collects everything needed for lead-gen + auto-outreach.
 *
 * This page is now a thin redirect kept for backward compat — any link
 * pointing to /onboarding (old emails, cached search results) still works.
 */

export default function OnboardingRedirect() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const sp = useSearchParams()

  useEffect(() => {
    if (!isLoaded) return
    const redirectUrl = sp.get('redirect_url') || '/dashboard/setup'
    if (!isSignedIn) {
      router.replace(`/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`)
    } else {
      router.replace(redirectUrl)
    }
  }, [isLoaded, isSignedIn, router, sp])

  return (
    <main style={{
      minHeight: '100vh',
      background: '#050E1F',
      color: '#fff',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Redirecting…</div>
    </main>
  )
}
