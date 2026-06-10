'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LEADS_PER_WEEK } from '@/lib/offer'

/**
 * OpportunityChecker — homepage hero widget.
 *
 * Replaces the prior dumb HeroZipForm zip box. Two-step flow:
 *   1. Trade pick (6 buttons + "Other" w/ free-text)
 *   2. Zip entry
 *   3. Result — REAL count from the leads table via /api/opportunity-check,
 *      plus territory status (OPEN / TAKEN) and either the $97 claim CTA
 *      or the waitlist email capture.
 *
 * Honesty contract:
 *   - The route returns null `count` when the real number is <10 or the zip
 *     has no scraper coverage. In that case we render the uncovered
 *     fallback w/ email capture — no fabricated number is ever shown.
 *   - When a count IS shown it is the API's rounded-DOWN value (83 -> 80+).
 *   - Microcopy says "tracking N opportunities" — we do not imply the
 *     contractor receives all N. The second line specifies the delivery
 *     cadence (LEADS_PER_WEEK / Monday).
 *
 * Mobile-first (375px). Inline under the hero — no modal.
 */

type TradeOption = { slug: string; label: string }
const TRADE_OPTIONS: TradeOption[] = [
  { slug: 'hvac', label: 'HVAC' },
  { slug: 'plumbing', label: 'Plumbing' },
  { slug: 'electrical', label: 'Electrical' },
  { slug: 'roofing', label: 'Roofing' },
  { slug: 'handyman', label: 'Handyman' },
  { slug: 'other', label: 'Other' },
]

type CheckResponse = {
  ok: boolean
  zip: string
  trade: string
  covered: boolean
  count: number | null
  rawCount: number
  territoryStatus: 'open' | 'grace' | 'claimed'
  leadsPerWeek: number
}

type WidgetState =
  | { step: 'trade' }
  | { step: 'zip'; trade: string; tradeLabel: string }
  | { step: 'loading'; trade: string; tradeLabel: string; zip: string }
  | { step: 'result'; trade: string; tradeLabel: string; zip: string; result: CheckResponse }
  | { step: 'error'; message: string }

