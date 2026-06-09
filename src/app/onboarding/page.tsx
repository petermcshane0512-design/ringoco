'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

/**
 * /onboarding — 2026-06-09 LEADS-ONLY PIVOT.
 *
 * Legacy receptionist onboarding deprecated. Thin redirect to /dashboard/setup
 * kept for back-compat with cached marketing links.
 *
 * force-dynamic + Suspense boundary because useSearchParams() can't prerender.
 */

export const dynamic = 'force-dynamic'

function Inner() {
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

  return null
}

export default function OnboardingRedirect() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#FFF8F0',
      color: '#0B1F3A',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Suspense fallback={<div style={{ fontSize: 13, color: '#4A6670' }}>Redirecting…</div>}>
        <Inner />
      </Suspense>
      <div style={{ fontSize: 13, color: '#4A6670' }}>Redirecting…</div>
    </main>
  )
}
