'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LEADS_PER_WEEK, INTRO_PRICE_USD, INTRO_PROMO_CODE } from '@/lib/offer'
import AddressAutocomplete from '@/components/AddressAutocomplete'

/**
 * /start/area — THE onboarding.
 *
 * 2026-06-11 Algorithm + Hormozi pass per Peter ("fix the onboarding —
 * Elon's five-step algorithm and Hormozi"):
 *
 *   DELETED (step 2): the separate ZIP field. The address already
 *   contains the zip — we parse it from the Google geocode result
 *   (fallback: parse from the typed address; last-resort: a zip input
 *   appears ONLY if both fail). 4 fields → 3. The best form field is no
 *   form field.
 *
 *   SIMPLIFIED (step 3): plain-language labels. "Sector zip" / "Trade
 *   recipe" / "Alert hotline" console jargon confused the 50-year-old
 *   shop owner this sells to. Hormozi: a confused buyer doesn't buy.
 *
 *   HORMOZI at the CTA: the homepage guarantee (book a job in 30 days
 *   or full refund + next month free + keep every lead) now sits
 *   directly under the pay button — risk reversal at the exact moment
 *   of commitment, not three scrolls earlier on a different page.
 *
 *   RESTYLED to the homepage LeadsCard design system (warm navy +
 *   orange + cream) — same pass as /dashboard/leads. One visual brand
 *   from ad click to dashboard.
 *
 * Flow (frictionless — no account before payment):
 *   submit → geocode preview → confirm pin → POST /api/stripe/checkout
 *   (anonymous OK) → Stripe → webhook mints Clerk user + pulls first
 *   leads → /checkout/return auto-signs in → /dashboard/leads.
 *
 * Logic preserved exactly: cookie persistence + prefill, URL-param
 * prefill from the homepage widget, ?autoco=1 auto-resume, field
 * validations, geocode-preview fail-soft.
 */

const AREA_ZIP_COOKIE = 'bavg_area_zip'
const AREA_TRADE_COOKIE = 'bavg_area_trade'
const AREA_ADDR_COOKIE = 'bavg_area_addr'
const AREA_PHONE_COOKIE = 'bavg_area_phone'
// Referral cookie set by /ref/[code] route when a customer link is visited.
// Same name as the legacy bavg_ref middleware cookie so existing referral
// links keep crediting their original referrer.
const AREA_REF_COOKIE = 'bavg_ref'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14 // 14 days