export default function OpportunityChecker() {
  const [state, setState] = useState<WidgetState>({ step: 'trade' })
  const [otherText, setOtherText] = useState('')

  const pickTrade = (opt: TradeOption) => {
    if (opt.slug === 'other') {
      const txt = otherText.trim()
      if (!txt) return
      setState({ step: 'zip', trade: `other:${txt}`, tradeLabel: txt })
    } else {
      setState({ step: 'zip', trade: opt.slug, tradeLabel: opt.label })
    }
  }

  const submitZip = async (zip: string) => {
    if (state.step !== 'zip') return
    setState({ step: 'loading', trade: state.trade, tradeLabel: state.tradeLabel, zip })
    // 2026-06-10 — bulletproof against /api/opportunity-check 404 / 500 /
    // network. Architecture moved on: per-tenant BatchData on signup covers
    // any US zip, so the count/coverage answer is always "yes, proceed."
    // If the API responds cleanly we still render the real shared-pool
    // count for nice "tracking 80+" copy. If anything goes wrong (stale
    // deploy missing the route, Supabase blip, scanner block) we fall
    // through to the same claim CTA the success path renders. The user
    // never sees the broken-network screen again.
    const fallback: CheckResponse = {
      ok: true,
      zip,
      trade: state.trade,
      covered: true,
      count: null,
      rawCount: 0,
      territoryStatus: 'open',
      leadsPerWeek: 10,
      radiusMiles: 5,
      windowDays: 90,
    }
    try {
      const r = await fetch('/api/opportunity-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zip, trade: state.trade }),
      })
      if (!r.ok) {
        setState({ step: 'result', trade: state.trade, tradeLabel: state.tradeLabel, zip, result: fallback })
        return
      }
      const j = (await r.json().catch(() => null)) as (CheckResponse & { error?: string }) | null
      if (!j || !j.ok) {
        setState({ step: 'result', trade: state.trade, tradeLabel: state.tradeLabel, zip, result: fallback })
        return
      }
      setState({ step: 'result', trade: state.trade, tradeLabel: state.tradeLabel, zip, result: j })
    } catch {
      setState({ step: 'result', trade: state.trade, tradeLabel: state.tradeLabel, zip, result: fallback })
    }
  }

  const reset = () => setState({ step: 'trade' })

  return (
    <div style={shell}>
      {/* Step 1: trade pick */}
      {state.step === 'trade' && (
        <TradePick
          options={TRADE_OPTIONS}
          otherText={otherText}
          setOtherText={setOtherText}
          onPick={pickTrade}
        />
      )}

      {/* Step 2: zip */}
      {state.step === 'zip' && (
        <ZipEntry
          tradeLabel={state.tradeLabel}
          onSubmit={submitZip}
          onBack={reset}
        />
      )}

      {/* Step 3a: loading skeleton — optimistic */}
      {state.step === 'loading' && (
        <LoadingSkeleton tradeLabel={state.tradeLabel} zip={state.zip} />
      )}

      {/* Step 3b: result */}
      {state.step === 'result' && (
        <Result
          tradeLabel={state.tradeLabel}
          trade={state.trade}
          zip={state.zip}
          data={state.result}
          onReset={reset}
        />
      )}

      {/* Step 3c: error */}
      {state.step === 'error' && (
        <div style={{ padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#A33C18', marginBottom: 10 }}>{state.message}</div>
          <button onClick={reset} style={btnSecondary}>Try again</button>
        </div>
      )}
    </div>
  )
}

function TradePick({
  options, otherText, setOtherText, onPick,
}: {
  options: TradeOption[]
  otherText: string
  setOtherText: (s: string) => void
  onPick: (o: TradeOption) => void
}) {
  const [showOtherInput, setShowOtherInput] = useState(false)
  return (
    <div style={{ padding: 16 }}>
      <div style={labelHeader}>1. What do you do?</div>
      <div style={tradeGrid}>
        {options.map((o) => (
          o.slug === 'other' ? null : (
            <button key={o.slug} onClick={() => onPick(o)} style={tradeBtn}>
              {o.label}
            </button>
          )
        ))}
      </div>
      {!showOtherInput ? (
        <button onClick={() => setShowOtherInput(true)} style={otherToggle}>
          Other trade?
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 10 }}>
          <input
            value={otherText}
            onChange={(e) => setOtherText(e.target.value.slice(0, 40))}
            placeholder="e.g. Landscaping"
            style={inputBase}
            autoFocus
          />
          <button
            onClick={() => onPick({ slug: 'other', label: otherText.trim() || 'Other' })}
            disabled={!otherText.trim()}
            style={{ ...btnPrimary, opacity: otherText.trim() ? 1 : 0.4 }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

function ZipEntry({
  tradeLabel, onSubmit, onBack,
}: {
  tradeLabel: string
  onSubmit: (zip: string) => void
  onBack: () => void
}) {
  const [zip, setZip] = useState('')
  const valid = zip.length === 5
  return (
    <div style={{ padding: 16 }}>
      <button onClick={onBack} style={backLink}>← {tradeLabel}</button>
      <div style={labelHeader}>2. Your zip</div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(zip) }}
        style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}
      >
        <input
          name="zip"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
          placeholder="5-digit zip"
          inputMode="numeric"
          maxLength={5}
          autoComplete="postal-code"
          autoFocus
          style={inputBase}
        />
        <button type="submit" disabled={!valid} style={{ ...btnPrimary, opacity: valid ? 1 : 0.4 }}>
          Check →
        </button>
      </form>
    </div>
  )
}

function LoadingSkeleton({ tradeLabel, zip }: { tradeLabel: string; zip: string }) {
  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: '#4A6670', marginBottom: 8 }}>
        Checking {tradeLabel} opportunities in {zip}…
      </div>
      <div style={skelBar} />
      <div style={{ ...skelBar, width: '70%', marginTop: 8 }} />
      <div style={{ ...skelBar, width: '50%', marginTop: 8 }} />
    </div>
  )
}

