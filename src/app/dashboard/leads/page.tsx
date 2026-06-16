'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEADS_PER_WEEK, PRICE_MONTHLY_USD } from '@/lib/offer'
import LeadsWaiting from '@/components/LeadsWaiting'
import LeadMap from '@/components/LeadMap'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import ReferralBanner from '@/components/ReferralBanner'

/**
 * /dashboard/leads — THE dashboard.
 *
 * 2026-06-11 LIGHT-MODE TRADE-SOFTWARE REDESIGN per Peter: looks like
 * Jobber/Housecall Pro, not an AI product. 2026-06-12: canvas warmed from
 * gray #f5f6f8 to TAN per Peter, matching the homepage SampleDashboard so
 * the preview and the product are the same surface. White cards (#ffffff)
 * on light tan (#F2EAD9), warm borders (#E3D8C2 / dashed #D3C5A9), warm
 * panels (#F9F5EC / #F1EBDD), dark gray text (#1f2937 / #6b7280), ONE accent
 * (#E8742B orange) reserved for primary CTAs. No glows, no gradients,
 * no score badges on the list (plain-English reason tags instead), no
 * emoji in CTAs, 44px+ tap targets, system/Inter type at normal weights.
 * The dashboard layout owns the single header; this page renders content
 * only.
 *
 * Structure:
 *   1. Top row — compact map (left) + countdown/stats card (right).
 *   2. Lead rows — reason tag + address. Expand: property dossier,
 *      why-this-lead, call angle (cleaned permit text), phone actions,
 *      message generator ("Get a text to send them"), status pills.
 *   3. Empty state — LeadsWaiting card.
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
  // 2026-06-12 — pre-loaded AI outreach, generated server-side at list
  // load and persisted on lead_drops (per Peter: no click-and-wait).
  ai_sms?: string | null
  ai_email_subject?: string | null
  ai_email_body?: string | null
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
      // Chicago Socrata permit rows (2026-06-12): the description lives in
      // work_description, plus filing metadata worth showing.
      work_description?: string
      issue_date?: string
      reported_cost?: number
      permit_number?: string
      permit_id?: string
      permit_type?: string
      work_class?: string
      tag?: string
      // Enforcement-tier triggers (2026-06-11): violations / hearings / 311
      trigger_type?: string
      urgency_tier?: 1 | 2 | 3 | 4
      urgency_label?: string
      fine_total?: number | null
      history?: Array<{ type: string; date?: string | null; desc?: string; fine?: number | null }>
      property?: {
        beds?: number | null
        baths?: number | null
        equity?: number | null
        last_sale_date?: string | null
        // 2026-06-12 widened dossier — see lib/skipTrace.ts PropertyDetail
        last_sale_price?: number | null
        lot_sqft?: number | null
        stories?: number | null
        pool?: boolean | null
        garage_spaces?: number | null
        owner_occupied?: boolean | null
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

/**
 * 2026-06-11 redesign — plain-English reason tag replaces "SCORE 86" on
 * the list view (score stays in the DB; a 55-year-old roofer doesn't
 * think in scores, he thinks "fence permit, this week").
 */
const PERMIT_KEYWORDS: Array<[RegExp, string]> = [
  [/fence/i, 'Fence permit filed'],
  [/roof/i, 'Roof permit filed'],
  [/garage/i, 'Garage permit filed'],
  [/deck|porch/i, 'Deck/porch permit filed'],
  [/electric/i, 'Electrical permit filed'],
  [/mechanical|hvac|heating|furnace|air condition/i, 'HVAC permit filed'],
  [/plumb|water heater|sewer/i, 'Plumbing permit filed'],
  [/renovation|alteration|remodel/i, 'Renovation permit filed'],
  [/demolition/i, 'Demolition permit filed'],
]
/**
 * Urgency tag styling by tier — colored plain-English chips for the
 * enforcement-tier sources. Tier 1 (fines/hearings) reads as the legal
 * emergency it is.
 */
