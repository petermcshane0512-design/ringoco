'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEADS_PER_WEEK, PRICE_MONTHLY_USD } from '@/lib/offer'
import LeadsWaiting from '@/components/LeadsWaiting'
import LeadMap from '@/components/LeadMap'
import AddressAutocomplete from '@/components/AddressAutocomplete'

/**
 * /dashboard/leads — THE dashboard.
 *
 * 2026-06-11 restyle per Peter: "dashboard is too futuristic and too
 * UI-y — I like how the dashboard looks on the landing page." This now
 * matches the homepage LeadsCard design system exactly: warm navy
 * (#0B1F3A → #0E2746), orange accents (#E8742B / #FF9D5A / #FFC58A),
 * cream text (#FFF8F0), muted slate-teal secondary (#7AAAB2). No
 * monospace status text, no satellite/command-center jargon.
 *
 * Structure:
 *   1. Top bar — wordmark, quick-nav (Buy leads / Settings / Support).
 *   2. Countdown banner — next drop, this week / month / won stats.
 *   3. Lead rows — LeadsCard-style rows: score chip, signal pill,
 *      address. Click to expand: property intel, phone reveal state
 *      machine, AI outreach generator with send-now buttons, map link,
 *      status pills.
 *   4. Empty state — LeadScanConsole (radar + agent log).
 *
 * PROGRESSIVE FIRST DROP (2026-06-11 per Peter): when a fresh signup's
 * first batch lands, leads render ONE AT A TIME (~1.1s apart) with a
 * "locking next lead" shimmer row under the list — looks like the AI is
 * finding them live. Returning visits (drops already present on first
 * load) render instantly; the stagger only arms when the page loaded
 * empty and the batch arrived via the poll.
 *
 * ALL behavior preserved: 1s countdown tick, pipeline/scan animations,
 * self-driving KICK + 5s POLL while empty, countdown-zero
 * check-and-drop, optimistic status updates, click-to-reveal
 * skip-trace, AI message generation + SMS/email send, ProfileGate.
 *
 * /dashboard root 302s here — this page owns the entire post-signup
 * experience.
 */

type LeadDrop = {
  id: string
  drop_date: string
  drop_period: string
  status: 'new' | 'viewed' | 'contacted' | 'quoted' | 'won' | 'lost' | 'dismissed'
  notes: string | null
  lead: {
    id: string
    street_address: string | null
    city: string | null
    state: string | null
    zip: string
    owner_name: string | null
    owner_phone: string | null
    owner_email: string | null
    home_value_est: number | null
    year_built: number | null
    sqft: number | null
    source: string
    lead_score: number
    pitch_script: string | null
    skip_trace_attempted_at?: string | null
    skip_trace_hit?: boolean | null
    lat?: number | null
    lng?: number | null
    source_details?: {
      why_tags?: string[]
      description?: string
      permit_type?: string
      work_class?: string
      tag?: string
      property?: {
        beds?: number | null
        baths?: number | null
        equity?: number | null
        last_sale_date?: string | null
      }
    } | null
  }
}

