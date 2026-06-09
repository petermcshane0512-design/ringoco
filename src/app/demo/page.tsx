'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /demo — 2026-06-09 LEADS-ONLY PIVOT.
 *
 * Old: AI receptionist demo (call Emma live). Receptionist mothballed.
 * New: redirect to /founder, where the new story lives.
 */

export default function DemoRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/founder') }, [router])
  return (
    <main style={{
      minHeight: '100vh', background: '#FFF8F0', color: '#0B1F3A',
      fontFamily: "'Inter', system-ui, sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 13, color: '#4A6670' }}>Redirecting…</div>
    </main>
  )
}
