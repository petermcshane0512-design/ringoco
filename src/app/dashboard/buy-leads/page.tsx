'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useUser } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * /dashboard/buy-leads
 *
 * 2026-06-09 LEADS-ONLY PIVOT — extra leads (one-time purchase).
 *
 * Pack selector page. Customer clicks a pack → POST /api/stripe/checkout-alacarte
 * → redirect to Stripe Checkout. On success, returns here w/ ?ok=1 + session_id.
 *
 * Hormozi Money Models stacked pricing: bigger pack = lower $/lead.
 */

type PackKey = 'SINGLE' | 'PACK_5' | 'PACK_10' | 'PACK_25'
type Pack = { key: PackKey; qty: number; total: number; per: number; label: string; highlight?: boolean }

const PACKS: Pack[] = [
  { key: 'SINGLE',  qty: 1,  total: 15,  per: 15, label: '1 lead' },
  { key: 'PACK_5',  qty: 5,  total: 75,  per: 15, label: '5 leads', highlight: true },
  { key: 'PACK_10', qty: 10, total: 140, per: 14, label: '10 leads' },
  { key: 'PACK_25', qty: 25, total: 300, per: 12, label: '25 leads' },
]

export default function BuyLeadsPageWrap() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#050E1F', color: '#fff', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Loading…</div></main>}>
      <BuyLeadsPage />
    </Suspense>
  )
}

function BuyLeadsPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const sp = useSearchParams()
  const [loading, setLoading] = useState<PackKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) router.replace('/sign-in?redirect_url=/dashboard/buy-leads')
  }, [isLoaded, isSignedIn, router])

  async function buy(pack: PackKey) {
    setLoading(pack); setError(null)
    try {
      const r = await fetch('/api/stripe/checkout-alacarte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'failed'); setLoading(null); return }
      if (j.url) window.location.href = j.url
    } catch (e) {
      setError((e as Error).message); setLoading(null)
    }
  }

  const justSucceeded = sp.get('ok') === '1'
  const cancelled = sp.get('cancelled') === '1'

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 65%, #112C4A 100%)',
      color: '#fff',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <nav style={navStyle}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={160} height={48} style={{ objectFit: 'contain' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link href="/dashboard/leads" style={navLink}>Leads</Link>
          <Link href="/dashboard/settings/outreach" style={navLink}>Outreach</Link>
        </div>
      </nav>

      <section style={{ padding: '40px clamp(16px, 4vw, 40px)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ marginBottom: 6 }}>
            <Link href="/dashboard" style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>← Dashboard</Link>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 3.4vw, 38px)', fontWeight: 900, margin: '0 0 10px', letterSpacing: '-0.03em' }}>
            Need more leads? <span style={{ color: '#FF9D5A' }}>Buy extras.</span>
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', maxWidth: 620, marginBottom: 28, lineHeight: 1.6 }}>
            Real homeowner leads in your zip, delivered to your dashboard within 24 hours. Exclusive to you. One-time charge — no subscription changes.
          </p>

          {justSucceeded && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.40)', color: '#22C55E', fontSize: 14, fontWeight: 700, marginBottom: 24 }}>
              ✓ Charge complete. Extra leads land within 24 hours.
            </div>
          )}
          {cancelled && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.30)', color: '#FF9D5A', fontSize: 13, marginBottom: 24 }}>
              Cancelled. No charge. Pick a pack below if you change your mind.
            </div>
          )}
          {error && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5', fontSize: 13, marginBottom: 24 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {PACKS.map((p) => {
              const isLoading = loading === p.key
              return (
                <div key={p.key} style={{
                  padding: 22, borderRadius: 16,
                  background: p.highlight
                    ? 'linear-gradient(165deg, rgba(232,116,43,0.18) 0%, rgba(15,37,66,0.7) 100%)'
                    : 'linear-gradient(165deg, rgba(15,37,66,0.6) 0%, rgba(10,27,51,0.7) 100%)',
                  border: p.highlight ? '2px solid rgba(232,116,43,0.50)' : '1px solid rgba(94,234,212,0.22)',
                  position: 'relative',
                  boxShadow: p.highlight ? '0 16px 40px rgba(232,116,43,0.20)' : 'none',
                }}>
                  {p.highlight && (
                    <div style={{
                      position: 'absolute', top: -12, right: 18,
                      padding: '5px 12px', borderRadius: 99,
                      background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                      color: '#fff', fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase',
                    }}>Popular</div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 800, color: p.highlight ? '#FF9D5A' : '#5EEAD4', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>${p.total}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, marginBottom: 18 }}>
                    ${p.per}/lead {p.qty > 1 && p.per < 15 && <span style={{ color: '#5EEAD4', fontWeight: 700 }}>· save ${(15 - p.per) * p.qty}</span>}
                  </div>
                  <button
                    onClick={() => buy(p.key)}
                    disabled={!!loading}
                    style={{
                      width: '100%', padding: '11px 16px', borderRadius: 11,
                      background: p.highlight
                        ? 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)'
                        : 'linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)',
                      color: '#fff', border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                      fontSize: 13, fontWeight: 900,
                      boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
                    }}
                  >
                    {isLoading ? 'Redirecting…' : 'Buy now →'}
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 28, fontSize: 12, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 1.6 }}>
            Card charged once. Extra leads delivered within 24 hrs. Same exclusive territory + same AI auto-outreach as your monthly leads. <br />
            Auto-applied to your dashboard — no manual configuration.
          </div>
        </div>
      </section>
    </main>
  )
}

const navStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '16px clamp(16px, 4vw, 40px)',
  background: 'rgba(5,14,31,0.85)', backdropFilter: 'blur(10px)',
  borderBottom: '1px solid rgba(94,234,212,0.18)',
  position: 'sticky', top: 0, zIndex: 50,
}
const navLink: React.CSSProperties = { color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: 13, fontWeight: 700 }
