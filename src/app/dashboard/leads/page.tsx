'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEADS_PER_WEEK } from '@/lib/offer'
import LeadScanConsole from '@/components/LeadScanConsole'
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
  }
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
  // 2026-06-11 — ONE-TIME PROFILE GATE per Peter. The frictionless
  // /start/area flow doesn't collect business name (the AI signs every
  // outreach message with it). First dashboard visit: if the profile
  // still has the Clerk-webhook placeholder, show a single capture card
  // before the leads render. Lead DELIVERY is not blocked — the kick +
  // poll effects below keep running; this gates the UI only. Once a
  // real name is saved the gate never renders again.
  const [gate, setGate] = useState<'loading' | 'needed' | 'done'>('loading')
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

  async function loadLeads(): Promise<number> {
    const r = await fetch('/api/leads/list')
    const j = await r.json().catch(() => ({}))
    if (j.drops) setDrops(j.drops)
    if (j.quota) setQuota(j.quota)
    if (j.next_lead_drop_at !== undefined) setNextDropAt(j.next_lead_drop_at)
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
      .then((p: { business_name?: string | null; business_lat?: number | null; business_address?: string | null; is_active?: boolean | null }) => {
        setSubActive(p.is_active === true)
        const bn = (p.business_name ?? '').trim()
        const nameOk = !!bn && bn.toLowerCase() !== 'my business'
        // 2026-06-11 — HARD gate per Peter. Leads are useless if the
        // business address isn't geocoded — the whole 1-mile ring engine
        // silently falls back to scattered zip-radius without a lat/lng
        // (exactly the failure Peter hit on his manual-SQL test). Require
        // BOTH a real business name AND a geocoded address before any
        // lead renders. No fail-open here: a missing geocode is the one
        // thing we must never let through.
        const geoOk = typeof p.business_lat === 'number'
        setGate(nameOk && geoOk ? 'done' : 'needed')
      })
      .catch(() => setGate('needed')) // can't confirm → make them complete it
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

  // Empty-state pipeline animation (LeadScanConsole renders it).
  const [pipelineStep, setPipelineStep] = useState(0)
  useEffect(() => {
    if (drops.length > 0) return
    const id = setInterval(() => {
      setPipelineStep((s) => (s + 1) % 6)
    }, 2200)
    return () => clearInterval(id)
  }, [drops.length])

  const [scanCount, setScanCount] = useState(0)
  useEffect(() => {
    if (drops.length > 0) return
    const id = setInterval(() => {
      setScanCount((c) => (c + Math.floor(Math.random() * 7) + 3) % 2400)
    }, 240)
    return () => clearInterval(id)
  }, [drops.length])

  // SELF-DRIVING FIRST DELIVERY — kick check-and-drop on first empty
  // load, then poll every 5s while empty so the drop appears the second
  // it lands (no manual refresh).
  const [kicked, setKicked] = useState(false)
  useEffect(() => {
    if (loading || drops.length > 0 || kicked) return
    setKicked(true)
    fetch('/api/leads/check-and-drop', { method: 'POST' })
      .then((r) => r.json()).then(async (j) => { if (j.ok) await loadLeads() })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, drops.length, kicked])
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
        ) : gate === 'needed' ? (
          <ProfileGate onDone={() => setGate('done')} />
        ) : drops.length === 0 ? (
          <LeadScanConsole scanCount={scanCount} pipelineStep={pipelineStep} />
        ) : (
          <>
            {/* ── COUNTDOWN BANNER — next drop, front and center ─────── */}
            <div style={{
              borderRadius: 16, padding: '18px 22px', marginBottom: 16,
              background: 'linear-gradient(135deg, rgba(232,116,43,0.16), rgba(232,116,43,0.05))',
              border: '1px solid rgba(255,157,90,0.38)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 14, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#FF9D5A', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Next {LEADS_PER_WEEK} leads drop in
                </div>
                <div style={{ fontSize: 'clamp(26px, 5vw, 38px)', fontWeight: 900, color: '#FFF8F0', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {countdownLabel}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                <BannerStat n={thisWeek.length} label="this week" />
                <BannerStat n={monthCount} label="this month" />
                <BannerStat n={counts.won} label="won" win />
              </div>
            </div>

            {/* ── THIS WEEK'S DROP ───────────────────────────────────── */}
            <SectionHead title={`This week's leads`} sub={`${thisWeek.length} delivered · closest to you first · tap for details + AI outreach`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleWeek.length > 0 || stillRevealing
                ? (
                  <>
                    {visibleWeek.map((d) => <LeadCard key={d.id} drop={d} onStatus={updateStatus} onReveal={revealPhone} />)}
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
              <PastLeads drops={past} onStatus={updateStatus} onReveal={revealPhone} />
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes cmdLive { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
        @keyframes bavgSpin { to { transform: rotate(360deg) } }
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
function PastLeads({ drops, onStatus, onReveal }: { drops: LeadDrop[]; onStatus: (id: string, s: LeadDrop['status']) => void; onReveal: (leadId: string) => void }) {
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
          {drops.map((d) => <LeadCard key={d.id} drop={d} onStatus={onStatus} onReveal={onReveal} />)}
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

function LeadCard({ drop, onStatus, onReveal }: { drop: LeadDrop; onStatus: (id: string, s: LeadDrop['status']) => void; onReveal: (leadId: string) => void }) {
  const l = drop.lead
  const fullAddr = [l.street_address, l.city, l.state, l.zip].filter(Boolean).join(', ')
  const mapsHref = fullAddr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}` : null
  const [expanded, setExpanded] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMsg, setAiMsg] = useState<GeneratedMessage | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [sendingSms, setSendingSms] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [smsSent, setSmsSent] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function generateMessage() {
    setAiLoading(true); setAiError(null)
    try {
      const r = await fetch(`/api/leads/${l.id}/generate-message`, { method: 'POST' })
      const j = await r.json()
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
    <div style={{
      borderRadius: 13,
      background: expanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
      border: expanded ? '1.5px solid rgba(232,116,43,0.55)' : '1px solid rgba(255,157,90,0.16)',
      transition: 'border-color 180ms ease, background 180ms ease',
      overflow: 'hidden',
    }}>
      {/* Compact summary row — same shape as the homepage LeadsCard rows */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '13px 16px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: 'inherit',
          fontFamily: 'inherit',
        }}
      >
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
          {(l.home_value_est || l.year_built || l.sqft) && (
            <div style={{ fontSize: 12, color: 'rgba(255,248,240,0.6)', marginBottom: 10 }}>
              {l.home_value_est ? `~$${l.home_value_est.toLocaleString()} home` : null}
              {l.year_built ? ` · built ${l.year_built}` : null}
              {l.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : null}
            </div>
          )}
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
            <div style={darkInfoBox}>No phone on file</div>
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

      {/* AI Outreach Message — unchanged behavior */}
      {(l.owner_phone || l.owner_email) && (
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