function readCookie(name: string): string {
  if (typeof document === 'undefined') return ''
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] || ''
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax; Secure`
}

/** Last 5-digit group in the address text = the zip (client-side copy of
 *  lib/geocodeBusinessAddress.parseZipFromAddress — this file is 'use
 *  client', the lib pulls server env). */
function parseZip(s: string): string {
  const matches = s.match(/\b\d{5}(?:-\d{4})?\b/g)
  if (!matches || matches.length === 0) return ''
  return matches[matches.length - 1].slice(0, 5)
}

const TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const

function StartAreaContent() {
  const sp = useSearchParams()
  const promo = (sp?.get('promo') || INTRO_PROMO_CODE).trim().toUpperCase()
  const bizId = (sp?.get('b') || '').trim()
  const autoco = sp?.get('autoco') === '1'

  const [zip, setZip] = useState('')
  // Shown ONLY when neither the geocode nor the typed address yields a
  // zip — the escape hatch, not a default field.
  const [needZip, setNeedZip] = useState(false)
  const [trade, setTrade] = useState<string>('')
  const [otherTradeText, setOtherTradeText] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  // Buddy-referral code (BAVG-XXXXXX). Pre-filled when the visitor came
  // through a /ref/{code} link (middleware writes the cookie); otherwise
  // the visitor can paste it in by hand. When a code resolves to an
  // active customer, that customer earns 1 month free on their next
  // invoice the moment THIS buyer pays month 1 (webhook does the credit).
  const [referralCode, setReferralCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState('')
  // Geocode pin-confirm gate — catches typos that would otherwise burn
  // BatchData spend and deliver leads in the wrong neighborhood.
  const [confirm, setConfirm] = useState<null | { formatted: string; lat: number; lng: number }>(null)

  // Prefill from cookies (prior visit / homepage widget) or URL params.
  useEffect(() => {
    const urlZip = (sp?.get('zip') || '').replace(/\D/g, '').slice(0, 5)
    const urlTrade = (sp?.get('trade') || '').toLowerCase().trim()
    const urlRef = (sp?.get('ref') || '').toUpperCase().trim()
    setZip((prev) => prev || urlZip || readCookie(AREA_ZIP_COOKIE))
    setTrade((prev) => prev || urlTrade || decodeURIComponent(readCookie(AREA_TRADE_COOKIE)))
    setAddress((prev) => prev || decodeURIComponent(readCookie(AREA_ADDR_COOKIE)))
    setPhone((prev) => prev || decodeURIComponent(readCookie(AREA_PHONE_COOKIE)))
    setReferralCode((prev) => prev || urlRef || decodeURIComponent(readCookie(AREA_REF_COOKIE)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fireCheckout = useCallback(async (z: string, t: string, a: string, p: string, refCode?: string) => {
    setChecking(true)
    try {
      const cleanRef = (refCode ?? referralCode).toUpperCase().trim()
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'officemgr',
          interval: 'monthly',
          creatorCode: promo,
          bizId: bizId || undefined,
          buddyReferralCode: /^BAVG-[A-Z0-9]{6}$/.test(cleanRef) ? cleanRef : undefined,
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
  }, [promo, bizId, referralCode])

  // Legacy ?autoco=1 resume (old sign-up bounce links still in the wild).
  useEffect(() => {
    if (!autoco) return
    const z = readCookie(AREA_ZIP_COOKIE)
    const t = decodeURIComponent(readCookie(AREA_TRADE_COOKIE))
    const a = decodeURIComponent(readCookie(AREA_ADDR_COOKIE))
    const p = decodeURIComponent(readCookie(AREA_PHONE_COOKIE))
    if (!/^\d{5}$/.test(z) || !t) return
    fireCheckout(z, t, a, p)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoco])

  async function onCheck(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (address.trim().length < 8) {
      setErr('Enter your business address so we can pull leads within walking distance of it.')
      return
    }
    if (!trade) {
      setErr('Pick your trade.')
      return
    }
    if (trade === 'other' || (trade.startsWith('other:') && trade.slice(6).trim().length === 0)) {
      setErr('Type your trade after picking Other.')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length < 10) {
      setErr('Enter a 10-digit phone number so we can text you when a hot lead opens.')
      return
    }
    // Zip resolution order: manual fallback field (if it appeared) →
    // parsed from typed address → geocode result below.
    let z = needZip && /^\d{5}$/.test(zip) ? zip : parseZip(address)
    setChecking(true)
    try {
      const gr = await fetch('/api/geocode-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      })
      const gj = await gr.json().catch(() => ({}))
      if (gj.ok) {
        if (gj.zip && /^\d{5}$/.test(gj.zip)) z = gj.zip
        if (!z) {
          // Geocoded but somehow no zip anywhere — show the escape hatch.
          setNeedZip(true)
          setErr('We could not read a zip from that address — add it below.')
          return
        }
        setZip(z)
        writeCookie(AREA_ZIP_COOKIE, z)
        writeCookie(AREA_TRADE_COOKIE, trade)
        writeCookie(AREA_ADDR_COOKIE, address.trim())
        writeCookie(AREA_PHONE_COOKIE, phoneDigits)
        setConfirm({ formatted: gj.formatted, lat: gj.lat, lng: gj.lng })
      } else {
        // Fail-soft: never block the sale on a geocode hiccup. Webhook
        // re-attempts geocoding post-payment. But we DO need a zip.
        if (!z) {
          setNeedZip(true)
          setErr('We could not verify that address — add your zip below and double-check the spelling.')
          return
        }
        setZip(z)
        writeCookie(AREA_ZIP_COOKIE, z)
        writeCookie(AREA_TRADE_COOKIE, trade)
        writeCookie(AREA_ADDR_COOKIE, address.trim())
        writeCookie(AREA_PHONE_COOKIE, phoneDigits)
        setErr('We could not verify that address with Google Maps. Double-check spelling, or proceed if you are sure.')
        setConfirm({ formatted: address.trim(), lat: 0, lng: 0 })
      }
    } catch {
      if (!z) {
        setNeedZip(true)
        setErr('We could not verify that address — add your zip below.')
        return
      }
      setZip(z)
      setConfirm({ formatted: address.trim(), lat: 0, lng: 0 })
    } finally {
      setChecking(false)
    }
  }

  async function onConfirmAddress() {
    if (!confirm) return
    const phoneDigits = phone.replace(/\D/g, '')
    await fireCheckout(zip, trade, address.trim(), phoneDigits)
  }

  function onEditAddress() {
    setConfirm(null)
    setErr('')
  }

  const stepDone = {
    address: address.trim().length >= 8,
    trade: !!trade && trade !== 'other' && !(trade.startsWith('other:') && trade.slice(6).trim().length === 0),
    phone: phone.replace(/\D/g, '').length >= 10,
  }
  const stepsTotal = needZip ? 4 : 3
  const armedCount = Object.values(stepDone).filter(Boolean).length + (needZip && /^\d{5}$/.test(zip) ? 1 : 0)

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #081427 0%, #0B1F3A 55%, #0A1830 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#FFF8F0',
      padding: '0 0 60px',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px clamp(14px, 4vw, 28px)',
        background: 'rgba(8,20,39,0.92)',
        borderBottom: '1px solid rgba(255,157,90,0.16)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em', color: '#FFF8F0' }}>
            BellAveGo
          </span>
        </Link>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, color: '#22C55E', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'obLive 1.6s ease-in-out infinite' }} />
          Live
        </span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '28px clamp(14px, 4vw, 28px) 0' }}>
        <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 34px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 8px', color: '#FFF8F0' }}>
          Where should your leads come from?
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,248,240,0.6)', lineHeight: 1.6, margin: '0 0 20px' }}>
          The moment you check out, we pull your first{' '}
          <strong style={{ color: '#FFC58A' }}>{LEADS_PER_WEEK} homeowner leads</strong> starting{' '}
          <strong style={{ color: '#FFC58A' }}>1 mile</strong> from your front door — widening only when
          nearby supply runs low. {LEADS_PER_WEEK} more every 7 days.
        </p>

        {/* Progress strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          fontSize: 10.5, color: '#7AAAB2', fontWeight: 800,
        }}>
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: `${(armedCount / stepsTotal) * 100}%`, height: '100%',
              background: 'linear-gradient(90deg, #FF9D5A, #E8742B)',
              transition: 'width 300ms ease',
              boxShadow: '0 0 12px rgba(232,116,43,0.55)',
            }} />
          </div>
          <span style={{ flexShrink: 0 }}>{armedCount}/{stepsTotal} done</span>
        </div>

        {!confirm ? (
        <form onSubmit={onCheck} style={{
          padding: 'clamp(16px, 3vw, 24px)', borderRadius: 16,
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,157,90,0.2)',
          boxShadow: '0 24px 60px rgba(4,12,24,0.5)',
        }}>
          {/* 01 — business address (the lead-targeting anchor) */}
          <FieldLabel n="01" label="Business address" done={stepDone.address} />
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Start typing — pick your address from the list"
            inputStyle={darkInput}
            autoFocus
          />
          <Hint>Pick from the dropdown so we lock your exact spot. Leads pull as close as possible — 1-mile rings, widening on supply only.</Hint>

          {/* Zip escape hatch — appears ONLY when we can't derive it */}
          {needZip && (
            <>
              <FieldLabel n="✚" label="Zip code" done={/^\d{5}$/.test(zip)} mt />
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="60643"
                inputMode="numeric"
                maxLength={5}
                style={darkInput}
              />
            </>
          )}

          {/* 02 — trade */}
          <FieldLabel n="02" label="Your trade" done={stepDone.trade} mt />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 8 }}>
            {TRADES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTrade(t); setOtherTradeText('') }}
                style={tradeBtn(trade === t)}
              >
                {t}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTrade('other')}
              style={tradeBtn(trade.startsWith('other'))}
            >
              Other
            </button>
          </div>
          {trade.startsWith('other') && (
            <input
              value={otherTradeText}
              onChange={(e) => {
                const v = e.target.value.slice(0, 40)
                setOtherTradeText(v)
                setTrade(v.trim() ? `other:${v.trim().toLowerCase()}` : 'other')
              }}
              placeholder="e.g. landscaping, painting, locksmith"
              style={{ ...darkInput, marginTop: 10 }}
              autoFocus
            />
          )}
          <Hint>Each trade gets its own targeting — system age, pipe era, roof window — tuned to your climate.</Hint>

          {/* 03 — cell */}
          <FieldLabel n="03" label="Your cell" done={stepDone.phone} mt />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(773) 555-0100"
            inputMode="tel"
            style={darkInput}
            autoComplete="tel"
          />
          <Hint>We text this number the second a homeowner shows real interest. No other use.</Hint>

          {/* Buddy referral code — collapsible by default so a cold visitor
              who has no code is not slowed down by an extra field. Opens
              automatically when the URL or cookie pre-filled a code (the
              link landed via /ref/BAVG-XXXXXX). */}
          <details
            open={!!referralCode}
            style={{ marginTop: 14 }}
          >
            <summary style={{
              fontSize: 12, color: '#5EEAD4', fontWeight: 700, cursor: 'pointer',
              listStyle: 'none', padding: '4px 0',
              userSelect: 'none',
            }}>
              💰 Got a buddy code? <span style={{ color: 'rgba(255,248,240,0.6)', fontWeight: 500 }}>they get a free month when you sign up</span>
            </summary>
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase().slice(0, 11))}
              placeholder="BAVG-XXXXXX"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              style={{ ...darkInput, marginTop: 8, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em' }}
            />
            {referralCode && !/^BAVG-[A-Z0-9]{6}$/.test(referralCode) && (
              <p style={{ fontSize: 11, color: '#FCA5A5', margin: '6px 2px 0', fontWeight: 600 }}>
                Code should look like BAVG-AB12CD — check with your buddy.
              </p>
            )}
          </details>

          {err && (
            <p style={{ fontSize: 13, color: '#FCA5A5', margin: '14px 0 0', fontWeight: 700 }}>
              ⚠ {err}
            </p>
          )}

          <button
            type="submit"
            disabled={checking}
            style={{
              marginTop: 20, width: '100%', padding: '15px 18px', borderRadius: 12,
              background: checking ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #FF9D5A, #E8742B 60%, #C84B26 100%)',
              color: '#fff', fontWeight: 900, fontSize: 15, border: 'none',
              cursor: checking ? 'wait' : 'pointer', fontFamily: 'inherit',
              boxShadow: checking ? 'none' : '0 12px 30px rgba(232,116,43,0.40)',
              letterSpacing: '-0.01em',
            }}
          >
            {checking ? 'Checking your address…' : `Lock my area — $${INTRO_PRICE_USD} →`}
          </button>

          {/* Hormozi risk reversal AT the commitment point — same
              guarantee as the homepage, word for word. */}
          <p style={{ fontSize: 12, color: 'rgba(255,248,240,0.7)', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.55, fontWeight: 600 }}>
            Book a paying job in <strong style={{ color: '#FFC58A' }}>30 days</strong> or full refund + <strong style={{ color: '#FFC58A' }}>your next month free</strong> + you keep every lead.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,248,240,0.4)', textAlign: 'center', margin: '8px 0 0', lineHeight: 1.5 }}>
            ${INTRO_PRICE_USD} first month with code {promo} · First {LEADS_PER_WEEK} leads land ~30 min after checkout · Cancel anytime
          </p>
        </form>
        ) : (
        /* Address confirm card */
        <div style={{
          padding: 'clamp(18px, 3vw, 26px)', borderRadius: 16,
          background: 'rgba(255,255,255,0.035)',
          border: '1.5px solid rgba(232,116,43,0.55)',
          boxShadow: '0 24px 60px rgba(4,12,24,0.5), 0 0 40px rgba(232,116,43,0.10)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 900, color: '#FF9D5A', letterSpacing: '0.14em',
            textTransform: 'uppercase', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'obLive 1.6s ease-in-out infinite' }} />
            Found it — confirm your address
          </div>
          <div style={{
            padding: '16px 18px', borderRadius: 12,
            background: 'rgba(4,12,24,0.7)',
            border: '1px solid rgba(255,157,90,0.22)',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#FFF8F0', marginBottom: 4 }}>
              📍 {confirm.formatted}
            </div>
            {confirm.lat !== 0 && confirm.lng !== 0 && (
              <div style={{ fontSize: 10.5, color: '#7AAAB2', fontWeight: 600 }}>
                Your leads start 1 mile from this exact spot
              </div>
            )}
          </div>
          {confirm.lat !== 0 && confirm.lng !== 0 && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${confirm.lat},${confirm.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#FFC58A', textDecoration: 'none', fontWeight: 700, display: 'inline-block', marginBottom: 16 }}
            >
              Check the pin on Google Maps ↗
            </a>
          )}
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(255,248,240,0.6)', lineHeight: 1.55 }}>
            Your first {LEADS_PER_WEEK} homeowner leads pull from the streets around this exact point.
            <strong style={{ color: '#FFF8F0' }}> Is this the address you meant?</strong>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onConfirmAddress}
              disabled={checking}
              style={{
                flex: 1, padding: '15px 18px', borderRadius: 12,
                background: checking ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
                color: '#fff',
                fontWeight: 900, fontSize: 15, border: 'none',
                cursor: checking ? 'wait' : 'pointer', fontFamily: 'inherit',
                boxShadow: checking ? 'none' : '0 12px 30px rgba(232,116,43,0.40)',
              }}
            >
              {checking ? 'Opening checkout…' : "That's it — get my leads →"}
            </button>
            <button
              type="button"
              onClick={onEditAddress}
              style={{
                padding: '15px 18px', borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                color: '#FFC58A', fontWeight: 800, fontSize: 13,
                border: '1px solid rgba(255,157,90,0.3)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Edit
            </button>
          </div>
          {err && (
            <p style={{ fontSize: 12.5, color: '#FCA5A5', margin: '12px 0 0', fontWeight: 700 }}>
              ⚠ {err}
            </p>
          )}
        </div>
        )}

        {/* What fires on checkout — honesty strip */}
        <div style={{
          marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8,
        }}>
          {[
            { icon: '🧭', t: 'Closest homes first', s: 'owner-occupied, 1 mile out' },
            { icon: '🎯', t: 'Matched to your trade', s: 'system age + climate targeting' },
            { icon: '📞', t: 'Phones verified', s: 'real numbers, not guesses' },
            { icon: '⚡', t: `First ${LEADS_PER_WEEK} in ~30 min`, s: `then ${LEADS_PER_WEEK} every 7 days` },
          ].map((x) => (
            <div key={x.t} style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,157,90,0.14)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#FFC58A', marginBottom: 2 }}>{x.icon} {x.t}</div>
              <div style={{ fontSize: 9.5, color: 'rgba(255,248,240,0.4)' }}>{x.s}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes obLive { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        input::placeholder { color: rgba(255,248,240,0.25); }
      `}</style>
    </main>
  )
}