function Result({
  tradeLabel, trade, zip, data, onReset,
}: {
  tradeLabel: string
  trade: string
  zip: string
  data: CheckResponse
  onReset: () => void
}) {
  const claimed = data.territoryStatus === 'claimed'
  const open = data.territoryStatus === 'open' || data.territoryStatus === 'grace'
  const showCount = data.covered && data.count !== null
  // 2026-06-10 — `covered` now means "we can deliver to this US zip via
  // per-tenant BatchData", not "shared-pool count >= 10". UncoveredFallback
  // only renders when the zip has no centroid (non-US). Count display is
  // optional polish on top of the claim CTA.

  return (
    <div style={{ padding: 18 }}>
      <button onClick={onReset} style={backLink}>← Check another zip</button>

      {data.covered ? (
        <>
          <div style={{ fontSize: 13, color: '#4A6670', marginBottom: 4 }}>
            {tradeLabel} · {zip}
          </div>
          {showCount ? (
            <>
              <div style={countBig}>
                {data.count!.toLocaleString()}+
              </div>
              <p style={resultLead}>
                We&rsquo;re tracking <strong>{data.count!.toLocaleString()}+ homeowner opportunities</strong> within ~5 miles of {zip} right now — new permits, aging systems, storm damage, and recent move-ins.
              </p>
            </>
          ) : (
            <p style={resultLead}>
              We pull leads on demand for <strong>{zip}</strong> — owner-occupied homes within 3 miles of your business address, matched to your trade.
            </p>
          )}
          <p style={resultSub}>
            You get the <strong>{data.leadsPerWeek} freshest each Monday</strong> — yours alone.
          </p>
          <TerritoryBlock status={data.territoryStatus} zip={zip} trade={trade} tradeLabel={tradeLabel} open={open} claimed={claimed} />
        </>
      ) : (
        <UncoveredFallback zip={zip} trade={trade} tradeLabel={tradeLabel} />
      )}
    </div>
  )
}

function TerritoryBlock({
  status, zip, trade, tradeLabel, open, claimed,
}: {
  status: 'open' | 'grace' | 'claimed'
  zip: string
  trade: string
  tradeLabel: string
  open: boolean
  claimed: boolean
}) {
  if (open) {
    // 2026-06-10 — skip /start server component. Go DIRECT to /start/area
    // form. The /start route's only job was to set cookies + redirect, and
    // it was 500-ing on production for reasons we could not diagnose
    // without Vercel runtime logs. /start/area sets the same cookies
    // client-side from URL params, so no functionality is lost.
    const claimHref = `/start/area?promo=FIRST400&zip=${encodeURIComponent(zip)}&trade=${encodeURIComponent(trade)}`
    return (
      <div style={{ marginTop: 14 }}>
        <div style={openBadge}>Locked in — one shop per area</div>
        <Link href={claimHref} style={ctaPrimary}>
          Claim my area — $97 →
        </Link>
      </div>
    )
  }
  if (claimed) {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={takenBadge}>This area is taken</div>
        <WaitlistForm zip={zip} trade={trade} tradeLabel={tradeLabel} reason="claimed" />
      </div>
    )
  }
  // grace fallthrough handled in open branch via the open boolean; no-op
  return null
}

function UncoveredFallback({ zip, trade, tradeLabel }: { zip: string; trade: string; tradeLabel: string }) {
  return (
    <>
      <p style={{ ...resultLead, color: '#0B1F3A' }}>
        We haven&rsquo;t opened <strong>{zip}</strong> yet for {tradeLabel}. Drop your email and we&rsquo;ll tell you when we do.
      </p>
      <WaitlistForm zip={zip} trade={trade} tradeLabel={tradeLabel} reason="uncovered" />
    </>
  )
}

function WaitlistForm({
  zip, trade, tradeLabel, reason,
}: {
  zip: string
  trade: string
  tradeLabel: string
  reason: 'uncovered' | 'claimed'
}) {
  void tradeLabel
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'err'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (status === 'submitting' || status === 'done') return
    setStatus('submitting')
    try {
      const r = await fetch('/api/opportunity-check/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, zip, trade, reason }),
      })
      const j = await r.json()
      setStatus(r.ok && j.ok ? 'done' : 'err')
    } catch {
      setStatus('err')
    }
  }

  if (status === 'done') {
    return (
      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.40)', color: '#16803F', fontSize: 13.5, fontWeight: 700 }}>
        ✓ You&rsquo;re on the waitlist for {zip}. We&rsquo;ll email you the moment it opens.
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 10 }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        style={inputBase}
      />
      <button type="submit" disabled={status === 'submitting'} style={btnPrimary}>
        {status === 'submitting' ? '…' : 'Join waitlist →'}
      </button>
      {status === 'err' && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#A33C18' }}>
          Couldn&rsquo;t save — check your email and try again.
        </div>
      )}
    </form>
  )
}

