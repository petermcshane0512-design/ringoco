'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LEADS_PER_WEEK, LEADS_PER_MONTH, PRICE_PER_LEAD_INTRO_USD } from '@/lib/offer'
import LiveLeadFeed from '@/components/LiveLeadFeed'
import LeadMap from '@/components/LeadMap'

/**
 * /free-lead?b={biz_id} — cold-email landing page.
 *
 * Reveals the pre-pulled homeowner lead in 8 seconds (anticipation theater)
 * then asks for the $97 trial. Designed to convert at 25-30% open → click,
 * 30% click → checkout per the 2.7% Hormozi/Elon system target.
 *
 * SINGLE CTA. NO NAV. NO FOOTER. No competing eye paths. Hormozi:
 * "every additional choice on the page costs you 5%."
 *
 * Server-side data flow:
 *   1. Page load → fetch /api/free-lead/claim?b={biz_id}
 *   2. Show "PULLING YOUR LEAD..." spinner for 8 sec (real fetch < 1s)
 *   3. Reveal full lead (name, address, phone, signal, est value, AI script preview)
 *   4. Single ORANGE CTA: "Lock this zip — $97" → Stripe via /start?promo=FIRST400&b={biz_id}
 */

export const dynamic = 'force-dynamic'

const FOUNDER_PHONE = '(773) 710-9565'
const FOUNDER_PHONE_HREF = 'tel:+17737109565'

type AiIntel = {
  job_summary: string
  est_value_line: string
  outreach_script: string
  why_you: string
  property_note: string
}

type LeadDTO = {
  owner: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  phone: string | null
  phone_redacted?: boolean
  email: string | null
  year_built: number | null
  value: number | null
  signal: string | null
  signal_detail: string | null
  est_job_min: number | null
  est_job_max: number | null
  trade: string | null
  ai_intel?: AiIntel | null
  lat?: number | null
  lng?: number | null
}

type ProspectCtx = {
  city: string
  state: string
  trade: string
  business_name: string
  visit_count: number
  last_visited_at: string | null
}