function urgencyTagStyle(tier?: 1 | 2 | 3 | 4): { bg: string; color: string; border: string } {
  if (tier === 1) return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
  if (tier === 2) return { bg: '#fef3ec', color: '#c2410c', border: '#fed7aa' }
  if (tier === 3) return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }
  return { bg: '#F1EBDD', color: '#4b5563', border: '#E3D8C2' }
}

function reasonTag(l: LeadDrop['lead']): string {
  // Enforcement-tier leads carry a ready plain-English urgency label
  // ("Fined $4,000 — hearing Oct 19" / "Cited: roofing repair required").
  if (l.source_details?.urgency_label) return l.source_details.urgency_label
  if (l.source === 'permit') {
    const blob = `${l.source_details?.description ?? ''} ${l.source_details?.permit_type ?? ''} ${l.source_details?.work_class ?? ''}`
    for (const [re, label] of PERMIT_KEYWORDS) if (re.test(blob)) return label
    return 'Permit filed'
  }
  if (l.source === 'move_in') return 'Just bought this home'
  if (l.source === 'storm') return 'Storm-hit area'
  if (l.source === 'expired_listing') return 'Recently sold'
  const tag = l.source_details?.tag || ''
  if (/recent-buyer/.test(tag)) return 'Just bought this home'
  if (/aging/.test(tag)) return 'Aging-home profile'
  return 'New lead'
}

/**
 * Call-angle cleanup — permit pitches arrive with raw municipal text
 * (ALL CAPS, quote artifacts like 6'-0' ', code references). Normalize to
 * 1-2 plain sentences at render time.
 */