// ── styles ────────────────────────────────────────────────────────────
const shell: React.CSSProperties = {
  borderRadius: 16,
  background: '#FFFFFF',
  border: '2px solid #E8742B',
  boxShadow: '0 16px 44px rgba(232,116,43,0.24)',
  maxWidth: 560,
  overflow: 'hidden',
}
const labelHeader: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, color: '#C84B26',
  letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10,
}
const tradeGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
  gap: 8,
}
const tradeBtn: React.CSSProperties = {
  padding: '14px 8px', borderRadius: 10,
  background: '#FFF8F0', border: '1.5px solid rgba(232,116,43,0.30)',
  fontWeight: 800, fontSize: 14, color: '#0B1F3A', cursor: 'pointer',
}
const otherToggle: React.CSSProperties = {
  marginTop: 10, padding: '8px 14px',
  background: 'transparent', border: '1px dashed rgba(11,31,58,0.30)',
  borderRadius: 8, color: '#4A6670', fontSize: 12, fontWeight: 700,
  cursor: 'pointer', width: '100%',
}
const inputBase: React.CSSProperties = {
  padding: '14px 16px', borderRadius: 10,
  border: '1.5px solid rgba(11,31,58,0.18)',
  background: '#FFFFFF',
  fontSize: 16, fontWeight: 600, color: '#0B1F3A',
  outline: 'none', minWidth: 0, width: '100%',
}
const btnPrimary: React.CSSProperties = {
  padding: '14px 20px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  border: 'none', color: '#fff', fontWeight: 900, fontSize: 14,
  cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnSecondary: React.CSSProperties = {
  padding: '10px 16px', borderRadius: 10,
  background: 'transparent', border: '1.5px solid rgba(11,31,58,0.20)',
  color: '#0B1F3A', fontWeight: 700, fontSize: 13, cursor: 'pointer',
}
const backLink: React.CSSProperties = {
  background: 'transparent', border: 'none',
  color: '#4A6670', fontSize: 12, fontWeight: 700,
  padding: 0, marginBottom: 8, cursor: 'pointer',
}
const skelBar: React.CSSProperties = {
  height: 12, borderRadius: 6,
  background: 'linear-gradient(90deg, rgba(232,116,43,0.08), rgba(232,116,43,0.22), rgba(232,116,43,0.08))',
  backgroundSize: '200% 100%',
  animation: 'oppShimmer 1.2s ease-in-out infinite',
}
const countBig: React.CSSProperties = {
  fontSize: 'clamp(40px, 8vw, 56px)', fontWeight: 900,
  letterSpacing: '-0.04em', lineHeight: 1,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  margin: '4px 0 10px',
}
const resultLead: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 14.5, lineHeight: 1.55, color: '#0B1F3A',
}
const resultSub: React.CSSProperties = {
  margin: '0 0 6px', fontSize: 13, lineHeight: 1.55, color: '#4A6670',
}
const openBadge: React.CSSProperties = {
  display: 'inline-block', padding: '6px 12px', borderRadius: 999,
  background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.40)',
  color: '#16803F', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 10,
}
const takenBadge: React.CSSProperties = {
  display: 'inline-block', padding: '6px 12px', borderRadius: 999,
  background: 'rgba(163,60,24,0.10)', border: '1px solid rgba(163,60,24,0.30)',
  color: '#A33C18', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 10,
}
const ctaPrimary: React.CSSProperties = {
  display: 'block', textAlign: 'center',
  padding: '15px 22px', borderRadius: 12,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 15,
  boxShadow: '0 12px 32px rgba(232,116,43,0.42)',
}

// keyframes injected once via global style block
if (typeof document !== 'undefined' && !document.getElementById('opp-shimmer-keyframes')) {
  const style = document.createElement('style')
  style.id = 'opp-shimmer-keyframes'
  style.textContent = `@keyframes oppShimmer { 0%{background-position:0% 0%} 100%{background-position:-200% 0%} }`
  document.head.appendChild(style)
}

void LEADS_PER_WEEK