function FreeLeadInner() {
  const params = useSearchParams()
  const bizId = params.get('b') || ''
  const [lead, setLead] = useState<LeadDTO | null>(null)
  // 2026-06-13 — prospect-side context for the idle-state personalization
  // (city / trade / business_name) + return-visit detection. Pulled via
  // /api/free-lead/claim on mount. Visit-count bump only happens on
  // POST /generate (human-gated button), so this read-only GET is safe
  // against email scanners that auto-fetch every URL.
  const [prospect, setProspect] = useState<ProspectCtx | null>(null)
  // 2026-06-10 — Fable 5 architectural fix: no auto-fire on page load.
  // Email scanners (SafeLinks/Barracuda/Mimecast) auto-GET every URL.
  // Generation only fires when the human presses the button below.
  const [phase, setPhase] = useState<'idle' | 'generating' | 'revealed' | 'area_not_open' | 'error'>('idle')
  const [progressLabel, setProgressLabel] = useState('Searching permits…')
  // 2026-06-15 — one-tap copy for the AI outreach script. Resets after 2s.
  const [scriptCopied, setScriptCopied] = useState(false)

  // Prefetch the prospect record so the idle copy can be personalized
  // before they press Generate. Fire-and-forget — the idle state still
  // renders if this call fails or 404s.
  useEffect(() => {
    if (!bizId) return
    let active = true
    fetch(`/api/free-lead/claim?b=${encodeURIComponent(bizId)}`)
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; prospect?: ProspectCtx } | null) => {
        if (!active) return
        if (j?.ok && j.prospect) setProspect(j.prospect)
      })
      .catch(() => {})
    return () => { active = false }
  }, [bizId])

  async function onGenerate() {
    if (!bizId) {
      setPhase('error')
      return
    }
    setPhase('generating')
    // Real progress narrative — message cycles as BatchData runs.
    // Fable 5: "Show real progress narrative, reveal moment ready. Theater
    // is fake scarcity in a new costume."
    const messages = [
      'Searching permits…',
      'Checking property records…',
      'Filtering by your trade…',
      'Scoring intent signals…',
      'Almost there…',
    ]
    let idx = 0
    const ticker = setInterval(() => {
      idx = Math.min(messages.length - 1, idx + 1)
      setProgressLabel(messages[idx])
    }, 2200)

    try {
      const r = await fetch(`/api/free-lead/generate?b=${encodeURIComponent(bizId)}`, { method: 'POST' })
      clearInterval(ticker)
      const j = await r.json().catch(() => ({ ok: false }))
      if (j.ok && j.lead) {
        setLead(j.lead as LeadDTO)
        setPhase('revealed')
      } else if (!j.ok && j.error === 'area_not_open') {
        setPhase('area_not_open')
      } else {
        setPhase('error')
      }
    } catch {
      clearInterval(ticker)
      setPhase('error')
    }
  }

  const checkoutUrl = bizId
    ? `/start?promo=FIRST400&b=${encodeURIComponent(bizId)}`
    : `/start?promo=FIRST400`

  return (
    <main style={shellStyle}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,248,240,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(232,116,43,0.18)', padding: '10px clamp(16px, 4vw, 32px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Image src="/logo.png" alt="BellAveGo" width={220} height={68} priority style={{ objectFit: 'contain', maxWidth: 'min(46vw, 220px)', height: 'auto' }} />
        </Link>
        <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', textDecoration: 'none', fontWeight: 800, fontSize: 14 }}>
          📞 {FOUNDER_PHONE}
        </a>
      </div>

      {/* Real lead-discovery events (no links — does not compete with the
          single CTA). Proof the machine is live while the prospect decides. */}
      <LiveLeadFeed />

      <section style={{ padding: 'clamp(28px, 5vw, 56px) clamp(16px, 5vw, 40px)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {/* PHASE 1 — IDLE (human-gated button) */}
          {phase === 'idle' && (
            <div style={cardPulling}>
              {/* 2026-06-13 — return-visit variant. If they've been here
                  before (visit_count >= 1), pivot the eyebrow + headline
                  to a "welcome back" urgency frame. Most shops grab the
                  lead within the first hour; sitting on it cools it. */}
              {prospect && prospect.visit_count >= 1 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                    👋 Welcome back — your lead's still here
                  </div>
                  <h1 style={pullingH1}>
                    {prospect.city
                      ? <>Your <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{prospect.city}</span> homeowner is still unclaimed.</>
                      : <>Your homeowner lead is still unclaimed.</>}
                  </h1>
                  <p style={{ fontSize: 14.5, color: '#4A6670', margin: '0 0 24px', lineHeight: 1.55 }}>
                    Most shops grab theirs within the first hour. Yours has been waiting{prospect.last_visited_at ? ` since you last looked` : ''}.
                    {' '}Tap below — same lead, fresh details. Phone unlocked on the $97 trial.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#16803F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                    🎁 Your free homeowner lead is waiting
                  </div>
                  <h1 style={pullingH1}>
                    {prospect && (prospect.city || prospect.trade) ? (
                      <>One real <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{prospect.city || 'local'}</span> homeowner who needs <span style={{ textTransform: 'capitalize' }}>{prospect.trade || 'your'}</span> work. On me.</>
                    ) : (
                      <>One real homeowner in your service area. On me.</>
                    )}
                  </h1>
                  <p style={{ fontSize: 14.5, color: '#4A6670', margin: '0 0 24px', lineHeight: 1.55 }}>
                    Name, address, year built, est. job value, signal that surfaced them.
                    Phone number redacted on free lead — full unlock on the $97 trial.
                    Yours regardless. No catch.
                  </p>
                </>
              )}

              <button
                type="button"
                onClick={onGenerate}
                className="bavg-cta-sheen"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%',
                  padding: '20px 32px', borderRadius: 14,
                  background: 'linear-gradient(135deg, #22C55E 0%, #16803F 100%)',
                  color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em',
                  boxShadow: '0 14px 36px rgba(34,197,94,0.40)',
                  fontFamily: 'inherit',
                  position: 'relative', overflow: 'hidden',
                }}
              >Generate My Free Lead →</button>
              <p style={{ fontSize: 11.5, color: '#7AAAB2', textAlign: 'center', margin: '12px 0 0' }}>
                Takes ~20 seconds · One free lead per email
              </p>
            </div>
          )}

          {/* PHASE 1B — GENERATING (after button click) */}
          {phase === 'generating' && (
            <div style={cardPulling}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#16803F', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                🔍 Pulling your free homeowner lead…
              </div>
              <h1 style={pullingH1}>{progressLabel}</h1>
              <p style={{ fontSize: 13.5, color: '#7AAAB2', margin: '4px 0 0', fontFamily: 'ui-monospace, monospace' }}>
                Scanning live city records in your area…
              </p>
              <div style={{ marginTop: 22, display: 'flex', gap: 8, justifyContent: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8742B', animation: 'fl-pulse 1.2s infinite 0s' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8742B', animation: 'fl-pulse 1.2s infinite 0.2s' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E8742B', animation: 'fl-pulse 1.2s infinite 0.4s' }} />
              </div>
              <style>{`@keyframes fl-pulse { 0%, 80%, 100% { opacity: 0.3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-4px); } }`}</style>
            </div>
          )}

          {/* PHASE 2 — REVEALED: the DEMO DASHBOARD (2026-06-11 per Peter:
              free lead opens a demo dashboard; clicking anything sells the
              weekly/monthly lead package). Dark shell identical to the real
              /dashboard/leads, their free lead pinned on the map as lead #1,
              the rest of the weekly batch shown as locked rows behind the
              trial. Every locked element routes to checkout. */}
          {phase === 'revealed' && lead && (
            <div>
              <div style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 99, background: 'rgba(34,197,94,0.16)', color: '#16803F', fontSize: 11, fontWeight: 900, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 16 }}>
                ✓ Your free lead is ready
              </div>
              <h1 style={revealH1}>
                This is your dashboard. Lead #1 is <span style={{ background: 'linear-gradient(135deg, #FF9D5A, #C84B26)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>real</span>.
              </h1>
              <p style={{ fontSize: 15, color: '#4A6670', margin: '0 0 24px', lineHeight: 1.55 }}>
                One real homeowner in {lead.zip || 'your area'} — yours to call today, no catch.
                Leads #2–{LEADS_PER_WEEK} unlock the second you start.
              </p>

              {/* ── DEMO DASHBOARD SHELL — 2026-06-12 light theme to match the
                  real /dashboard (now light). Same surface the prospect logs
                  into, so the homepage promise === the product. ── */}
              <div style={{
                borderRadius: 16, overflow: 'hidden', marginBottom: 24,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                color: '#1f2937',
              }}>
                {/* Demo top bar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: '1px solid #e5e7eb',
                  background: '#ffffff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '-0.02em', color: '#1f2937' }}>BellAveGo</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 800, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
                      Live
                    </span>
                  </div>
                  <Link href={checkoutUrl} style={{
                    padding: '8px 12px', borderRadius: 8, textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center',
                    background: '#E8742B',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                  }}>Buy more leads</Link>
                </div>

                <div style={{ padding: '14px 14px 16px' }}>
                  {/* Demo banner — the offer */}
                  <Link href={checkoutUrl} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                      background: 'linear-gradient(135deg, #fef3ec, #ffffff)',
                      border: '1px solid #fed7aa',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#c2410c', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>
                          Start your account
                        </div>
                        <div style={{ fontSize: 'clamp(18px, 3vw, 23px)', fontWeight: 800, color: '#1f2937', lineHeight: 1.1 }}>
                          Get {LEADS_PER_MONTH} leads like this a month
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>
                        {LEADS_PER_WEEK}/week · $97 to start →
                      </div>
                    </div>
                  </Link>

                  {/* Map — their free lead pinned. Real coordinates only. */}
                  {typeof lead.lat === 'number' && typeof lead.lng === 'number' && (
                    <div style={{ marginBottom: 12 }}>
                      <LeadMap
                        businessLat={lead.lat}
                        businessLng={lead.lng}
                        hideShopPin
                        leads={[{
                          id: 'free-lead',
                          lat: lead.lat,
                          lng: lead.lng,
                          label: '1',
                          title: [lead.street, lead.city].filter(Boolean).join(', ') || lead.zip || 'Your free lead',
                          hasPhone: true,
                        }]}
                        onPinClick={() => {
                          document.getElementById('free-lead-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }}
                      />
                      <p style={{ fontSize: 11, color: '#6b7280', margin: '6px 2px 0', fontWeight: 500 }}>
                        📍 Pin 1 = your free lead. Your other {LEADS_PER_WEEK - 1} this week pin here the moment you start.
                      </p>
                    </div>
                  )}

                  {/* Locked rows #2-N — every click goes to checkout */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {Array.from({ length: LEADS_PER_WEEK - 1 }, (_, i) => i + 2).map((n) => (
                      <Link key={n} href={checkoutUrl} style={{ textDecoration: 'none', display: 'block' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '11px 13px', borderRadius: 10,
                          background: '#f9fafb',
                          border: '1px dashed #d1d5db',
                        }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: '#fff', border: '1px solid #e5e7eb',
                            color: '#9ca3af', fontSize: 9.5, fontWeight: 900,
                          }}>{n}</span>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                            🔒 Lead #{n} — verified homeowner near {lead.zip || 'you'}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#c2410c', whiteSpace: 'nowrap' }}>
                            Unlock — $97 →
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lead card — the REAL free lead detail */}
              <div id="free-lead-card" style={leadCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.02em' }}>{lead.owner || 'Homeowner'}</div>
                    <div style={{ fontSize: 13, color: '#4A6670', marginTop: 4 }}>
                      {lead.street ? `${lead.street} · ` : ''}{lead.city} {lead.state} {lead.zip}
                    </div>
                  </div>
                  {lead.trade && (
                    <span style={tradePill}>{lead.trade.toUpperCase()}</span>
                  )}
                </div>

                {/* 2026-06-15 — phone is now un-redacted on the free lead.
                    Big tap-to-call so the prospect can call the homeowner
                    immediately from their phone. Prominent, above the fold
                    of the card. */}
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      textDecoration: 'none',
                      padding: '14px 16px', borderRadius: 12, marginBottom: 16,
                      background: 'linear-gradient(135deg, #22C55E 0%, #16803F 100%)',
                      color: '#fff',
                      boxShadow: '0 12px 30px rgba(34,197,94,0.34)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.78)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Homeowner phone — tap to call</div>
                      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em' }}>{lead.phone}</div>
                    </div>
                    <span style={{ fontSize: 26, flexShrink: 0 }}>📞</span>
                  </a>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 18 }}>
                  {lead.signal && (
                    <KV label="Signal" value={`${signalEmoji(lead.signal)} ${lead.signal.replace('_', '-')}`} />
                  )}
                  {lead.year_built && (
                    <KV label="Year built" value={`${lead.year_built}`} />
                  )}
                  {lead.value && (
                    <KV label="Est. home value" value={`$${Math.round(Number(lead.value)).toLocaleString()}`} />
                  )}
                </div>

                {lead.signal_detail && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(232,116,43,0.10)', fontSize: 13.5, color: '#C84B26', fontWeight: 700, marginBottom: 14 }}>
                    🔥 {lead.signal_detail}
                  </div>
                )}

                {(lead.est_job_min || lead.est_job_max) && (
                  <div style={{ padding: '14px 16px', borderRadius: 11, background: 'linear-gradient(135deg, #FFD9A8, #FFF8F0)', border: '1.5px solid rgba(232,116,43,0.30)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#0B1F3A', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Est. job value</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#C84B26' }}>
                      ${(Number(lead.est_job_min) || 0).toLocaleString()} – ${(Number(lead.est_job_max) || 0).toLocaleString()}
                    </div>
                  </div>
                )}

                {/* 2026-06-15 — AI lead packet (ai_intel). Rich, organized
                    brief so the prospect can work the lead the second they
                    see it: what the job is, the word-for-word script, and
                    why their shop is the fit. Guarded — older cached leads
                    have ai_intel === null. */}
                {lead.ai_intel && (
                  <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* 📋 The job */}
                    <div style={aiSection}>
                      <div style={aiSectionLabel}>📋 The job</div>
                      {lead.ai_intel.job_summary && (
                        <p style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.55, margin: '0 0 10px' }}>
                          {lead.ai_intel.job_summary}
                        </p>
                      )}
                      {lead.ai_intel.est_value_line && (
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#16803F', lineHeight: 1.5, margin: '0 0 8px' }}>
                          💰 {lead.ai_intel.est_value_line}
                        </div>
                      )}
                      {lead.ai_intel.property_note && (
                        <div style={{ fontSize: 13, color: '#4A6670', lineHeight: 1.5, margin: 0 }}>
                          🏠 {lead.ai_intel.property_note}
                        </div>
                      )}
                    </div>

                    {/* 📞 What to say when you call */}
                    {lead.ai_intel.outreach_script && (
                      <div style={aiSection}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                          <div style={{ ...aiSectionLabel, marginBottom: 0 }}>📞 What to say when you call</div>
                          <button
                            type="button"
                            onClick={() => {
                              const text = lead.ai_intel?.outreach_script || ''
                              navigator.clipboard?.writeText(text).then(
                                () => {
                                  setScriptCopied(true)
                                  setTimeout(() => setScriptCopied(false), 2000)
                                },
                                () => {},
                              )
                            }}
                            style={{
                              flexShrink: 0,
                              padding: '7px 12px', borderRadius: 8, minHeight: 36,
                              background: scriptCopied ? 'rgba(34,197,94,0.16)' : 'rgba(11,31,58,0.06)',
                              color: scriptCopied ? '#16803F' : '#0B1F3A',
                              border: 'none', cursor: 'pointer',
                              fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
                              letterSpacing: '0.02em',
                            }}
                          >{scriptCopied ? '✓ Copied' : '📋 Copy'}</button>
                        </div>
                        <div style={{
                          padding: '14px 16px', borderRadius: 10,
                          background: '#0B1F3A',
                          borderLeft: '4px solid #E8742B',
                          color: '#E8F0F2',
                          fontSize: 14, lineHeight: 1.6,
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {lead.ai_intel.outreach_script}
                        </div>
                      </div>
                    )}

                    {/* ✅ Why your shop */}
                    {lead.ai_intel.why_you && (
                      <div style={aiSection}>
                        <div style={aiSectionLabel}>✅ Why your shop</div>
                        <p style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.55, margin: 0 }}>
                          {lead.ai_intel.why_you}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2026-06-10 — "Your math" widget. Per Peter's strategy line
                  ("they come to website to see were gonna make them money").
                  Turns the abstract job-value range into a concrete monthly
                  gross projection using the actual offer constants. Renders
                  ONLY when we have a real job-value range — no fake math. */}
              {(() => {
                const min = Number(lead.est_job_min) || 0
                const max = Number(lead.est_job_max) || 0
                if (!min && !max) return null
                const avgJob = Math.round((min + max) / 2)
                const monthlyLeads = LEADS_PER_MONTH
                const CONSERVATIVE_CLOSE_RATE = 0.05
                const STANDARD_CLOSE_RATE = 0.10
                const conservativeJobs = Math.max(1, Math.round(monthlyLeads * CONSERVATIVE_CLOSE_RATE))
                const standardJobs = Math.max(1, Math.round(monthlyLeads * STANDARD_CLOSE_RATE))
                const conservativeGross = conservativeJobs * avgJob
                const standardGross = standardJobs * avgJob
                const cost = 497
                const conservativeNet = conservativeGross - cost
                const standardNet = standardGross - cost
                return (
                  <div style={{
                    marginTop: 14,
                    padding: '18px 20px',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
                    color: '#fff',
                    boxShadow: '0 14px 36px rgba(11,31,58,0.20)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Your math on leads like this
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                      <strong style={{ color: '#FFD9A8', fontSize: 16 }}>${avgJob.toLocaleString()}</strong> = average install at this address.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 10 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>
                          Conservative ({Math.round(CONSERVATIVE_CLOSE_RATE * 100)}% close)
                        </div>
                        <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5 }}>
                          {monthlyLeads} leads × {conservativeJobs} closes
                          <br />
                          <strong style={{ fontSize: 18, color: '#5EEAD4' }}>${conservativeGross.toLocaleString()}/mo gross</strong>
                          <br />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Net after $497: <strong style={{ color: '#5EEAD4' }}>${conservativeNet.toLocaleString()}</strong></span>
                        </div>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(94,234,212,0.16)', border: '1.5px solid rgba(94,234,212,0.40)' }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>
                          Standard ({Math.round(STANDARD_CLOSE_RATE * 100)}% close)
                        </div>
                        <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5 }}>
                          {monthlyLeads} leads × {standardJobs} closes
                          <br />
                          <strong style={{ fontSize: 18, color: '#5EEAD4' }}>${standardGross.toLocaleString()}/mo gross</strong>
                          <br />
                          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Net after $497: <strong style={{ color: '#5EEAD4' }}>${standardNet.toLocaleString()}</strong></span>
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.70)', lineHeight: 1.55 }}>
                      Even at {Math.round(CONSERVATIVE_CLOSE_RATE * 100)}% close rate the lead pays for the whole month in 1 job. The 1-Job Guarantee covers you if it doesn&rsquo;t.
                    </div>
                  </div>
                )
              })()}

              {/* OFFER STACK */}
              <div style={offerCard}>
                <div style={{ fontSize: 11, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                  Your offer
                </div>
                <h2 style={offerH1}>
                  <span style={{ background: 'linear-gradient(135deg, #22C55E, #16803F)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{LEADS_PER_MONTH} leads</span> like this for <span style={{ background: 'linear-gradient(135deg, #22C55E, #16803F)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>$97</span>.
                </h2>
                <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.55, margin: '0 0 18px' }}>
                  {LEADS_PER_WEEK} fresh homeowner leads in {lead.zip || 'your zip'} every week for 4 weeks. Verified phones. Pre-written outreach script per lead. <strong style={{ color: '#0B1F3A' }}>${PRICE_PER_LEAD_INTRO_USD.toFixed(2)} per lead first month</strong> — vs HomeAdvisor at $40-300 shared with 4 other shops.
                </p>

                <ul style={offerBullets}>
                  {[
                    `${LEADS_PER_WEEK} exclusive homeowner leads every week — ${LEADS_PER_MONTH} total month 1`,
                    'Verified phone on every lead (skip-traced)',
                    'Ready-to-send outreach script per lead',
                    'AI-scored 0-100 by intent + ticket size',
                    'The 1-Job Guarantee: book a paying job in 30 days or refund + next month free',
                  ].map((line) => (
                    <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <span style={{ flexShrink: 0, marginTop: 4, width: 14, height: 14, borderRadius: 4, background: 'linear-gradient(135deg, #22C55E, #14B8A6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
                          <path d="M3 8.5l3.5 3.5 6.5-7" />
                        </svg>
                      </span>
                      <span style={{ fontSize: 14, color: '#0B1F3A', lineHeight: 1.5 }}>{line}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link href={checkoutUrl} className="bavg-cta-sheen" style={{ ...ctaPrimary, position: 'relative', overflow: 'hidden' }}>
                  Lock my zip — $97 →
                </Link>
                <p style={{ fontSize: 12, color: '#7AAAB2', textAlign: 'center', margin: '12px 0 0' }}>
                  90-second checkout · $497/mo starting month 2 · Cancel anytime
                </p>
              </div>

              {/* Founder note */}
              <p style={{ fontSize: 12.5, color: '#4A6670', textAlign: 'center', margin: '28px 0 0', lineHeight: 1.55 }}>
                The lead above is yours regardless. Don&rsquo;t sign up = no follow-up. <br />
                Questions? <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>{FOUNDER_PHONE}</a>
              </p>
            </div>
          )}

          {/* PHASE 3A — AREA NOT OPEN (BatchData returned no leads OR no zip on prospect) */}
          {phase === 'area_not_open' && (
            <div style={cardPulling}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                Your area is opening soon
              </div>
              <h1 style={pullingH1}>We&rsquo;re still building inventory for your zip.</h1>
              <p style={{ fontSize: 14.5, color: '#4A6670', margin: '0 0 22px', lineHeight: 1.55 }}>
                Be the first shop in your zip code. <strong style={{ color: '#0B1F3A' }}>Lock your territory for $97</strong> and the moment leads land, you get them — exclusive, no sharing, fresh batch every 7 days.
              </p>
              <Link href={checkoutUrl} style={ctaPrimary}>
                Lock my zip — $97 →
              </Link>
              <p style={{ fontSize: 11.5, color: '#7AAAB2', textAlign: 'center', margin: '12px 0 0' }}>
                The 1-Job Guarantee: 1 paying job in 30 days or full refund + next month free.
              </p>
            </div>
          )}

          {/* PHASE 3B — ERROR (network failure / unexpected) */}
          {phase === 'error' && (
            <div style={cardPulling}>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
                Hmm — something glitched
              </div>
              <h1 style={pullingH1}>Reload + try again.</h1>
              <p style={{ fontSize: 14, color: '#4A6670', margin: '0 0 22px', lineHeight: 1.55 }}>
                Or text me directly: <a href={FOUNDER_PHONE_HREF} style={{ color: '#C84B26', fontWeight: 800, textDecoration: 'none' }}>{FOUNDER_PHONE}</a> and I&rsquo;ll pull one by hand.
              </p>
              <Link href={checkoutUrl} style={ctaPrimary}>
                Or lock my zip — $97 →
              </Link>
            </div>
          )}
        </div>
      </section>

      <style>{`
        @keyframes bavgSheen {
          0%, 60% { transform: translateX(-130%) skewX(-18deg); }
          100%    { transform: translateX(230%) skewX(-18deg); }
        }
        .bavg-cta-sheen::after {
          content: '';
          position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.35), transparent);
          animation: bavgSheen 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .bavg-cta-sheen::after { animation: none; }
        }
      `}</style>
    </main>
  )
}

export default function FreeLeadPage() {
  return (
    <Suspense fallback={null}>
      <FreeLeadInner />
    </Suspense>
  )
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, color: '#7AAAB2', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#0B1F3A', marginTop: 2, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}>{value}</div>
    </div>
  )
}

function signalEmoji(s: string): string {
  if (/permit/i.test(s)) return '🏛'
  if (/storm/i.test(s)) return '⛈'
  if (/aged/i.test(s)) return '🌡'
  if (/move/i.test(s)) return '🏠'
  return '🔔'
}

const shellStyle: React.CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  background: '#FFF8F0',
  color: '#0B1F3A',
  minHeight: '100vh',
}

const cardPulling: React.CSSProperties = {
  padding: 'clamp(24px, 4vw, 36px)',
  borderRadius: 18,
  background: '#FFFFFF',
  border: '1.5px solid rgba(232,116,43,0.22)',
  boxShadow: '0 22px 60px rgba(11,31,58,0.10)',
}

const pullingH1: React.CSSProperties = {
  fontSize: 'clamp(22px, 3vw, 32px)',
  fontWeight: 900,
  letterSpacing: '-0.03em',
  lineHeight: 1.15,
  margin: '0 0 8px',
}

// progressBarShell + progressBarFill removed 2026-06-10 — replaced w/
// the 3-dot bounce indicator + real narrative messages per Fable 5 review
// ("theater is fake scarcity in a new costume").

const revealH1: React.CSSProperties = {
  fontSize: 'clamp(26px, 3.6vw, 38px)',
  fontWeight: 900,
  letterSpacing: '-0.03em',
  lineHeight: 1.1,
  margin: '0 0 10px',
}

const leadCard: React.CSSProperties = {
  padding: 'clamp(20px, 3vw, 28px)',
  borderRadius: 16,
  background: '#FFFFFF',
  border: '2px solid rgba(34,197,94,0.40)',
  boxShadow: '0 22px 56px rgba(11,31,58,0.10)',
  marginBottom: 24,
}

// 2026-06-15 — AI lead-packet sub-section card. Subtle tinted panel that
// sits inside the green-bordered leadCard, matching the page's soft-shadow
// rounded-card language.
const aiSection: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  background: '#FBFCFD',
  border: '1px solid rgba(11,31,58,0.08)',
}

const aiSectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  color: '#7AAAB2',
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const tradePill: React.CSSProperties = {
  padding: '4px 10px', borderRadius: 7,
  background: 'rgba(11,31,58,0.06)',
  color: '#0B1F3A', fontSize: 11, fontWeight: 800,
  letterSpacing: '0.08em',
}

const offerCard: React.CSSProperties = {
  padding: 'clamp(24px, 4vw, 36px)',
  borderRadius: 18,
  background: 'linear-gradient(165deg, #FFFFFF, #FFF8F0)',
  border: '2px solid #E8742B',
  boxShadow: '0 26px 64px rgba(232,116,43,0.18)',
}

const offerH1: React.CSSProperties = {
  fontSize: 'clamp(26px, 3.8vw, 42px)',
  fontWeight: 900,
  letterSpacing: '-0.04em',
  lineHeight: 1.05,
  margin: '0 0 12px',
}

const offerBullets: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: '0 0 22px',
}

const ctaPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%',
  padding: '20px 32px', borderRadius: 14,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontSize: 18, fontWeight: 900, letterSpacing: '-0.01em',
  boxShadow: '0 14px 36px rgba(232,116,43,0.42)',
}
