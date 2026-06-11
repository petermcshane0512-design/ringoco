'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LEADS_PER_WEEK, INTRO_PRICE_USD, INTRO_PROMO_CODE } from '@/lib/offer'
import AddressAutocomplete from '@/components/AddressAutocomplete'

/**
 * /start/area — THE onboarding. 2026-06-10 dark AI-console rewrite per
 * Peter: customers should think "whoa, their AI UI is insane" from the
 * first screen, not just after payment.
 *
 * Design system matches LeadScanConsole + the /dashboard/leads command
 * center: #060D18→#0B1F3A shell, teal/emerald accents, monospace status
 * text, glowing active states. The form reads as "arming the scan":
 * numbered TARGET / SECTOR / TRADE / HOTLINE steps, live agents-ready
 * strip, geocode confirm rendered as a target-lock card.
 *
 * Flow (frictionless — no account before payment):
 *   submit → geocode preview → confirm pin → POST /api/stripe/checkout
 *   (anonymous OK) → Stripe → webhook mints Clerk user + pulls first
 *   leads → /checkout/return auto-signs in → /dashboard/leads.
 *
 * Logic preserved exactly from prior rev: cookie persistence + prefill,
 * URL-param prefill from the homepage widget, ?autoco=1 auto-resume,
 * all field validations, geocode-preview fail-soft. Dead territory/
 * waitlist code DELETED (one-shop-per-zip gate retired earlier today —
 * the branch was unreachable).
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

const TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const

function StartAreaContent() {
  const sp = useSearchParams()
  const promo = (sp?.get('promo') || INTRO_PROMO_CODE).trim().toUpperCase()
  const bizId = (sp?.get('b') || '').trim()
  const autoco = sp?.get('autoco') === '1'

  const [zip, setZip] = useState('')
  const [trade, setTrade] = useState<string>('')
  const [otherTradeText, setOtherTradeText] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [checking, setChecking] = useState(false)
  const [err, setErr] = useState('')
  // Geocode pin-confirm gate — catches typos that would otherwise burn
  // BatchData spend and deliver leads in the wrong neighborhood.
  const [confirm, setConfirm] = useState<null | { formatted: string; lat: number; lng: number }>(null)

  // Prefill from cookies (prior visit / homepage widget) or URL params.
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
    if (!/^\d{5}$/.test(zip)) {
      setErr('Enter a 5-digit zip code.')
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
    setChecking(true)
    writeCookie(AREA_ZIP_COOKIE, zip)
    writeCookie(AREA_TRADE_COOKIE, trade)
    writeCookie(AREA_ADDR_COOKIE, address.trim())
    writeCookie(AREA_PHONE_COOKIE, phoneDigits)
    try {
      const gr = await fetch('/api/geocode-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      })
      const gj = await gr.json().catch(() => ({}))
      if (gj.ok) {
        setConfirm({ formatted: gj.formatted, lat: gj.lat, lng: gj.lng })
      } else {
        // Fail-soft: never block the sale on a geocode hiccup. Webhook
        // re-attempts geocoding post-payment.
        setErr('We could not verify that address with Google Maps. Double-check spelling, or proceed if you are sure.')
        setConfirm({ formatted: address.trim(), lat: 0, lng: 0 })
      }
    } catch {
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
    zip: /^\d{5}$/.test(zip),
    trade: !!trade && trade !== 'other' && !(trade.startsWith('other:') && trade.slice(6).trim().length === 0),
    phone: phone.replace(/\D/g, '').length >= 10,
  }
  const armedCount = Object.values(stepDone).filter(Boolean).length

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #060D18 0%, #0B1F3A 60%, #081B26 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#E6FFFA',
      padding: '0 0 60px',
    }}>
      {/* Console title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px clamp(14px, 4vw, 28px)',
        background: 'rgba(6,13,24,0.88)',
        borderBottom: '1px solid rgba(94,234,212,0.14)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>🛰️</span>
          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', color: '#5EEAD4', textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>
            BellAveGo Intelligence
          </span>
        </Link>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 900, color: '#34D399', letterSpacing: '0.12em', fontFamily: 'ui-monospace, monospace' }}>
          <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399', display: 'inline-block', animation: 'obLive 1s ease-in-out infinite' }} />
          24 SCOUTS STANDING BY
        </span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '28px clamp(14px, 4vw, 28px) 0' }}>
        <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 34px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 8px', color: '#F0FDFA' }}>
          Aim the scan at your shop.
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(230,255,250,0.55)', lineHeight: 1.6, margin: '0 0 20px' }}>
          The moment you check out, our scouts geocode this address and pull your first{' '}
          <strong style={{ color: '#5EEAD4' }}>{LEADS_PER_WEEK} homeowner leads</strong> starting{' '}
          <strong style={{ color: '#5EEAD4' }}>1 mile</strong> from your front door — widening only when
          nearby supply runs low. {LEADS_PER_WEEK} more every 7 days.
        </p>

        {/* Arm-progress strip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
          fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: 'rgba(94,234,212,0.6)',
        }}>
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: `${(armedCount / 4) * 100}%`, height: '100%',
              background: 'linear-gradient(90deg, #34D399, #5EEAD4)',
              transition: 'width 300ms ease',
              boxShadow: '0 0 12px rgba(52,211,153,0.6)',
            }} />
          </div>
          <span style={{ flexShrink: 0, fontWeight: 800 }}>{armedCount}/4 ARMED</span>
        </div>

        {!confirm ? (
        <form onSubmit={onCheck} style={{
          padding: 'clamp(16px, 3vw, 24px)', borderRadius: 16,
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(94,234,212,0.16)',
          boxShadow: '0 24px 60px rgba(4,12,24,0.5)',
        }}>
          {/* 01 TARGET — business address (the lead-targeting anchor) */}
          <FieldLabel n="01" label="Target address" done={stepDone.address} />
          <AddressAutocomplete
            value={address}
            onChange={setAddress}
            placeholder="Start typing — pick your address from the list"
            inputStyle={darkInput}
            autoFocus
          />
          <Hint>Pick from the dropdown so we lock your exact spot. Leads pull as close as possible — 1-mile rings, widening on supply only.</Hint>

          {/* 02 SECTOR — zip */}
          <FieldLabel n="02" label="Sector zip" done={stepDone.zip} mt />
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="60643"
            inputMode="numeric"
            maxLength={5}
            style={darkInput}
          />

          {/* 03 TRADE — recipe selector */}
          <FieldLabel n="03" label="Trade recipe" done={stepDone.trade} mt />
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
          <Hint>Each trade gets its own AI recipe — system age, pipe era, roof window — tuned to your climate.</Hint>

          {/* 04 HOTLINE — cell */}
          <FieldLabel n="04" label="Alert hotline" done={stepDone.phone} mt />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(773) 555-0100"
            inputMode="tel"
            style={darkInput}
            autoComplete="tel"
          />
          <Hint>We text this number the second a homeowner shows real interest. No other use.</Hint>

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
            {checking ? '▸ locking target…' : `Lock my area — $${INTRO_PRICE_USD} →`}
          </button>

          <p style={{ fontSize: 11, color: 'rgba(230,255,250,0.4)', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
            ${INTRO_PRICE_USD} first month with code {promo} · First {LEADS_PER_WEEK} leads land ~30 min after checkout · Cancel anytime
          </p>
        </form>
        ) : (
        /* TARGET-LOCK confirm card */
        <div style={{
          padding: 'clamp(18px, 3vw, 26px)', borderRadius: 16,
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(52,211,153,0.45)',
          boxShadow: '0 24px 60px rgba(4,12,24,0.5), 0 0 40px rgba(52,211,153,0.10)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 900, color: '#34D399', letterSpacing: '0.16em',
            textTransform: 'uppercase', marginBottom: 12, fontFamily: 'ui-monospace, monospace',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <i style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', display: 'inline-block', animation: 'obLive 1s ease-in-out infinite' }} />
            TARGET LOCKED — CONFIRM COORDINATES
          </div>
          <div style={{
            padding: '16px 18px', borderRadius: 12,
            background: 'rgba(2,8,16,0.7)',
            border: '1px solid rgba(94,234,212,0.18)',
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#F0FDFA', marginBottom: 4 }}>
              📍 {confirm.formatted}
            </div>
            {confirm.lat !== 0 && confirm.lng !== 0 && (
              <div style={{ fontSize: 10.5, color: 'rgba(94,234,212,0.55)', fontFamily: 'ui-monospace, monospace' }}>
                {confirm.lat.toFixed(5)}, {confirm.lng.toFixed(5)} · scan rings start 1 mi out
              </div>
            )}
          </div>
          {confirm.lat !== 0 && confirm.lng !== 0 && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${confirm.lat},${confirm.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#5EEAD4', textDecoration: 'none', fontWeight: 700, display: 'inline-block', marginBottom: 16 }}
            >
              🗺 Verify pin on Google Maps ↗
            </a>
          )}
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(230,255,250,0.55)', lineHeight: 1.55 }}>
            Your first {LEADS_PER_WEEK} homeowner leads pull from the rings around this exact point.
            <strong style={{ color: '#F0FDFA' }}> Is this the address you meant?</strong>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onConfirmAddress}
              disabled={checking}
              style={{
                flex: 1, padding: '15px 18px', borderRadius: 12,
                background: checking ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #34D399, #0D9488)',
                color: checking ? 'rgba(230,255,250,0.5)' : '#06241C',
                fontWeight: 900, fontSize: 15, border: 'none',
                cursor: checking ? 'wait' : 'pointer', fontFamily: 'inherit',
                boxShadow: checking ? 'none' : '0 12px 30px rgba(52,211,153,0.35)',
              }}
            >
              {checking ? '▸ opening checkout…' : 'Confirmed — start the scan →'}
            </button>
            <button
              type="button"
              onClick={onEditAddress}
              style={{
                padding: '15px 18px', borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                color: '#A7F3D0', fontWeight: 800, fontSize: 13,
                border: '1px solid rgba(94,234,212,0.25)', cursor: 'pointer', fontFamily: 'inherit',
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
            { icon: '🧭', t: 'Geocode + ring scan', s: 'owner-occupied parcels, 1 mi out' },
            { icon: '🧬', t: 'Trade-aware AI recipe', s: 'climate-tuned system-age windows' },
            { icon: '📞', t: 'Phones verified', s: 'skip-traced before they reach you' },
            { icon: '⚡', t: `First ${LEADS_PER_WEEK} in ~30 min`, s: `then ${LEADS_PER_WEEK} every 7 days` },
          ].map((x) => (
            <div key={x.t} style={{
              padding: '10px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(94,234,212,0.10)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#A7F3D0', marginBottom: 2 }}>{x.icon} {x.t}</div>
              <div style={{ fontSize: 9.5, color: 'rgba(230,255,250,0.35)' }}>{x.s}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes obLive { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        input::placeholder { color: rgba(230,255,250,0.25); }
      `}</style>
    </main>
  )
}

export default function StartAreaPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', background: '#060D18' }} />}>
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
        fontSize: 9.5, fontWeight: 900, color: done ? '#34D399' : 'rgba(94,234,212,0.45)',
        fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em',
      }}>{n}</span>
      <span style={{
        fontSize: 11, fontWeight: 900, color: done ? '#A7F3D0' : 'rgba(230,255,250,0.6)',
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>{label}</span>
      {done && <span style={{ fontSize: 10, color: '#34D399', fontWeight: 900 }}>✓</span>}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10.5, color: 'rgba(230,255,250,0.35)', margin: '6px 0 0', lineHeight: 1.5 }}>
      {children}
    </p>
  )
}

const darkInput: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: 10,
  border: '1px solid rgba(94,234,212,0.2)',
  background: 'rgba(2,8,16,0.6)',
  fontSize: 15, fontWeight: 600,
  fontFamily: 'inherit', color: '#F0FDFA',
  boxSizing: 'border-box', outline: 'none',
}

function tradeBtn(active: boolean): React.CSSProperties {
  return {
    padding: '11px 12px', borderRadius: 10,
    border: active ? '1.5px solid #34D399' : '1px solid rgba(94,234,212,0.18)',
    background: active ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
    fontWeight: 800, fontSize: 13, cursor: 'pointer',
    color: active ? '#34D399' : 'rgba(230,255,250,0.65)',
    textTransform: 'capitalize', fontFamily: 'inherit',
    boxShadow: active ? '0 0 16px rgba(52,211,153,0.20)' : 'none',
    transition: 'all 160ms ease',
  }
}