/** Client-side haversine for the "X mi from your shop" dossier chip. */
function distMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Honest per-trade job-value multipliers vs home value (same ranges the
// free-lead page uses — single marketing-math language everywhere).
const JOB_VALUE_MULTIPLIERS: Record<string, [number, number]> = {
  roof: [0.020, 0.045],
  hvac: [0.008, 0.018],
  elect: [0.005, 0.015],
  plumb: [0.004, 0.012],
  handy: [0.002, 0.008],
}
function estJobRange(trade: string, homeValue: number | null | undefined): [number, number] | null {
  if (!homeValue) return null
  const key = Object.keys(JOB_VALUE_MULTIPLIERS).find((k) => trade.toLowerCase().includes(k)) || 'handy'
  const [lo, hi] = JOB_VALUE_MULTIPLIERS[key]
  return [Math.round((homeValue * lo) / 100) * 100, Math.round((homeValue * hi) / 100) * 100]
}

type QuotaInfo = {
  tier: 'receptionist' | 'officemgr' | 'concierge' | null
  tier_display: string
  cadence: 'quarterly' | 'monthly' | 'weekly'
  cadence_label: string
  per_drop: number
  used_this_period: number
}

export default function LeadsPage() {
  const [drops, setDrops] = useState<LeadDrop[]>([])
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [nextDropAt, setNextDropAt] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState<number>(() => Date.now())
  const [firing, setFiring] = useState(false)
  // 2026-06-11 HORMOZI REWORK per Peter ("follow Hormozi's step-by-step,
  // onboard as simply as possible, never loop"). The old gate HARD-blocked
  // every lead behind a business-name + address form — value held hostage
  // by a form, the exact anti-pattern that made onboarding feel like an
  // endless loop. New model: VALUE FIRST.
  //
  //   gate === 'loading'      → still reading the profile
  //   gate === 'need_address' → no geocoded lat/lng (rare; leads would
  //                             scatter without it). This is the ONLY hard
  //                             block, and it exists purely to prevent the
  //                             wrong-neighborhood failure mode.
  //   gate === 'ok'           → render leads NOW. If the business name is
  //                             still missing we show a soft, dismissible
  //                             top banner (needsName) — never a wall. The
  //                             name is captured just-in-time the first
  //                             time they generate an AI intro anyway.
  const [gate, setGate] = useState<'loading' | 'need_address' | 'ok'>('loading')
  const [needsName, setNeedsName] = useState(false)
  // 2026-06-11 — UNPAID-ACCOUNT GUARD per Peter (he created a bare Clerk
  // account, skipped checkout, and landed on the eternal scan screen —
  // a lying UI promising leads to someone with no subscription). If the
  // profile has no active sub, show an activate card instead of the
  // scan console. Re-polls every 5s so a just-paid user whose webhook
  // lags flips to the real dashboard automatically.
  const [subActive, setSubActive] = useState<boolean | null>(null)
  // Progressive first-drop reveal. null = first load not finished yet;
  // true = page loaded empty (fresh signup) → stagger the batch in one
  // lead at a time; false = returning user → render instantly.
  const [progressive, setProgressive] = useState<boolean | null>(null)
  const [revealed, setRevealed] = useState(0)
  // Greet by first name on the waiting card when we have it.
  const [ownerFirstName, setOwnerFirstName] = useState<string | null>(null)
  // Business location — centers the lead map.
  const [bizLoc, setBizLoc] = useState<{ lat: number; lng: number } | null>(null)
  // Trade — drives the est-job-value math on each dossier.
  const [bizTrade, setBizTrade] = useState('')
  // 2026-06-11 — engine diagnostics surfaced to the UI. When a kick comes
  // back with 0 assigned, the reason renders in a small banner instead of
  // dying in server logs ("0 leads, no idea why" can never happen again).
  const [engineNote, setEngineNote] = useState<string | null>(null)
  // Single-open accordion: which lead card is expanded. Map pins drive this.
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function loadLeads(): Promise<number> {
    const r = await fetch('/api/leads/list')
    const j = await r.json().catch(() => ({}))
    if (j.drops) setDrops(j.drops)
    if (j.quota) setQuota(j.quota)
    if (j.next_lead_drop_at !== undefined) setNextDropAt(j.next_lead_drop_at)
    // Contact-backfill diagnostics → same amber banner as engine notes.
    if (Array.isArray(j.contact_backfill_notes) && j.contact_backfill_notes.length > 0) {
      setEngineNote(j.contact_backfill_notes.join(' · '))
    }
    return Array.isArray(j.drops) ? j.drops.length : 0
  }

  useEffect(() => {
    loadLeads()
      .then((n) => setProgressive(n === 0))
      .catch(() => setProgressive(false))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((p: { business_name?: string | null; business_lat?: number | null; business_lng?: number | null; business_address?: string | null; is_active?: boolean | null; owner_first_name?: string | null }) => {
        setSubActive(p.is_active === true)
        if (p.owner_first_name) setOwnerFirstName(p.owner_first_name)
        if (typeof p.business_lat === 'number' && typeof p.business_lng === 'number') {
          setBizLoc({ lat: p.business_lat, lng: p.business_lng })
        }
        const pt = (p as { business_type?: string | null; services_offered?: string | null })
        setBizTrade((pt.business_type || pt.services_offered || '').toLowerCase())
        const bn = (p.business_name ?? '').trim()
        const nameOk = !!bn && bn.toLowerCase() !== 'my business'
        // Geocoded address is the ONE hard requirement — without a lat/lng
        // the ring engine scatters leads across the wrong neighborhood.
        const geoOk = typeof p.business_lat === 'number'
        setGate(geoOk ? 'ok' : 'need_address')
        // Missing business name is SOFT — leads still render; we just nudge
        // with a banner so AI outreach can sign as their shop.
        setNeedsName(!nameOk)
      })
      .catch(() => {
        // Can't read profile → don't hard-block on a transient error; show
        // leads if any, surface the name nudge. The address gate only trips
        // on a confirmed-missing geocode, never on a fetch failure.
        setGate('ok')
        setNeedsName(true)
      })
  }, [])

  // While the sub reads inactive, re-poll — a just-paid user's webhook
  // may lag a few seconds behind the redirect.
  useEffect(() => {
    if (subActive !== false) return
    const id = setInterval(() => {
      fetch('/api/profile')
        .then((r) => r.json())
        .then((p: { is_active?: boolean | null }) => {
          if (p.is_active === true) setSubActive(true)
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [subActive])

  // 1s tick drives the next-sweep countdown.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 2026-06-11 — the old radar/agent-log empty state (scanCount +
  // pipelineStep animation driving LeadScanConsole) was deleted per Peter
  // ("too AI"). LeadsWaiting is a static calm card; no timers needed.

  // SELF-DRIVING DELIVERY — kick check-and-drop while this week's batch is
  // SHORT (not just empty — 2026-06-11 fix: a 1-of-10 partial drop stopped
  // the kick because drops.length > 0, leaving the customer owed 9 with no
  // retry until the cron). Server's check-and-drop owns the quota math; the
  // client just pings while short. Poll every 5s in the same condition.
  const weekShort = drops.filter((d) => Date.now() - new Date(d.drop_date).getTime() <= 7 * 86_400_000).length < LEADS_PER_WEEK
  const [kicked, setKicked] = useState(false)
  useEffect(() => {
    if (loading || !weekShort || kicked) return
    setKicked(true)
    fetch('/api/leads/check-and-drop', { method: 'POST' })
      .then((r) => r.json()).then(async (j) => {
        if (j.ok) await loadLeads()
        // Surface WHY when the engine came back light.
        if (j.ok && (j.assigned ?? 0) === 0) {
          const bits: string[] = []
          if (j.skipped_reason) bits.push(j.skipped_reason)
          if (j.replenish?.blocked_reason) bits.push(`replenish blocked: ${j.replenish.blocked_reason}`)
          if (j.replenish?.errors?.length) bits.push(`replenish: ${j.replenish.errors.slice(0, 2).join(' · ')}`)
          if (j.replenish?.fired && !j.replenish?.errors?.length) bits.push(`replenish pulled ${j.replenish.assigned ?? 0} (spent ${j.replenish.spent_cents ?? 0}c)`)
          if (bits.length) setEngineNote(bits.join(' — '))
        } else if (j.reason && j.reason !== 'not_yet_due') {
          setEngineNote(String(j.reason))
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, weekShort, kicked])
  useEffect(() => {
    if (loading || drops.length > 0) return
    const id = setInterval(() => { loadLeads() }, 5000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, drops.length])

  // Countdown-zero → force the weekly drop now instead of waiting on cron.
  useEffect(() => {
    if (!nextDropAt || firing) return
    const dueAt = new Date(nextDropAt).getTime()
    if (nowTick < dueAt) return
    setFiring(true)
    fetch('/api/leads/check-and-drop', { method: 'POST' })
      .then((r) => r.json())
      .then(async (j) => {
        if (j.ok) await loadLeads()
      })
      .catch(() => {})
      .finally(() => setFiring(false))
  }, [nextDropAt, nowTick, firing])

  async function updateStatus(dropId: string, newStatus: LeadDrop['status']) {
    setDrops((prev) => prev.map((d) => (d.id === dropId ? { ...d, status: newStatus } : d)))
    await fetch(`/api/leads/${dropId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  // Click-to-reveal skip-trace (~$0.10, only on engaged leads).
  async function revealPhone(leadId: string) {
    setDrops((prev) => prev.map((d) =>
      d.lead.id === leadId ? { ...d, lead: { ...d.lead, skip_trace_attempted_at: new Date().toISOString() } } : d
    ))
    const r = await fetch(`/api/leads/${leadId}/reveal-phone`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (j.ok && j.hit) {
      setDrops((prev) => prev.map((d) =>
        d.lead.id === leadId ? { ...d, lead: {
          ...d.lead,
          owner_phone: j.owner_phone ?? d.lead.owner_phone,
          owner_email: j.owner_email ?? d.lead.owner_email,
          owner_name: j.owner_name ?? d.lead.owner_name,
          skip_trace_hit: true,
        }} : d
      ))
    } else {
      setDrops((prev) => prev.map((d) =>
        d.lead.id === leadId ? { ...d, lead: { ...d.lead, skip_trace_hit: false } } : d
      ))
    }
  }

  // REAL pipeline counts — computed from actual drops, never invented.
  const counts = {
    fresh: drops.filter((d) => d.status === 'new' || d.status === 'viewed').length,
    contacted: drops.filter((d) => d.status === 'contacted').length,
    quoted: drops.filter((d) => d.status === 'quoted').length,
    won: drops.filter((d) => d.status === 'won').length,
  }

  // 2026-06-11 — dashboard split per Peter: this-week's drop vs past leads
  // vs monthly total. "This week" = the most recent 7-day drop window;
  // everything older is "past." Monthly = trailing 30 days.
  const now = nowTick
  const DAY = 86_400_000
  const ts = (d: LeadDrop) => new Date(d.drop_date).getTime()
  const thisWeek = drops.filter((d) => now - ts(d) <= 7 * DAY).sort((a, b) => ts(b) - ts(a))
  const past = drops.filter((d) => now - ts(d) > 7 * DAY).sort((a, b) => ts(b) - ts(a))
  const monthCount = drops.filter((d) => now - ts(d) <= 30 * DAY).length

  // Progressive reveal driver — only when the batch arrived AFTER an
  // empty first load (fresh signup watching the scan). First card pops
  // fast, the rest land ~1.1s apart.
  useEffect(() => {
    if (progressive !== true) return
    if (revealed >= thisWeek.length) return
    const id = setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 300 : 1100)
    return () => clearTimeout(id)
  }, [progressive, revealed, thisWeek.length])
  const visibleWeek = progressive === true ? thisWeek.slice(0, revealed) : thisWeek
  const stillRevealing = progressive === true && revealed < thisWeek.length

  const countdownLabel = (() => {
    if (!nextDropAt) return firing ? 'dropping now' : '—'
    const ms = new Date(nextDropAt).getTime() - nowTick
    if (ms <= 0) return firing ? 'dropping now' : 'any second'
    const days = Math.floor(ms / 86_400_000)
    const hrs = Math.floor((ms % 86_400_000) / 3_600_000)
    const mins = Math.floor((ms % 3_600_000) / 60_000)
    const secs = Math.floor((ms % 60_000) / 1000)
    if (days > 0) return `${days}d ${hrs}h ${mins}m`
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
    return `${mins}m ${secs}s`
  })()

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #081427 0%, #0B1F3A 55%, #0A1830 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#FFF8F0',
      paddingBottom: 80,
    }}>
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(8,20,39,0.92)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,157,90,0.16)',
        padding: '12px clamp(14px, 3vw, 28px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{
            fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em',
            color: '#FFF8F0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            BellAveGo
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 9.5, fontWeight: 800, color: '#22C55E', letterSpacing: '0.08em',
            textTransform: 'uppercase', flexShrink: 0,
          }}>
            <i style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'cmdLive 1.6s ease-in-out infinite' }} />
            Live
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link href="/dashboard/buy-leads" style={navBtn}>⚡ Buy more leads</Link>
          <Link href="/dashboard/settings" style={navBtn}>⚙ Settings</Link>
          <Link href="/dashboard/support" style={navBtn}>💬 Support</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1060, margin: '0 auto', padding: '20px clamp(14px, 3vw, 28px) 0' }}>
        {loading || gate === 'loading' || subActive === null ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#7AAAB2', fontSize: 13, fontWeight: 600 }}>
            Loading your leads…
          </div>
        ) : subActive === false ? (
          <ActivateCard />
        ) : gate === 'need_address' ? (
          // Hard block ONLY when there's no geocoded address — leads would
          // otherwise scatter across the wrong neighborhood.
          // setKicked(false) re-arms the delivery kick: the mount-time kick
          // fired while the gate was still open (profile incomplete) and
          // latched — without the reset, the first drop sat undelivered
          // until a manual page refresh.
          <ProfileGate onDone={() => { setGate('ok'); setNeedsName(false); setKicked(false) }} />
        ) : (
          <>
            {/* Soft business-name nudge — never blocks leads (Hormozi:
                value first). Dismisses itself once a name is saved. */}
            {needsName && <NameNudge onSaved={() => setNeedsName(false)} />}
            {/* Engine diagnostics — renders only when a kick returned 0 */}
            {engineNote && (
              <div style={{
                borderRadius: 10, padding: '9px 13px', marginBottom: 12,
                background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)',
                fontSize: 11.5, color: '#FBBF24', fontWeight: 700, lineHeight: 1.5,
              }}>
                ⚠ Lead engine: {engineNote}
              </div>
            )}
            {drops.length === 0 ? (
              <LeadsWaiting firstName={ownerFirstName} />
            ) : (
              <>
            {/* ── TOP ROW: compact map (left) + countdown banner (right).
                   2026-06-11 per Peter: "map way too big — small, on the
                   left next to 'next leads drop in', zoomed out enough to
                   pin all weekly leads." LeadMap already auto-fits zoom to
                   the full weekly pin set. Stacks on mobile. ─────────── */}
            <div className={bizLoc && visibleWeek.length > 0 ? 'bavg-top-grid' : undefined} style={{ marginBottom: 16 }}>
              {bizLoc && visibleWeek.length > 0 && (
                <LeadMap
                  businessLat={bizLoc.lat}
                  businessLng={bizLoc.lng}
                  leads={visibleWeek
                    .filter((d) => typeof d.lead.lat === 'number' && typeof d.lead.lng === 'number')
                    .map((d, i) => ({
                      id: d.lead.id,
                      lat: d.lead.lat as number,
                      lng: d.lead.lng as number,
                      label: String(i + 1),
                      title: [d.lead.street_address, d.lead.city].filter(Boolean).join(', ') || d.lead.zip,
                      hasPhone: !!d.lead.owner_phone,
                    }))}
                  onPinClick={(leadId) => {
                    setExpandedId(leadId)
                    // Defer scroll until the expanded card renders.
                    setTimeout(() => {
                      document.getElementById(`lead-${leadId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }, 60)
                  }}
                />
              )}
              {/* Countdown banner */}
              <div style={{
                borderRadius: 16, padding: '18px 22px',
                background: 'linear-gradient(135deg, rgba(232,116,43,0.16), rgba(232,116,43,0.05))',
                border: '1px solid rgba(255,157,90,0.38)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                gap: 14,
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, color: '#FF9D5A', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Next {LEADS_PER_WEEK} leads drop in
                  </div>
                  <div style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 900, color: '#FFF8F0', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {countdownLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                  <BannerStat n={thisWeek.length} label="this week" />
                  <BannerStat n={monthCount} label="this month" />
                  <BannerStat n={counts.won} label="won" win />
                </div>
              </div>
            </div>

            {/* ── THIS WEEK'S DROP ───────────────────────────────────── */}
            <SectionHead title={`This week's leads`} sub={`${thisWeek.length} delivered · closest to you first · tap for details + AI outreach`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleWeek.length > 0 || stillRevealing
                ? (
                  <>
                    {visibleWeek.map((d, i) => (
                      <LeadCard
                        key={d.id}
                        drop={d}
                        index={i + 1}
                        trade={bizTrade}
                        distMi={bizLoc && typeof d.lead.lat === 'number' && typeof d.lead.lng === 'number'
                          ? distMiles(bizLoc.lat, bizLoc.lng, d.lead.lat, d.lead.lng)
                          : undefined}
                        onStatus={updateStatus}
                        onReveal={revealPhone}
                        expanded={expandedId === d.lead.id}
                        onToggle={() => setExpandedId((x) => (x === d.lead.id ? null : d.lead.id))}
                      />
                    ))}
                    {stillRevealing && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '13px 16px', borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px dashed rgba(255,157,90,0.35)',
                        color: '#FFC58A', fontSize: 12.5, fontWeight: 700,
                      }}>
                        <span aria-hidden style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                          border: '2px solid rgba(255,157,90,0.25)', borderTopColor: '#FF9D5A',
                          animation: 'bavgSpin 0.9s linear infinite',
                        }} />
                        Locking lead {Math.min(revealed + 1, thisWeek.length)} of {thisWeek.length}…
                      </div>
                    )}
                  </>
                )
                : <div style={emptyNote}>Fresh batch lands when the countdown hits zero.</div>}
            </div>

            {/* ── PAST LEADS ─────────────────────────────────────────── */}
            {past.length > 0 && (
              <PastLeads drops={past} onStatus={updateStatus} onReveal={revealPhone} expandedId={expandedId} onToggle={setExpandedId} />
            )}
              </>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes cmdLive { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes bavgSpin { to { transform: rotate(360deg) } }
        .bavg-top-grid {
          display: grid;
          grid-template-columns: minmax(260px, 380px) 1fr;
          gap: 14px;
          align-items: stretch;
        }
        @media (max-width: 760px) {
          .bavg-top-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  )
}

const navBtn: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 9,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,157,90,0.22)',
  color: '#FFC58A', textDecoration: 'none',
  fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap',
}

const emptyNote: React.CSSProperties = {
  padding: '20px', borderRadius: 12, textAlign: 'center',
  background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,157,90,0.25)',
  color: 'rgba(255,248,240,0.45)', fontSize: 12.5,
}

/**
 * NameNudge — soft, dismissible banner that captures the business name
 * WITHOUT blocking leads (Hormozi: never hold value hostage to a form).
 * Sits above the lead list. Saves inline, then vanishes. The name is what
 * the AI signs outreach as; until it's set, the per-lead "Generate AI
 * intro" button captures it just-in-time instead.
 */
function NameNudge({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  async function save() {
    if (name.trim().length < 2) { setOpen(true); return }
    setSaving(true)
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_name: name.trim() }),
      })
      if (r.ok) onSaved()
    } catch {/* */}
    setSaving(false)
  }

  return (
    <div style={{
      borderRadius: 12, padding: '12px 16px', marginBottom: 14,
      background: 'rgba(232,116,43,0.10)',
      border: '1px solid rgba(255,157,90,0.35)',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#FFC58A', flex: 1, minWidth: 200 }}>
        {open
          ? 'What name should the AI sign your outreach as?'
          : 'Add your business name so AI outreach signs as your shop (not required to view leads).'}
      </span>
      {open ? (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mike's HVAC"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            style={{
              padding: '8px 12px', borderRadius: 8, minWidth: 160,
              border: '1px solid rgba(255,157,90,0.4)', background: 'rgba(4,12,24,0.6)',
              color: '#FFF8F0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button onClick={save} disabled={saving} style={nudgeBtn(true)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      ) : (
        <>
          <button onClick={() => setOpen(true)} style={nudgeBtn(true)}>Add name</button>
          <button onClick={() => setDismissed(true)} style={nudgeBtn(false)}>Later</button>
        </>
      )}
    </div>
  )
}

function nudgeBtn(primary: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 12, fontWeight: 800, flexShrink: 0,
    background: primary ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'rgba(255,255,255,0.06)',
    color: primary ? '#fff' : 'rgba(255,248,240,0.6)',
  }
}

