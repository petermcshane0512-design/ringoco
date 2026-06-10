'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { LEADS_PER_WEEK, INTRO_PRICE_USD, INTRO_PROMO_CODE, SUPPORTED_TRADES } from '@/lib/offer'

/**
 * /start/area — service area gate.
 *
 * T3 of offer-rebuild plan (2026-06-10). Customer picks (zip, trade)
 * BEFORE Stripe checkout so we can:
 *   1. Block sign-up if the (zip, trade) is already claimed by another
 *      shop (the exclusivity promise becomes mechanically real).
 *   2. Capture the waitlist email if the area is taken.
 *   3. Pass the zip + trade into checkout so the webhook can claim the
 *      territory at the moment payment succeeds.
 *
 * Flow (2026-06-10 — /pricing intermediate REMOVED per Peter):
 *   /start?promo=FIRST400  → captures promo cookie, redirects → /start/area
 *   /start/area            → zip + trade form
 *     ├─ open      → save area cookies, then:
 *     │             · signed in    → POST /api/stripe/checkout → Stripe URL
 *     │             · signed out   → /sign-up → bounce back here w/ ?autoco=1
 *     │                              → auto-fires checkout w/ prefilled area
 *     └─ taken     → "this area is locked" + waitlist email capture
 */

const AREA_ZIP_COOKIE = 'bavg_area_zip'
const AREA_TRADE_COOKIE = 'bavg_area_trade'
const AREA_ADDR_COOKIE = 'bavg_area_addr'
const AREA_PHONE_COOKIE = 'bavg_area_phone'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14 // 14 days

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] || ''
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax; Secure`
}

function StartAreaContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const { isSignedIn, isLoaded } = useAuth()
  const promo = (sp?.get('promo') || INTRO_PROMO_CODE).trim().toUpperCase()
  const ref = (sp?.get('ref') || '').trim()
  const bizId = (sp?.get('b') || '').trim()
  const autoco = sp?.get('autoco') === '1'

  const [zip, setZip] = useState('')
  const [trade, setTrade] = useState<string>('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<null | { status: 'open' | 'claimed' | 'grace' | 'unserved' }>(null)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistBiz, setWaitlistBiz] = useState('')
  const [waitlistedOk, setWaitlistedOk] = useState(false)
  const [err, setErr] = useState('')

  // Prefill from cookies (set on prior /start/area visit or by the homepage
  // OpportunityChecker) OR from URL params (passed by the homepage widget).
  useEffect(() => {
    const urlZip = (sp?.get('zip') || '').replace(/\D/g, '').slice(0, 5)
    const urlTrade = (sp?.get('trade') || '').toLowerCase().trim()
    setZip((prev) => prev || urlZip || readCookie(AREA_ZIP_COOKIE))
    setTrade((prev) => prev || urlTrade || decodeURIComponent(readCookie(AREA_TRADE_COOKIE)))
    setAddress((prev) => prev || decodeURIComponent(readCookie(AREA_ADDR_COOKIE)))
    setPhone((prev) => prev || decodeURIComponent(readCookie(AREA_PHONE_COOKIE)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fireCheckout = useCallback(async (z: string, t: string, a: string, p: string) => {
    setChecking(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'officemgr',
          interval: 'monthly',
          creatorCode: promo,
          bizId: bizId || undefined,
          zip: z,
          trade: t,
          address: a,
          phone: p,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
      setErr(`Checkout failed: ${data?.error ?? 'unknown'}. Text 773-710-9565.`)
    } catch {
      setErr('Network error reaching checkout. Try again.')
    } finally {
      setChecking(false)
    }
  }, [promo, bizId])

  // Auto-resume after Clerk sign-up bounce: /start/area?autoco=1 with saved
  // area cookies → fire checkout once auth is known.
  useEffect(() => {
    if (!autoco || !isLoaded || !isSignedIn) return
    const z = readCookie(AREA_ZIP_COOKIE)
    const t = decodeURIComponent(readCookie(AREA_TRADE_COOKIE))
    const a = decodeURIComponent(readCookie(AREA_ADDR_COOKIE))
    const p = decodeURIComponent(readCookie(AREA_PHONE_COOKIE))
    if (!/^\d{5}$/.test(z) || !t) return
    fireCheckout(z, t, a, p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoco, isLoaded, isSignedIn])

  async function onCheck(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    setResult(null)
    setWaitlistedOk(false)
    if (!/^\d{5}$/.test(zip)) {
      setErr('Enter a 5-digit zip code.')
      return
    }
    if (!trade) {
      setErr('Pick your trade.')
      return
    }
    if (address.trim().length < 8) {
      setErr('Enter your business address so we can pull leads within walking distance of it.')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      setErr('Enter a 10-digit phone number so we can text you when a hot lead opens.')
      return
    }
    setChecking(true)
    try {
      const r = await fetch(`/api/territory/check?zip=${zip}&trade=${trade}`)
      const j = await r.json()
      if (!j.ok) {
        setErr(j.error || 'Could not check this area. Try again.')
        return
      }
      setResult({ status: j.status })
      if (j.status === 'open') {
        // Save area + address + phone so they survive the Clerk sign-up
        // bounce, then either go straight to Stripe (already signed in) or
        // sign-up → /start/area?autoco=1 which fires checkout once auth lands.
        writeCookie(AREA_ZIP_COOKIE, zip)
        writeCookie(AREA_TRADE_COOKIE, trade)
        writeCookie(AREA_ADDR_COOKIE, address.trim())
        writeCookie(AREA_PHONE_COOKIE, phoneDigits)
        if (isSignedIn) {
          await fireCheckout(zip, trade, address.trim(), phoneDigits)
        } else {
          const back = encodeURIComponent('/start/area?autoco=1')
          router.push(`/sign-up?redirect_url=${back}`)
        }
      }
    } catch {
      setErr('Network error. Try again.')
    } finally {
      setChecking(false)
    }
  }

  async function onWaitlist(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(waitlistEmail)) {
      setErr('Enter a valid email.')
      return
    }
    try {
      const r = await fetch('/api/territory/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zip,
          trade,
          email: waitlistEmail,
          reason: result?.status === 'unserved' ? 'uncovered' : 'claimed',
        }),
      })
      const j = await r.json()
      if (j.ok) {
        setWaitlistedOk(true)
      } else {
        setErr(j.error || 'Could not add you to the waitlist.')
      }
    } catch {
      setErr('Network error. Try again.')
    }
  }

  const taken = result && (result.status === 'claimed' || result.status === 'grace')
  const unserved = result && result.status === 'unserved'

  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: '#FFF8F0',
      color: '#0B1F3A',
      minHeight: '100vh',
      padding: '40px clamp(16px, 5vw, 48px)',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link href="/" style={{ fontSize: 13, color: '#7AAAB2', textDecoration: 'none', fontWeight: 700 }}>
          ← Back
        </Link>
        <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 36px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '14px 0 8px' }}>
          Pick your service area.
        </h1>
        <p style={{ fontSize: 15, color: '#3D5A66', lineHeight: 1.55, margin: '0 0 24px' }}>
          One shop per zip + trade. We&rsquo;ll check if your area is open in 2 seconds.
          {' '}If it&rsquo;s taken we&rsquo;ll put you on the waitlist for that exact zip.
        </p>

        <form onSubmit={onCheck} style={{
          padding: 22, borderRadius: 16,
          background: '#FFFFFF',
          border: '1.5px solid rgba(232,116,43,0.22)',
          boxShadow: '0 14px 40px rgba(11,31,58,0.06)',
        }}>
          <label style={labelStyle}>Service-area zip code</label>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="75024"
            inputMode="numeric"
            maxLength={5}
            style={inputStyle}
            autoFocus
          />

          <label style={{ ...labelStyle, marginTop: 14 }}>Your trade</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
            {/* 2026-06-10 — electrical + handyman dropped from new signups per
                supply doc (effectively zero leads across all metros). Re-add
                here when scraper coverage clears the per-week minimum. */}
            {(['hvac', 'plumbing', 'roofing'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrade(t)}
                style={{
                  padding: '10px 12px', borderRadius: 10,
                  border: trade === t ? '2px solid #E8742B' : '1.5px solid rgba(11,31,58,0.18)',
                  background: trade === t ? '#FFF1E4' : '#FFFFFF',
                  fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  color: '#0B1F3A', textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <label style={{ ...labelStyle, marginTop: 14 }}>Your business address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Chicago, IL 60615"
            style={inputStyle}
            autoComplete="street-address"
          />
          <p style={{ fontSize: 11, color: '#7AAAB2', marginTop: 6, marginBottom: 0 }}>
            We deliver leads within a 3-mile radius of this address the first 4 weeks, then widen weekly.
          </p>

          <label style={{ ...labelStyle, marginTop: 14 }}>Your cell phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(773) 555-0100"
            inputMode="tel"
            style={inputStyle}
            autoComplete="tel"
          />
          <p style={{ fontSize: 11, color: '#7AAAB2', marginTop: 6, marginBottom: 0 }}>
            We text you the second a homeowner shows real interest. No other use.
          </p>

          {err && (
            <p style={{ fontSize: 13, color: '#C84B26', margin: '12px 0 0', fontWeight: 700 }}>
              {err}
            </p>
          )}

          <button
            type="submit"
            disabled={checking}
            style={{
              marginTop: 18, width: '100%', padding: '14px 18px', borderRadius: 12,
              background: checking ? 'rgba(11,31,58,0.3)' : 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26 100%)',
              color: '#fff', fontWeight: 900, fontSize: 15, border: 'none', cursor: checking ? 'wait' : 'pointer',
              boxShadow: '0 10px 26px rgba(232,116,43,0.40)',
            }}
          >
            {checking ? 'Checking…' : 'Check my area →'}
          </button>

          <p style={{ fontSize: 11.5, color: '#7AAAB2', textAlign: 'center', margin: '12px 0 0' }}>
            ${INTRO_PRICE_USD} first month with code {promo} · {LEADS_PER_WEEK} fresh leads every Monday · Cancel anytime
          </p>
        </form>

        {(taken || unserved) && !waitlistedOk && (
          <div style={{
            marginTop: 24, padding: 22, borderRadius: 16,
            background: unserved ? 'rgba(232,116,43,0.10)' : 'rgba(94,234,212,0.10)',
            border: unserved ? '1.5px solid rgba(232,116,43,0.30)' : '1.5px solid rgba(20,184,166,0.30)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: unserved ? '#C84B26' : '#0B7B70', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              {unserved
                ? 'We\'re not in your zip yet'
                : result?.status === 'claimed'
                  ? 'This area is locked'
                  : 'This area is in a 14-day cool-down'}
            </div>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: '#0B1F3A', lineHeight: 1.55 }}>
              {unserved
                ? `Our lead scrapers don't cover ${zip} yet. Drop your email and we'll tell you the moment ${zip} goes live.`
                : `Another shop already owns ${zip} for ${trade}. Drop your email and we'll notify you the moment it opens.`}
            </p>
            <form onSubmit={onWaitlist}>
              <input
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="you@yourshop.com"
                type="email"
                style={inputStyle}
              />
              <input
                value={waitlistBiz}
                onChange={(e) => setWaitlistBiz(e.target.value)}
                placeholder="Shop name (optional)"
                style={{ ...inputStyle, marginTop: 8 }}
              />
              <button
                type="submit"
                style={{
                  marginTop: 12, width: '100%', padding: '12px 18px', borderRadius: 10,
                  background: 'linear-gradient(135deg, #0AA89F, #0D8F87)',
                  color: '#fff', fontWeight: 900, fontSize: 14, border: 'none', cursor: 'pointer',
                }}
              >
                Add me to the waitlist
              </button>
            </form>
          </div>
        )}

        {waitlistedOk && (
          <div style={{
            marginTop: 24, padding: 22, borderRadius: 16,
            background: 'rgba(34,197,94,0.10)',
            border: '1.5px solid rgba(34,197,94,0.30)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#16803F', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              ✓ Added to waitlist
            </div>
            <p style={{ margin: 0, fontSize: 14, color: '#0B1F3A', lineHeight: 1.55 }}>
              You&rsquo;ll get an email the second {zip} ({trade}) opens up.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

export default function StartAreaPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#FFF8F0' }} />}>
      <StartAreaContent />
    </Suspense>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 900, color: '#0B1F3A',
  letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid rgba(11,31,58,0.18)', fontSize: 15,
  fontFamily: 'inherit', color: '#0B1F3A', background: '#FFFFFF',
  boxSizing: 'border-box',
}