function cleanCallAngle(text: string): string {
  let t = text
    .replace(/'\s*'+/g, '"')                  // 24'-0' ' -> 24'-0"
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Sentence-case any ALL-CAPS run of 3+ words.
  t = t.replace(/\b([A-Z][A-Z0-9'"\-.,/&: ]{12,})\b/g, (run) => {
    const lower = run.toLowerCase()
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  })
  // Strip noisy municipal code prefixes ("Sc 2019 cbrc:" etc).
  t = t.replace(/\b(?:sc|per)\s*\d{4}\s*[a-z]{2,5}:\s*/gi, '')
  // Tidy double punctuation + ensure it ends like a sentence.
  t = t.replace(/\.\s*\./g, '.').trim()
  if (t && !/[.!?]$/.test(t)) t += '.'
  return t
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

  // 2026-06-11 LIGHT-MODE TRADE-SOFTWARE REDESIGN per Peter ("Jobber, not
  // an AI/crypto product — 45-65yo contractor on his phone in daylight").
  // The page-level dark top bar was DELETED; the dashboard layout owns the
  // single header. Presentational refactor only — zero logic changes.
  return (
    <main style={{
      minHeight: '100vh',
      background: '#F2EAD9',
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      color: '#1f2937',
      paddingBottom: 80,
    }}>
      <div style={{ maxWidth: 1024, margin: '0 auto', padding: '20px clamp(14px, 3vw, 28px) 0' }}>
        {/* Refer-a-shop banner — self-hides for non-active customers (no
            /api/referrals/me data) and once dismissed. The referral flywheel
            entry point; full page at /dashboard/refer. */}
        <ReferralBanner />
        {loading || gate === 'loading' || subActive === null ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#6b7280', fontSize: 13, fontWeight: 600 }}>
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
                borderRadius: 8, padding: '10px 14px', marginBottom: 12,
                background: '#fffbeb', border: '1px solid #fcd34d',
                fontSize: 12, color: '#92400e', fontWeight: 600, lineHeight: 1.5,
              }}>
                Lead engine: {engineNote}
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
              {/* Countdown card */}
              <div style={{
                borderRadius: 12, padding: '18px 22px',
                background: '#ffffff',
                border: '1px solid #E3D8C2',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                gap: 14,
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    Next {LEADS_PER_WEEK} leads drop in
                  </div>
                  <div style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 700, color: '#1f2937', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                    {countdownLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center' }}>
                  <BannerStat n={thisWeek.length} label="this week" />
                  <BannerStat n={monthCount} label="this month" />
                  {counts.won >= 1 ? (
                    <BannerStat n={counts.won} label="won" win />
                  ) : (
                    // No wins yet — a number 0 demoralizes; a next action sells.
                    <span style={{
                      fontSize: 12.5, fontWeight: 600, color: '#374151',
                      background: '#F1EBDD', border: '1px solid #E3D8C2',
                      padding: '8px 12px', borderRadius: 8,
                    }}>
                      {thisWeek.length} leads waiting — call your top 3 today
                    </span>
                  )}
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
                        padding: '13px 16px', borderRadius: 10,
                        background: '#ffffff',
                        border: '1px dashed #D3C5A9',
                        color: '#6b7280', fontSize: 12.5, fontWeight: 600,
                      }}>
                        <span aria-hidden style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                          border: '2px solid #E3D8C2', borderTopColor: '#E8742B',
                          animation: 'bavgSpin 0.9s linear infinite',
                        }} />
                        Finding lead {Math.min(revealed + 1, thisWeek.length)} of {thisWeek.length}…
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



const emptyNote: React.CSSProperties = {
  padding: '20px', borderRadius: 10, textAlign: 'center',
  background: '#ffffff', border: '1px dashed #D3C5A9',
  color: '#6b7280', fontSize: 12.5,
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
      borderRadius: 10, padding: '12px 16px', marginBottom: 14,
      background: '#ffffff',
      border: '1px solid #E3D8C2',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', flex: 1, minWidth: 200 }}>
        {open
          ? 'What name should your messages sign as?'
          : 'Add your business name so outreach signs as your shop (not required to view leads).'}
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
              padding: '10px 12px', borderRadius: 8, minWidth: 160, minHeight: 44, boxSizing: 'border-box',
              border: '1px solid #D3C5A9', background: '#ffffff',
              color: '#1f2937', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', outline: 'none',
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
    padding: '10px 16px', borderRadius: 8, cursor: 'pointer', minHeight: 44,
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700, flexShrink: 0,
    border: primary ? 'none' : '1px solid #D3C5A9',
    background: primary ? '#E8742B' : '#ffffff',
    color: primary ? '#fff' : '#6b7280',
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
      borderRadius: 12, padding: 'clamp(22px, 4vw, 32px)',
      background: '#ffffff',
      border: '1px solid #E3D8C2',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      maxWidth: 560, margin: '40px auto 0', textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
        Account created — area not activated yet
      </div>
      <h2 style={{ fontSize: 'clamp(20px, 2.8vw, 26px)', fontWeight: 700, margin: '0 0 10px', color: '#1f2937' }}>
        Your leads start the moment you lock your area.
      </h2>
      <p style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.6, margin: '0 0 20px' }}>
        Pick your business address and trade — your first {LEADS_PER_WEEK} homeowner
        leads pull from a 1-mile ring around your shop, usually within 30 minutes.
      </p>
      <Link href="/start/area" style={{
        display: 'inline-block', padding: '14px 28px', borderRadius: 10, minHeight: 44, boxSizing: 'border-box',
        background: '#E8742B',
        color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15,
      }}>
        Lock my area
      </Link>
      <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '14px 0 0', lineHeight: 1.5 }}>
        2 weeks free, then $197/mo. Cancel anytime, and you keep every lead.
      </p>
    </div>
  )
}