/**
 * ActivateCard — shown when the signed-in account has NO active
 * subscription (bare Clerk account that never went through checkout).
 * Honest UI: no fake scan, one path forward — pick your area and pay.
 */
function ActivateCard() {
  return (
    <div style={{
      borderRadius: 16, padding: 'clamp(22px, 4vw, 32px)',
      background: 'rgba(255,255,255,0.035)',
      border: '1.5px solid rgba(232,116,43,0.55)',
      boxShadow: '0 24px 60px rgba(4,12,24,0.5), 0 0 40px rgba(232,116,43,0.10)',
      maxWidth: 560, margin: '40px auto 0', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: '#FF9D5A', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
        Account created — area not activated yet
      </div>
      <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 26px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 10px', color: '#FFF8F0' }}>
        Your leads start the moment you lock your area.
      </h2>
      <p style={{ fontSize: 13.5, color: 'rgba(255,248,240,0.6)', lineHeight: 1.6, margin: '0 0 20px' }}>
        Pick your business address and trade — your first {LEADS_PER_WEEK} homeowner
        leads pull from a 1-mile ring around your shop, usually within 30 minutes.
      </p>
      <Link href="/start/area" style={{
        display: 'inline-block', padding: '15px 28px', borderRadius: 12,
        background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
        color: '#fff', textDecoration: 'none', fontWeight: 900, fontSize: 15,
        boxShadow: '0 12px 30px rgba(232,116,43,0.40)',
      }}>
        Lock my area →
      </Link>
      <p style={{ fontSize: 11, color: 'rgba(255,248,240,0.4)', margin: '14px 0 0', lineHeight: 1.5 }}>
        Book a paying job in 30 days or full refund + your next month free + you keep every lead.
      </p>
    </div>
  )
}

function BannerStat({ n, label, win }: { n: number; label: string; win?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: win ? '#22C55E' : '#FFF8F0', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 9, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 2px 12px', flexWrap: 'wrap', gap: 8 }}>
      <h2 style={{ fontSize: 'clamp(18px, 2.4vw, 24px)', fontWeight: 900, letterSpacing: '-0.03em', margin: 0, color: '#FFF8F0' }}>{title}</h2>
      <span style={{ fontSize: 11, color: '#7AAAB2', fontWeight: 600 }}>{sub}</span>
    </div>
  )
}

/** Past leads — collapsed by default so the dashboard leads with this week. */
function PastLeads({ drops, onStatus, onReveal, expandedId, onToggle }: { drops: LeadDrop[]; onStatus: (id: string, s: LeadDrop['status']) => void; onReveal: (leadId: string) => void; expandedId: string | null; onToggle: (updater: (x: string | null) => string | null) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 28 }}>
      <button
        onClick={() => setOpen((x) => !x)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,157,90,0.16)',
          color: '#FFC58A', fontSize: 13, fontWeight: 800,
        }}
      >
        <span>📁 Past leads ({drops.length})</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease', color: '#7AAAB2' }}>▾</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {drops.map((d) => (
            <LeadCard
              key={d.id}
              drop={d}
              onStatus={onStatus}
              onReveal={onReveal}
              expanded={expandedId === d.lead.id}
              onToggle={() => onToggle((x) => (x === d.lead.id ? null : d.lead.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * ProfileGate — one-time business-name capture shown on the first
 * dashboard visit (2026-06-11 per Peter: "make sure customers fill out
 * these settings right before the first leads start to load — one-time
 * thing"). The AI signs every outreach message with the business name;
 * without it the generate-message route refuses. Two fields, one save,
 * gone forever. Lead delivery runs in the background while this shows.
 */
function ProfileGate({ onDone }: { onDone: () => void }) {
  const [bizName, setBizName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [address, setAddress] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // 2026-06-11 per Peter — the address/zip/trade/phone they typed at
  // /start/area BEFORE paying must already be here, never retyped. Two
  // sources, profile wins: (1) the profile (seeded by /checkout/return
  // from Stripe metadata), (2) the bavg_area_* cookies /start/area set
  // client-side — the reliable fallback if the account was created via a
  // path that skipped metadata seeding.
  function cookie(name: string): string {
    if (typeof document === 'undefined') return ''
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))
    return m ? decodeURIComponent(m[1]) : ''
  }
  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then((p: { business_name?: string | null; owner_first_name?: string | null; business_address?: string | null }) => {
      const bn = (p.business_name ?? '').trim()
      if (bn && bn.toLowerCase() !== 'my business') setBizName(bn)
      if (p.owner_first_name) setFirstName(p.owner_first_name)
      // Address: profile first, then the pre-checkout cookie.
      setAddress((p.business_address || cookie('bavg_area_addr') || '').trim())
    }).catch(() => {
      setAddress(cookie('bavg_area_addr'))
    }).finally(() => setLoaded(true))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (bizName.trim().length < 2) {
      setErr('Enter your business name — the AI signs every message with it.')
      return
    }
    if (address.trim().length < 8) {
      setErr('Enter your business address — leads are pulled from a 1-mile ring around it.')
      return
    }
    setSaving(true)
    try {
      // Carry through the zip / trade / phone they already entered pre-
      // checkout so a manually-created account still ends up with a
      // complete, engine-ready profile — no retype, no missing fields.
      const cz = cookie('bavg_area_zip').replace(/\D/g, '').slice(0, 5)
      const ct = cookie('bavg_area_trade').toLowerCase().trim()
      const cp = cookie('bavg_area_phone').replace(/\D/g, '')
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: bizName.trim(),
          business_address: address.trim(),
          ...(firstName.trim() ? { owner_first_name: firstName.trim() } : {}),
          ...(cz ? { service_zips: [cz] } : {}),
          ...(ct ? { business_type: ct, services_offered: ct } : {}),
          ...(cp.length >= 10 ? { owner_phone: cp.length === 10 ? `+1${cp}` : `+${cp}` } : {}),
        }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setErr(j.error || 'Save failed — try again.')
        return
      }
      // VERIFY the address actually geocoded — /api/profile geocodes on
      // save. If business_lat is still null, the engine can't pull tight,
      // so we refuse to let the gate close (this is the exact failure mode
      // Peter hit). Make them fix the address instead of shipping scatter.
      const check = await fetch('/api/profile').then((x) => x.json()).catch(() => ({}))
      if (typeof check.business_lat !== 'number') {
        setErr('We could not locate that address on the map. Double-check the street, city, and zip so leads land near you.')
        return
      }
      onDone()
    } catch {
      setErr('Network error — try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return <div style={{ padding: 50, textAlign: 'center', color: '#7AAAB2', fontSize: 13, fontWeight: 600 }}>Loading…</div>
  }

  return (
    <div style={{
      borderRadius: 16, padding: 'clamp(20px, 4vw, 30px)',
      background: 'rgba(255,255,255,0.035)',
      border: '1px solid rgba(255,157,90,0.40)',
      boxShadow: '0 24px 60px rgba(4,12,24,0.5), 0 0 40px rgba(232,116,43,0.08)',
      maxWidth: 560, margin: '0 auto',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 900, color: '#FF9D5A', letterSpacing: '0.14em',
        textTransform: 'uppercase', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <i style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'cmdLive 1.6s ease-in-out infinite' }} />
        One last step — your leads are already being pulled
      </div>
      <h2 style={{ fontSize: 'clamp(19px, 2.6vw, 24px)', fontWeight: 900, letterSpacing: '-0.02em', margin: '0 0 8px', color: '#FFF8F0' }}>
        Who do we sign your outreach as?
      </h2>
      <p style={{ fontSize: 13, color: 'rgba(255,248,240,0.6)', lineHeight: 1.6, margin: '0 0 18px' }}>
        The AI writes a personalized intro to every homeowner and signs it as <strong style={{ color: '#FFC58A' }}>your shop</strong> — never BellAveGo, never &ldquo;AI.&rdquo; Set it once; change anytime in Settings.
      </p>

      <form onSubmit={save}>
        <label style={gateLabel}>Business name</label>
        <input
          value={bizName}
          onChange={(e) => setBizName(e.target.value)}
          placeholder="Mike's HVAC & Plumbing"
          style={gateInput}
          autoFocus
        />
        <label style={{ ...gateLabel, marginTop: 14 }}>Your first name <span style={{ color: 'rgba(255,248,240,0.35)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(optional — messages sign with it)</span></label>
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Mike"
          style={gateInput}
          autoComplete="given-name"
        />

        <label style={{ ...gateLabel, marginTop: 14 }}>Business address</label>
        <AddressAutocomplete
          value={address}
          onChange={setAddress}
          placeholder="Start typing — pick your address from the list"
          inputStyle={gateInput}
        />
        <p style={{ fontSize: 10.5, color: 'rgba(255,248,240,0.4)', margin: '6px 0 0', lineHeight: 1.5 }}>
          Pick from the dropdown so we lock the exact spot. Your leads start 1 mile from here and widen only when nearby supply runs low.
        </p>

        {err && <p style={{ fontSize: 12.5, color: '#FCA5A5', margin: '12px 0 0', fontWeight: 700 }}>⚠ {err}</p>}

        <button type="submit" disabled={saving} style={{
          marginTop: 18, width: '100%', padding: '14px 18px', borderRadius: 12,
          background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
          color: saving ? 'rgba(255,248,240,0.5)' : '#fff',
          fontWeight: 900, fontSize: 14, border: 'none',
          cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
          boxShadow: saving ? 'none' : '0 10px 26px rgba(232,116,43,0.32)',
        }}>
          {saving ? 'Saving…' : 'Save — show me my leads →'}
        </button>
      </form>
    </div>
  )
}

const gateLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 900,
  color: 'rgba(255,248,240,0.6)', letterSpacing: '0.1em',
  textTransform: 'uppercase', marginBottom: 7,
}
const gateInput: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: 10,
  border: '1px solid rgba(255,157,90,0.25)',
  background: 'rgba(4,12,24,0.6)',
  fontSize: 15, fontWeight: 600,
  fontFamily: 'inherit', color: '#FFF8F0',
  boxSizing: 'border-box', outline: 'none',
}

type GeneratedMessage = { email_subject: string; email_body: string; sms: string }

function LeadCard({ drop, onStatus, onReveal, expanded, onToggle, index, distMi, trade }: {
  drop: LeadDrop
  onStatus: (id: string, s: LeadDrop['status']) => void
  onReveal: (leadId: string) => void
  // 2026-06-11 — expansion is parent-controlled (single-open accordion) so
  // map-pin clicks can open the matching card + scroll to it.
  expanded: boolean
  onToggle: () => void
  // 1-based position in this week's list — matches the numbered map pin.
  index?: number
  // Dossier extras: straight-line miles from the shop + tenant trade for
  // the est-job-value math.
  distMi?: number
  trade?: string
}) {
  const l = drop.lead
  const fullAddr = [l.street_address, l.city, l.state, l.zip].filter(Boolean).join(', ')
  const mapsHref = fullAddr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}` : null
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMsg, setAiMsg] = useState<GeneratedMessage | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [sendingSms, setSendingSms] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // Hybrid onboarding: server returns 428 profile_incomplete with the
  // missing-field list → render the inline 45-second setup right here.
  const [setupOpen, setSetupOpen] = useState(false)

  async function generateMessage() {
    setAiLoading(true); setAiError(null)
    try {
      const r = await fetch(`/api/leads/${l.id}/generate-message`, { method: 'POST' })
      const j = await r.json()
      if (r.status === 428 && j.error === 'profile_incomplete') {
        setSetupOpen(true)
        setAiLoading(false)
        return
      }
      if (!r.ok || !j.ok) { setAiError(j.error || 'failed'); return }
      setAiMsg({ email_subject: j.email_subject, email_body: j.email_body, sms: j.sms })
      setAiOpen(true)
    } catch (e) { setAiError((e as Error).message) }
    setAiLoading(false)
  }

  async function sendSms() {
    if (!aiMsg || !l.owner_phone) return
    setSendingSms(true)
    try {
      const r = await fetch(`/api/leads/${l.id}/send-outreach`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'sms', body: aiMsg.sms }),
      })
      if (r.ok) setSmsSent(true)
    } catch {/* */}
    setSendingSms(false)
  }

  async function sendEmail() {
    if (!aiMsg || !l.owner_email) return
    setSendingEmail(true)
    try {
      const r = await fetch(`/api/leads/${l.id}/send-outreach`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', subject: aiMsg.email_subject, body: aiMsg.email_body }),
      })
      if (r.ok) setEmailSent(true)
    } catch {/* */}
    setSendingEmail(false)
  }

  // Same signal language as the homepage LeadsCard — orange badge, plain
  // words a contractor uses, no emoji soup.
  const signalLabel = ({
    move_in: 'NEW OWNER',
    permit: 'PERMIT FILED',
    storm: 'STORM ZONE',
    aging_hvac: 'AGED SYSTEM',
    expired_listing: 'RECENT SALE',
    other: 'LEAD',
  } as Record<string, string>)[l.source] || 'LEAD'

  const pitch = l.pitch_script || (l.source === 'aging_hvac'
    ? `Hi, calling neighbors in ${l.zip} where most homes are 20+ yrs old — AC units past their lifespan. Got a min to talk about a free tune-up to extend yours?`
    : null)

  const score = l.lead_score ?? 0
  const statusColor =
    drop.status === 'won' ? '#22C55E'
    : drop.status === 'lost' || drop.status === 'dismissed' ? '#F87171'
    : drop.status === 'quoted' ? '#FBBF24'
    : drop.status === 'contacted' ? '#FFC58A'
    : 'rgba(255,248,240,0.5)'

  return (
    <div id={`lead-${l.id}`} style={{
      borderRadius: 13,
      background: expanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
      border: expanded ? '1.5px solid rgba(232,116,43,0.55)' : '1px solid rgba(255,157,90,0.16)',
      transition: 'border-color 180ms ease, background 180ms ease',
      overflow: 'hidden',
    }}>
      {/* Compact summary row — same shape as the homepage LeadsCard rows */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        {typeof index === 'number' && (
          <span aria-hidden style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: l.owner_phone ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'linear-gradient(135deg, #64748B, #475569)',
            border: '1.5px solid rgba(255,255,255,0.6)',
            color: '#fff', fontSize: 10.5, fontWeight: 900,
          }}>
            {index}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 900, color: '#FFF8F0' }}>
              {l.owner_name ?? 'Owner unlisted'}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: 6,
              background: l.source === 'move_in' || l.source === 'expired_listing' ? 'rgba(20,184,166,0.85)' : '#E8742B',
              color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
            }}>{signalLabel}</span>
            <span style={{
              padding: '2px 7px', borderRadius: 6,
              background: '#FFD9A8', color: '#C84B26', fontSize: 9, fontWeight: 900,
            }}>SCORE {score}</span>
            <span style={pill('rgba(255,255,255,0.06)', statusColor)}>
              {drop.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#7AAAB2', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
            {fullAddr || l.zip}{l.year_built ? ` · built ${l.year_built}` : ''}{l.home_value_est ? ` · $${Math.round(l.home_value_est / 1000)}K home` : ''}
          </div>
        </div>
        {l.owner_phone && (
          <span style={{ fontSize: 10, fontWeight: 800, color: '#22C55E', flexShrink: 0 }}>
            ☎ verified
          </span>
        )}
        <div style={{ fontSize: 13, color: '#7AAAB2', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>
          ▾
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
      <div style={{ padding: '0 18px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#FF9D5A', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
            {signalLabel} · score {score}/100
          </div>
          {/* ── PROPERTY DOSSIER (2026-06-11 per Peter: "$497-worthy") ── */}
          {(() => {
            const prop = l.source_details?.property
            const yearsOwned = prop?.last_sale_date
              ? Math.max(0, Math.floor((Date.now() - new Date(prop.last_sale_date).getTime()) / (365.25 * 86400000)))
              : null
            const age = l.year_built ? new Date().getFullYear() - l.year_built : null
            const jobs = estJobRange(trade || '', l.home_value_est)
            const monthsCovered = jobs ? Math.max(1, Math.floor(jobs[0] / PRICE_MONTHLY_USD)) : null
            const chips: string[] = []
            if (typeof distMi === 'number') chips.push(`📍 ${distMi < 10 ? distMi.toFixed(1) : Math.round(distMi)} mi from your shop`)
            if (l.year_built) chips.push(`🏠 built ${l.year_built}${age ? ` (${age} yrs old)` : ''}`)
            if (l.sqft) chips.push(`📐 ${l.sqft.toLocaleString()} sqft`)
            if (prop?.beds || prop?.baths) chips.push(`🛏 ${prop?.beds ?? '?'}bd/${prop?.baths ?? '?'}ba`)
            if (l.home_value_est) chips.push(`💰 ~$${Math.round(l.home_value_est / 1000)}K value`)
            if (prop?.equity) chips.push(`🏦 ~$${Math.round(prop.equity / 1000)}K equity`)
            if (yearsOwned !== null && yearsOwned > 0) chips.push(`🗓 owned ${yearsOwned} yrs`)
            if (chips.length === 0 && !l.owner_email && !jobs) return null
            return (
              <div style={{
                background: 'rgba(255,255,255,0.04)', padding: '11px 13px', borderRadius: 10,
                border: '1px solid rgba(255,157,90,0.18)', marginBottom: 10,
              }}>
                <span style={{ color: '#FFC58A', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>Property dossier</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {chips.map((c) => (
                    <span key={c} style={{
                      padding: '4px 9px', borderRadius: 7, fontSize: 11.5, fontWeight: 700,
                      background: c.startsWith('🏦') ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.05)',
                      border: c.startsWith('🏦') ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      color: c.startsWith('🏦') ? '#4ADE80' : 'rgba(255,248,240,0.85)',
                    }}>{c}</span>
                  ))}
                </div>
                {prop?.equity && prop.equity > 50_000 && (
                  <div style={{ fontSize: 11, color: '#4ADE80', fontWeight: 700, marginTop: 7 }}>
                    ✓ Equity says they can afford the job — quote with confidence.
                  </div>
                )}
                {yearsOwned !== null && yearsOwned >= 10 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,248,240,0.6)', fontWeight: 600, marginTop: 4 }}>
                    {yearsOwned}+ years in the home — systems and surfaces aging on their watch, not a flipper.
                  </div>
                )}
                {jobs && (
                  <div style={{
                    marginTop: 9, padding: '8px 11px', borderRadius: 8,
                    background: 'rgba(232,116,43,0.14)', border: '1px solid rgba(232,116,43,0.3)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,248,240,0.85)' }}>Est. job value at this home</span>
                    <span style={{ fontSize: 13.5, fontWeight: 900, color: '#FFC58A' }}>
                      ${jobs[0].toLocaleString()} – ${jobs[1].toLocaleString()}
                      {monthsCovered ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,248,240,0.55)' }}> · ≈ {monthsCovered} mo of membership</span> : null}
                    </span>
                  </div>
                )}
                {l.owner_email && (
                  <div style={{ fontSize: 11.5, marginTop: 8 }}>
                    ✉ <a href={`mailto:${l.owner_email}`} style={{ color: '#FFC58A', textDecoration: 'none', fontWeight: 700 }}>{l.owner_email}</a>
                  </div>
                )}
              </div>
            )
          })()}
          {/* AI DEBRIEF — why this lead surfaced. why_tags come from the
              lead engine (sale recency, system age, permit/storm signal);
              permit rows fall back to the raw permit description. */}
          {(() => {
            const sd = l.source_details
            const tags = (sd?.why_tags ?? []).filter(Boolean)
            const permitLine = [sd?.permit_type, sd?.work_class, sd?.description].filter(Boolean).join(' · ')
            if (tags.length === 0 && !permitLine) return null
            return (
              <div style={{
                background: 'rgba(255,255,255,0.04)', padding: '11px 13px', borderRadius: 10,
                border: '1px solid rgba(255,157,90,0.18)',
                fontSize: 12, color: 'rgba(255,248,240,0.85)', lineHeight: 1.6, marginBottom: 10,
              }}>
                <span style={{ color: '#FFC58A', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>WHY THIS LEAD</span>
                {tags.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {tags.map((t, i) => <li key={i} style={{ marginBottom: 2 }}>{t}</li>)}
                  </ul>
                ) : (
                  <span>Permit on file: {permitLine}</span>
                )}
              </div>
            )
          })()}
          {pitch && (
            <div style={{
              background: 'rgba(232,116,43,0.12)', padding: '11px 13px', borderRadius: 10,
              border: '1px solid rgba(232,116,43,0.28)',
              fontSize: 12.5, color: 'rgba(255,248,240,0.92)', lineHeight: 1.55, marginBottom: 10,
            }}>
              <span style={{ color: '#FFC58A', fontWeight: 800, fontSize: 10, letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>YOUR CALL ANGLE</span>
              {pitch}
            </div>
          )}
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11.5, color: '#FFC58A', textDecoration: 'none', fontWeight: 700,
            }}>
              View property on Google Maps ↗
            </a>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
          {/* Phone reveal state machine — unchanged behavior */}
          {l.owner_phone ? (
            <>
              <a href={`tel:${l.owner_phone}`} style={{
                padding: '11px 18px', borderRadius: 10,
                background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
                color: '#fff', textDecoration: 'none', textAlign: 'center',
                fontSize: 13, fontWeight: 900,
                boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
              }}>
                📞 Call {l.owner_phone}
              </a>
              <a href={`sms:${l.owner_phone}`} style={{
                padding: '10px 18px', borderRadius: 10,
                background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,157,90,0.45)',
                color: '#FFC58A', textDecoration: 'none', textAlign: 'center',
                fontSize: 13, fontWeight: 800,
              }}>
                💬 Text
              </a>
            </>
          ) : l.skip_trace_attempted_at && l.skip_trace_hit === false ? (
            // 2026-06-11 — a missed trace is retryable now (server allows
            // re-trace on miss). Dead-end box → action.
            <button onClick={() => onReveal(l.id)} style={{
              padding: '11px 18px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1.5px dashed rgba(255,157,90,0.45)',
              color: '#FFC58A', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', lineHeight: 1.4,
            }}>
              No phone found yet<br />
              <span style={{ fontSize: 11, fontWeight: 700 }}>↻ Search again</span>
            </button>
          ) : l.skip_trace_attempted_at ? (
            <div style={{ ...darkInfoBox, color: '#FFC58A' }}>Looking up…</div>
          ) : l.street_address ? (
            <button onClick={() => onReveal(l.id)} style={{
              padding: '11px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 900, fontFamily: 'inherit',
              boxShadow: '0 6px 16px rgba(232,116,43,0.38)',
            }}>
              🔓 Reveal phone
            </button>
          ) : (
            <div style={darkInfoBox}>
              Neighborhood lead<br />
              <span style={{ fontSize: 10, opacity: 0.6 }}>(no specific address)</span>
            </div>
          )}
        </div>
      </div>

      {/* Inline outreach setup — appears the first time they try to send
          and the profile is missing signing/personalization fields. */}
      {setupOpen && (
        <OutreachSetup
          onDone={() => { setSetupOpen(false); generateMessage() }}
          onCancel={() => setSetupOpen(false)}
        />
      )}

      {/* AI Outreach Message — unchanged behavior */}
      {(l.owner_phone || l.owner_email) && !setupOpen && (
        <div style={{ marginTop: 14 }}>
          {!aiOpen ? (
            <button
              onClick={generateMessage}
              disabled={aiLoading}
              style={{
                width: '100%', padding: '12px 18px', borderRadius: 10,
                background: aiLoading ? 'rgba(255,255,255,0.08)' : 'rgba(232,116,43,0.16)',
                color: aiLoading ? 'rgba(255,248,240,0.5)' : '#FFC58A',
                border: '1.5px dashed rgba(255,157,90,0.5)', cursor: aiLoading ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 900, fontFamily: 'inherit',
              }}
            >
              {aiLoading ? '✨ Writing your message…' : `✨ Write my intro message${l.owner_phone ? ` → ${l.owner_phone}` : ''}`}
            </button>
          ) : aiMsg && (
            <div style={{ background: 'rgba(4,12,24,0.6)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,157,90,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#FF9D5A', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  Pre-written for you · ready to send as your shop
                </div>
                <button onClick={() => setAiOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,248,240,0.5)', fontSize: 12, cursor: 'pointer' }}>✕</button>
              </div>
              {l.owner_phone && (
                <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,248,240,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>SMS to {l.owner_phone}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 8, color: '#FFF8F0' }}>{aiMsg.sms}</div>
                  <button
                    onClick={sendSms}
                    disabled={sendingSms || smsSent}
                    style={{
                      padding: '8px 14px', borderRadius: 7,
                      background: smsSent ? '#22C55E' : sendingSms ? 'rgba(255,255,255,0.14)' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                      color: '#fff', border: 'none', fontFamily: 'inherit',
                      fontSize: 11.5, fontWeight: 900, cursor: smsSent ? 'default' : 'pointer',
                    }}
                  >
                    {smsSent ? '✓ Sent' : sendingSms ? 'Sending…' : '📱 Send SMS now'}
                  </button>
                </div>
              )}
              {l.owner_email && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,248,240,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Email to {l.owner_email}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, color: '#FFF8F0' }}>{aiMsg.email_subject}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap', color: 'rgba(255,248,240,0.85)' }}>{aiMsg.email_body}</div>
                  <button
                    onClick={sendEmail}
                    disabled={sendingEmail || emailSent}
                    style={{
                      padding: '8px 14px', borderRadius: 7,
                      background: emailSent ? '#22C55E' : sendingEmail ? 'rgba(255,255,255,0.14)' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                      color: '#fff', border: 'none', fontFamily: 'inherit',
                      fontSize: 11.5, fontWeight: 900, cursor: emailSent ? 'default' : 'pointer',
                    }}
                  >
                    {emailSent ? '✓ Sent' : sendingEmail ? 'Sending…' : '✉ Send Email now'}
                  </button>
                </div>
              )}
            </div>
          )}
          {aiError && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', color: '#FCA5A5', fontSize: 12 }}>{aiError}</div>
          )}
        </div>
      )}

      {/* Status pills */}
      <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {(['new', 'contacted', 'quoted', 'won', 'lost', 'dismissed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => onStatus(drop.id, s)}
            style={{
              padding: '6px 13px', borderRadius: 99, fontFamily: 'inherit',
              border: drop.status === s ? '1.5px solid #FF9D5A' : '1px solid rgba(255,157,90,0.2)',
              background: drop.status === s ? 'rgba(232,116,43,0.16)' : 'rgba(255,255,255,0.03)',
              color: drop.status === s ? '#FFC58A' : 'rgba(255,248,240,0.5)',
              fontSize: 11, fontWeight: 800, cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {s}
          </button>
        ))}
      </div>
      </div>
      )}
    </div>
  )
}

/**
 * OutreachSetup — the HYBRID onboarding capture (2026-06-11 per Peter).
 * Renders inline inside the lead card the FIRST time the customer tries
 * to generate AI outreach with an incomplete profile. ~45 seconds: who
 * signs, how it sounds, why homeowners should pick them. Saves once,
 * never shows again, immediately retries the message.
 */
function OutreachSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [bizName, setBizName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [tone, setTone] = useState('')
  const [props, setProps] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Prefill whatever the profile already has.
  useEffect(() => {
    fetch('/api/profile').then((r) => r.json()).then((p: { business_name?: string | null; owner_first_name?: string | null; outreach_tone?: string | null; value_props?: string[] | null }) => {
      const bn = (p.business_name ?? '').trim()
      if (bn && bn.toLowerCase() !== 'my business') setBizName(bn)
      if (p.owner_first_name) setFirstName(p.owner_first_name)
      if (p.outreach_tone) setTone(p.outreach_tone)
      if (p.value_props?.length) setProps(p.value_props.join(', '))
    }).catch(() => {})
  }, [])

  async function save() {
    setErr('')
    if (bizName.trim().length < 2) { setErr('Business name required — every message signs with it.'); return }
    if (!firstName.trim()) { setErr('Your first name — homeowners reply to people, not companies.'); return }
    if (!tone) { setErr('Pick how your messages should sound.'); return }
    const vp = props.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
    if (vp.length === 0) { setErr('Add at least one reason homeowners pick you (e.g. "family owned, 24hr service").'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: bizName.trim(),
          owner_first_name: firstName.trim(),
          outreach_tone: tone,
          value_props: vp,
        }),
      })
      if (!r.ok) { setErr('Save failed — try again.'); return }
      onDone()
    } catch { setErr('Network error — try again.') } finally { setSaving(false) }
  }

  return (
    <div style={{
      marginTop: 14, padding: '16px 16px', borderRadius: 12,
      background: 'rgba(232,116,43,0.10)', border: '1.5px solid rgba(255,157,90,0.45)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: '#FF9D5A', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
        45-second setup — then your message writes itself
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,248,240,0.6)', margin: '0 0 12px', lineHeight: 1.5 }}>
        The AI signs and personalizes every message as your shop. Set once.
      </p>
      <label style={setupLabel}>Business name</label>
      <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Mike's HVAC & Plumbing" style={setupInput} />
      <label style={{ ...setupLabel, marginTop: 10 }}>Your first name</label>
      <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mike" style={setupInput} autoComplete="given-name" />
      <label style={{ ...setupLabel, marginTop: 10 }}>Message style</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['casual', 'professional', 'direct'].map((t) => (
          <button key={t} type="button" onClick={() => setTone(t)} style={{
            padding: '8px 14px', borderRadius: 9, fontFamily: 'inherit', cursor: 'pointer',
            border: tone === t ? '1.5px solid #FF9D5A' : '1px solid rgba(255,157,90,0.25)',
            background: tone === t ? 'rgba(232,116,43,0.18)' : 'rgba(255,255,255,0.03)',
            color: tone === t ? '#FFC58A' : 'rgba(255,248,240,0.6)',
            fontSize: 12, fontWeight: 800, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>
      <label style={{ ...setupLabel, marginTop: 10 }}>Why homeowners pick you <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, color: 'rgba(255,248,240,0.35)' }}>(comma-separated)</span></label>
      <input value={props} onChange={(e) => setProps(e.target.value)} placeholder="family owned, same-day service, free estimates" style={setupInput} />
      {err && <p style={{ fontSize: 12, color: '#FCA5A5', margin: '10px 0 0', fontWeight: 700 }}>⚠ {err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={{
          flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
          color: '#fff', fontSize: 13, fontWeight: 900, fontFamily: 'inherit',
        }}>
          {saving ? 'Saving…' : 'Save + write my message →'}
        </button>
        <button onClick={onCancel} style={{
          padding: '11px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,157,90,0.2)',
          color: 'rgba(255,248,240,0.5)', fontSize: 12, fontWeight: 700,
        }}>
          Later
        </button>
      </div>
    </div>
  )
}

const setupLabel: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 900,
  color: 'rgba(255,248,240,0.6)', letterSpacing: '0.1em',
  textTransform: 'uppercase', marginBottom: 5,
}
const setupInput: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 9,
  border: '1px solid rgba(255,157,90,0.25)',
  background: 'rgba(4,12,24,0.6)',
  fontSize: 13.5, fontWeight: 600,
  fontFamily: 'inherit', color: '#FFF8F0',
  boxSizing: 'border-box', outline: 'none',
}

function pill(bg: string, color: string): React.CSSProperties {
  return {
    padding: '2px 8px', borderRadius: 6,
    background: bg, color,
    fontSize: 9, fontWeight: 900, letterSpacing: '0.06em',
    textTransform: 'uppercase',
  }
}

const darkInfoBox: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,157,90,0.16)',
  color: 'rgba(255,248,240,0.5)',
  fontSize: 12, fontWeight: 700, textAlign: 'center',
  lineHeight: 1.4,
}