export default function StartAreaPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#081427' }} />}>
      <StartAreaContent />
    </Suspense>
  )
}

function FieldLabel({ n, label, done, mt }: { n: string; label: string; done: boolean; mt?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 7, marginTop: mt ? 16 : 0,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 900, color: done ? '#FF9D5A' : '#7AAAB2',
        letterSpacing: '0.08em',
      }}>{n}</span>
      <span style={{
        fontSize: 11, fontWeight: 900, color: done ? '#FFC58A' : 'rgba(255,248,240,0.6)',
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>{label}</span>
      {done && <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 900 }}>✓</span>}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10.5, color: 'rgba(255,248,240,0.4)', margin: '6px 0 0', lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

const darkInput: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: 10,
  border: '1px solid rgba(255,157,90,0.25)',
  background: 'rgba(4,12,24,0.6)',
  fontSize: 15, fontWeight: 600,
  fontFamily: 'inherit', color: '#FFF8F0',
  boxSizing: 'border-box', outline: 'none',
}

function tradeBtn(active: boolean): React.CSSProperties {
  return {
    padding: '11px 12px', borderRadius: 10,
    border: active ? '1.5px solid #FF9D5A' : '1px solid rgba(255,157,90,0.2)',
    background: active ? 'rgba(232,116,43,0.16)' : 'rgba(255,255,255,0.03)',
    fontWeight: 800, fontSize: 13, cursor: 'pointer',
    color: active ? '#FFC58A' : 'rgba(255,248,240,0.65)',
    textTransform: 'capitalize', fontFamily: 'inherit',
    boxShadow: active ? '0 0 16px rgba(232,116,43,0.22)' : 'none',
    transition: 'all 160ms ease',
  }
}