function BannerStat({ n, label, win }: { n: number; label: string; win?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: win ? '#16a34a' : '#1f2937', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 2px 12px', flexWrap: 'wrap', gap: 8 }}>
      <h2 style={{ fontSize: 'clamp(17px, 2.2vw, 21px)', fontWeight: 700, margin: 0, color: '#1f2937' }}>{title}</h2>
      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{sub}</span>
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
          padding: '12px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
          background: '#ffffff', border: '1px solid #E3D8C2',
          color: '#374151', fontSize: 13, fontWeight: 700,
        }}
      >
        <span>Past leads ({drops.length})</span>
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease', color: '#9ca3af' }}>▾</span>
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
    return <div style={{ padding: 50, textAlign: 'center', color: '#6b7280', fontSize: 13, fontWeight: 600 }}>Loading…</div>
  }

  return (
    <div style={{
      borderRadius: 12, padding: 'clamp(20px, 4vw, 30px)',
      background: '#ffffff',
      border: '1px solid #E3D8C2',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      maxWidth: 560, margin: '0 auto',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#16a34a',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10,
      }}>
        One last step — your leads are already being pulled
      </div>
      <h2 style={{ fontSize: 'clamp(19px, 2.6vw, 24px)', fontWeight: 700, margin: '0 0 8px', color: '#1f2937' }}>
        Who do we sign your outreach as?
      </h2>
      <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, margin: '0 0 18px' }}>
        Every message to a homeowner is written and signed as <strong style={{ color: '#1f2937' }}>your shop</strong> — never BellAveGo. Set it once; change anytime in Settings.
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
        <label style={{ ...gateLabel, marginTop: 14 }}>Your first name <span style={{ color: '#9ca3af', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional — messages sign with it)</span></label>
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
        <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '6px 0 0', lineHeight: 1.5 }}>
          Pick from the dropdown so we lock the exact spot. Your leads start 1 mile from here and widen only when nearby supply runs low.
        </p>

        {err && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '12px 0 0', fontWeight: 600 }}>{err}</p>}

        <button type="submit" disabled={saving} style={{
          marginTop: 18, width: '100%', padding: '14px 18px', borderRadius: 10, minHeight: 48,
          background: saving ? '#F1EBDD' : '#E8742B',
          color: saving ? '#9ca3af' : '#fff',
          fontWeight: 700, fontSize: 15, border: 'none',
          cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}>
          {saving ? 'Saving…' : 'Save — show me my leads'}
        </button>
      </form>
    </div>
  )
}

const gateLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 6,
}
const gateInput: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 8, minHeight: 44,
  border: '1px solid #D3C5A9',
  background: '#ffffff',
  fontSize: 15, fontWeight: 500,
  fontFamily: 'inherit', color: '#1f2937',
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
  // 2026-06-12 — pre-loaded outreach: when the server already generated +
  // persisted the message (drop.ai_*), the card opens with it ready to
  // send. The generate button remains only for drops the server couldn't
  // pre-fill (incomplete profile / Sonnet queue still draining).
  const preloaded: GeneratedMessage | null = drop.ai_sms || drop.ai_email_subject
    ? { sms: drop.ai_sms ?? '', email_subject: drop.ai_email_subject ?? '', email_body: drop.ai_email_body ?? '' }
    : null
  const [aiOpen, setAiOpen] = useState(!!preloaded)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMsg, setAiMsg] = useState<GeneratedMessage | null>(preloaded)
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

  // 2026-06-11 — signalLabel + on-card score deleted; reasonTag() renders
  // the plain-English reason instead. lead_score stays in the DB.
  const pitch = l.pitch_script || (l.source === 'aging_hvac'
    ? `Hi, calling neighbors in ${l.zip} where most homes are 20+ yrs old — AC units past their lifespan. Got a min to talk about a free tune-up to extend yours?`
    : null)
  const statusColor =
    drop.status === 'won' ? '#16a34a'
    : drop.status === 'lost' || drop.status === 'dismissed' ? '#dc2626'
    : drop.status === 'quoted' ? '#b45309'
    : drop.status === 'contacted' ? '#c2410c'
    : '#6b7280'

  return (
    <div id={`lead-${l.id}`} style={{
      borderRadius: 10,
      background: '#ffffff',
      border: expanded ? '1px solid #E8742B' : '1px solid #E3D8C2',
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      transition: 'border-color 180ms ease',
      overflow: 'hidden',
    }}>
      {/* Compact summary row — same shape as the homepage LeadsCard rows */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', minHeight: 56, background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        {typeof index === 'number' && (
          <span aria-hidden style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: l.owner_phone ? '#E8742B' : '#9ca3af',
            border: 'none',
            color: '#fff', fontSize: 11, fontWeight: 700,
          }}>
            {index}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
              {l.owner_name ?? 'Owner unlisted'}
            </span>
            {/* 2026-06-11 — plain-English reason replaces SCORE badge;
                enforcement-tier leads color by urgency (red = fines). */}
            {(() => {
              const u = urgencyTagStyle(l.source_details?.urgency_tier ?? (l.source === 'permit' && !l.source_details?.trigger_type ? 4 : 2))
              return (
                <span style={{
                  padding: '3px 9px', borderRadius: 6,
                  background: u.bg, color: u.color, border: `1px solid ${u.border}`,
                  fontSize: 11, fontWeight: 600,
                }}>{reasonTag(l)}</span>
              )
            })()}
            {drop.status !== 'new' && (
              <span style={pill('#F1EBDD', statusColor)}>
                {drop.status}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {fullAddr || l.zip}{l.year_built ? ` · built ${l.year_built}` : ''}{l.home_value_est ? ` · $${Math.round(l.home_value_est / 1000)}K home` : ''}
          </div>
        </div>
        {l.owner_phone && (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>
            Phone verified
          </span>
        )}
        <div style={{ fontSize: 13, color: '#9ca3af', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>
          ▾
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
      <div style={{ padding: '0 18px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: urgencyTagStyle(l.source_details?.urgency_tier).color, marginBottom: 6 }}>
            {reasonTag(l)}
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
            if (prop?.stories) chips.push(`🪜 ${prop.stories} ${prop.stories === 1 ? 'story' : 'stories'}`)
            if (prop?.lot_sqft) chips.push(`🌳 ${prop.lot_sqft >= 21780 ? `${(prop.lot_sqft / 43560).toFixed(1)} acre lot` : `${prop.lot_sqft.toLocaleString()} sqft lot`}`)
            if (prop?.garage_spaces) chips.push(`🚗 ${prop.garage_spaces}-car garage`)
            if (prop?.pool) chips.push(`🏊 pool`)
            if (l.home_value_est) chips.push(`💰 ~$${Math.round(l.home_value_est / 1000)}K value`)
            if (prop?.last_sale_price) chips.push(`🧾 bought for $${Math.round(prop.last_sale_price / 1000)}K`)
            if (prop?.equity) chips.push(`🏦 ~$${Math.round(prop.equity / 1000)}K equity`)
            if (yearsOwned !== null && yearsOwned > 0) chips.push(`🗓 owned ${yearsOwned} yrs`)
            if (prop?.owner_occupied === true) chips.push(`🔑 owner lives here`)
            if (chips.length === 0 && !l.owner_email && !jobs) return null
            return (
              <div style={{
                background: '#F9F5EC', padding: '12px 14px', borderRadius: 8,
                border: '1px solid #E3D8C2', marginBottom: 10,
              }}>
                <span style={{ color: '#374151', fontWeight: 700, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Property details</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {chips.map((c) => (
                    <span key={c} style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: c.startsWith('🏦') ? '#f0fdf4' : '#ffffff',
                      border: c.startsWith('🏦') ? '1px solid #bbf7d0' : '1px solid #E3D8C2',
                      color: c.startsWith('🏦') ? '#15803d' : '#374151',
                    }}>{c}</span>
                  ))}
                </div>
                {prop?.equity && prop.equity > 50_000 && (
                  <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginTop: 7 }}>
                    Equity says they can afford the job — quote with confidence.
                  </div>
                )}
                {yearsOwned !== null && yearsOwned >= 10 && (
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 4 }}>
                    {yearsOwned}+ years in the home — systems and surfaces aging on their watch, not a flipper.
                  </div>
                )}
                {prop?.last_sale_price && l.home_value_est && l.home_value_est > prop.last_sale_price * 1.15 ? (
                  <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginTop: 4 }}>
                    Home up ~${Math.round((l.home_value_est - prop.last_sale_price) / 1000)}K since they bought — room in the budget for this job.
                  </div>
                ) : null}
                {prop?.owner_occupied === false && (
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 4 }}>
                    Owner doesn&rsquo;t live at the property — likely a landlord. Pitch fast scheduling and tenant-proof work.
                  </div>
                )}
                {jobs && (
                  <div style={{
                    marginTop: 9, padding: '9px 12px', borderRadius: 6,
                    background: '#fef3ec', border: '1px solid #fed7aa',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Est. job value at this home</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#c2410c' }}>
                      ${jobs[0].toLocaleString()} – ${jobs[1].toLocaleString()}
                      {monthsCovered ? <span style={{ fontSize: 11, fontWeight: 500, color: '#92400e' }}> · ≈ {monthsCovered} mo of membership</span> : null}
                    </span>
                  </div>
                )}
                {l.owner_email && (
                  <div style={{ fontSize: 11.5, marginTop: 8 }}>
                    Email: <a href={`mailto:${l.owner_email}`} style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>{l.owner_email}</a>
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
            const permitLine = [sd?.permit_type, sd?.work_class, sd?.description || sd?.work_description].filter(Boolean).join(' · ')
            // Filing metadata — the city record itself is the dossier for
            // permit leads BatchData can't enrich (no parcel coverage).
            const permitMeta = [
              sd?.issue_date ? `Filed ${new Date(sd.issue_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : null,
              sd?.reported_cost ? `reported project cost $${sd.reported_cost >= 1_000_000 ? `${(sd.reported_cost / 1_000_000).toFixed(1)}M` : `${Math.round(sd.reported_cost / 1000)}K`}` : null,
              (sd?.permit_number || sd?.permit_id) ? `permit #${sd.permit_number || sd.permit_id}` : null,
            ].filter(Boolean).join(' · ')
            if (tags.length === 0 && !permitLine) return null
            return (
              <div style={{
                background: '#F9F5EC', padding: '12px 14px', borderRadius: 8,
                border: '1px solid #E3D8C2',
                fontSize: 12.5, color: '#374151', lineHeight: 1.6, marginBottom: 10,
              }}>
                <span style={{ color: '#374151', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 5 }}>Why this lead</span>
                {tags.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {tags.map((t, i) => <li key={i} style={{ marginBottom: 2 }}>{t}</li>)}
                  </ul>
                ) : (
                  <span>Permit on file: {cleanCallAngle(permitLine)}</span>
                )}
                {permitMeta && (
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 6 }}>{permitMeta}</div>
                )}
                {/* Full city-action history when one address carries multiple
                    triggers (violation + hearings case merged by address). */}
                {(sd?.history?.length ?? 0) > 1 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E3D8C2' }}>
                    <span style={{ fontWeight: 700, fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>City action history</span>
                    {sd!.history!.slice(0, 5).map((h, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#4b5563', marginBottom: 2 }}>
                        {h.date ? `${new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ` : ''}
                        {h.type === 'hearings_case' ? 'Hearings case' : h.type === 'failed_inspection' ? 'Failed inspection' : h.type === '311' ? '311 complaint' : 'Violation'}
                        {h.fine ? ` ($${Math.round(h.fine).toLocaleString()} fine)` : ''}
                        {h.desc ? `: ${cleanCallAngle(h.desc)}` : ''}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
          {pitch && (
            <div style={{
              background: '#fef3ec', padding: '12px 14px', borderRadius: 8,
              border: '1px solid #fed7aa',
              fontSize: 13, color: '#431407', lineHeight: 1.55, marginBottom: 10,
            }}>
              <span style={{ color: '#c2410c', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Your call angle</span>
              {cleanCallAngle(pitch)}
            </div>
          )}
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, color: '#1d4ed8', textDecoration: 'none', fontWeight: 600, minHeight: 44,
            }}>
              View property on Google Maps
            </a>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
          {/* Phone reveal state machine — unchanged behavior */}
          {l.owner_phone ? (
            <>
              <a href={`tel:${l.owner_phone}`} style={{
                padding: '13px 18px', borderRadius: 8, minHeight: 48, boxSizing: 'border-box',
                background: '#E8742B',
                color: '#fff', textDecoration: 'none', textAlign: 'center',
                fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                Call {l.owner_phone}
              </a>
              <a href={`sms:${l.owner_phone}`} style={{
                padding: '12px 18px', borderRadius: 8, minHeight: 44, boxSizing: 'border-box',
                background: '#ffffff', border: '1px solid #D3C5A9',
                color: '#374151', textDecoration: 'none', textAlign: 'center',
                fontSize: 13.5, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                Text
              </a>
            </>
          ) : l.skip_trace_attempted_at && l.skip_trace_hit === false ? (
            // 2026-06-11 — a missed trace is retryable now (server allows
            // re-trace on miss). Dead-end box → action.
            <button onClick={() => onReveal(l.id)} style={{
              padding: '12px 18px', borderRadius: 8, minHeight: 48,
              background: '#ffffff', border: '1px dashed #D3C5A9',
              color: '#374151', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', lineHeight: 1.4,
            }}>
              No phone found yet<br />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>Search again</span>
            </button>
          ) : l.skip_trace_attempted_at ? (
            <div style={{ ...darkInfoBox, color: '#6b7280' }}>Looking up…</div>
          ) : l.street_address ? (
            <button onClick={() => onReveal(l.id)} style={{
              padding: '13px 18px', borderRadius: 8, minHeight: 48,
              background: '#E8742B',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            }}>
              Find their phone
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
              onClick={() => (aiMsg ? setAiOpen(true) : generateMessage())}
              disabled={aiLoading}
              style={{
                width: '100%', padding: '13px 18px', borderRadius: 8, minHeight: 48,
                background: aiLoading ? '#F1EBDD' : '#ffffff',
                color: aiLoading ? '#9ca3af' : '#374151',
                border: '1px solid #D3C5A9', cursor: aiLoading ? 'wait' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              {aiLoading ? 'Writing your message…' : aiMsg ? 'Show ready-to-send message' : 'Get a text to send them'}
            </button>
          ) : aiMsg && (
            <div style={{ background: '#F9F5EC', borderRadius: 8, padding: '14px 16px', border: '1px solid #E3D8C2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ready to send as your shop
                </div>
                <button onClick={() => setAiOpen(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: 14, cursor: 'pointer', minWidth: 44, minHeight: 44 }}>✕</button>
              </div>
              {l.owner_phone && aiMsg.sms && (
                <div style={{ marginBottom: 10, padding: '11px 13px', borderRadius: 8, background: '#ffffff', border: '1px solid #E3D8C2' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Text to {l.owner_phone}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, marginBottom: 8, color: '#1f2937' }}>{aiMsg.sms}</div>
                  <button
                    onClick={sendSms}
                    disabled={sendingSms || smsSent}
                    style={{
                      padding: '11px 16px', borderRadius: 8, minHeight: 44,
                      background: smsSent ? '#16a34a' : sendingSms ? '#E3D8C2' : '#E8742B',
                      color: '#fff', border: 'none', fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 700, cursor: smsSent ? 'default' : 'pointer',
                    }}
                  >
                    {smsSent ? 'Sent' : sendingSms ? 'Sending…' : 'Send text now'}
                  </button>
                </div>
              )}
              {l.owner_email && aiMsg.email_subject && (
                <div style={{ padding: '11px 13px', borderRadius: 8, background: '#ffffff', border: '1px solid #E3D8C2' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Email to {l.owner_email}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: '#1f2937' }}>{aiMsg.email_subject}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap', color: '#374151' }}>{aiMsg.email_body}</div>
                  <button
                    onClick={sendEmail}
                    disabled={sendingEmail || emailSent}
                    style={{
                      padding: '11px 16px', borderRadius: 8, minHeight: 44,
                      background: emailSent ? '#16a34a' : sendingEmail ? '#E3D8C2' : '#E8742B',
                      color: '#fff', border: 'none', fontFamily: 'inherit',
                      fontSize: 13, fontWeight: 700, cursor: emailSent ? 'default' : 'pointer',
                    }}
                  >
                    {emailSent ? 'Sent' : sendingEmail ? 'Sending…' : 'Send email now'}
                  </button>
                </div>
              )}
            </div>
          )}
          {aiError && (
            <div style={{ marginTop: 8, padding: '9px 13px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5 }}>{aiError}</div>
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
              padding: '10px 16px', borderRadius: 8, fontFamily: 'inherit', minHeight: 44,
              border: drop.status === s ? '1px solid #E8742B' : '1px solid #E3D8C2',
              background: drop.status === s ? '#fef3ec' : '#ffffff',
              color: drop.status === s ? '#c2410c' : '#6b7280',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
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
      marginTop: 14, padding: '16px 16px', borderRadius: 10,
      background: '#F9F5EC', border: '1px solid #E3D8C2',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        45-second setup — then your message writes itself
      </div>
      <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 12px', lineHeight: 1.5 }}>
        Messages are personalized and signed as your shop. Set once.
      </p>
      <label style={setupLabel}>Business name</label>
      <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Mike's HVAC & Plumbing" style={setupInput} />
      <label style={{ ...setupLabel, marginTop: 10 }}>Your first name</label>
      <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mike" style={setupInput} autoComplete="given-name" />
      <label style={{ ...setupLabel, marginTop: 10 }}>Message style</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['casual', 'professional', 'direct'].map((t) => (
          <button key={t} type="button" onClick={() => setTone(t)} style={{
            padding: '10px 16px', borderRadius: 8, fontFamily: 'inherit', cursor: 'pointer', minHeight: 44,
            border: tone === t ? '1px solid #E8742B' : '1px solid #D3C5A9',
            background: tone === t ? '#fef3ec' : '#ffffff',
            color: tone === t ? '#c2410c' : '#6b7280',
            fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>
      <label style={{ ...setupLabel, marginTop: 10 }}>Why homeowners pick you <span style={{ fontWeight: 500, color: '#9ca3af' }}>(comma-separated)</span></label>
      <input value={props} onChange={(e) => setProps(e.target.value)} placeholder="family owned, same-day service, free estimates" style={setupInput} />
      {err && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0', fontWeight: 600 }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={saving} style={{
          flex: 1, padding: '12px 16px', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', minHeight: 48,
          background: saving ? '#F1EBDD' : '#E8742B',
          color: saving ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        }}>
          {saving ? 'Saving…' : 'Save and write my message'}
        </button>
        <button onClick={onCancel} style={{
          padding: '12px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48,
          background: '#ffffff', border: '1px solid #D3C5A9',
          color: '#6b7280', fontSize: 13, fontWeight: 600,
        }}>
          Later
        </button>
      </div>
    </div>
  )
}

const setupLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600,
  color: '#374151', marginBottom: 5,
}
const setupInput: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 8, minHeight: 44,
  border: '1px solid #D3C5A9',
  background: '#ffffff',
  fontSize: 14, fontWeight: 500,
  fontFamily: 'inherit', color: '#1f2937',
  boxSizing: 'border-box', outline: 'none',
}

function pill(bg: string, color: string): React.CSSProperties {
  return {
    padding: '3px 9px', borderRadius: 6,
    background: bg, color,
    fontSize: 10.5, fontWeight: 600,
    textTransform: 'capitalize',
  }
}

const darkInfoBox: React.CSSProperties = {
  padding: '12px 14px', borderRadius: 8,
  background: '#F9F5EC',
  border: '1px solid #E3D8C2',
  color: '#6b7280',
  fontSize: 12.5, fontWeight: 600, textAlign: 'center',
  lineHeight: 1.4,
}
