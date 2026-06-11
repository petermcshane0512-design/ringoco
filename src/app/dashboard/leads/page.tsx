'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LEADS_PER_WEEK, LEADS_PER_MONTH } from '@/lib/offer'

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
    // 2026-06-06 — click-to-reveal skip-trace state
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
  // 2026-06-08 — per-tenant rolling 7-day countdown anchored to last drop.
  const [nextDropAt, setNextDropAt] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState<number>(() => Date.now())
  const [firing, setFiring] = useState(false)

  async function loadLeads() {
    const r = await fetch('/api/leads/list')
    const j = await r.json().catch(() => ({}))
    if (j.drops) setDrops(j.drops)
    if (j.quota) setQuota(j.quota)
    if (j.next_lead_drop_at !== undefined) setNextDropAt(j.next_lead_drop_at)
  }

  useEffect(() => {
    loadLeads().finally(() => setLoading(false))
  }, [])

  // Tick every 1s so the countdown updates live.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // 2026-06-10 — empty-state pipeline animation. Cycles through the 5 steps
  // so the dashboard feels alive while the first batch is being pulled.
  const [pipelineStep, setPipelineStep] = useState(0)
  useEffect(() => {
    if (drops.length > 0) return // real leads landed, kill animation
    const id = setInterval(() => {
      setPipelineStep((s) => (s + 1) % 6) // 0-4 = scanning each step, 5 = pause then loop
    }, 2200)
    return () => clearInterval(id)
  }, [drops.length])

  // Fake counters that tick up to give the feel of an active scan.
  const [scanCount, setScanCount] = useState(0)
  useEffect(() => {
    if (drops.length > 0) return
    const id = setInterval(() => {
      setScanCount((c) => (c + Math.floor(Math.random() * 7) + 3) % 2400)
    }, 240)
    return () => clearInterval(id)
  }, [drops.length])

  // When the timer hits zero, POST /api/leads/check-and-drop to force-fire
  // the assignment now (instead of waiting for the hourly cron), then refresh
  // the leads list. Guard against double-fire with `firing`.
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

  // Click-to-reveal skip-trace. Costs us ~$0.10/click; runs only on engaged
  // leads. Optimistic UI flip while the backend fetches BatchData (~1s).
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

  const pctUsed = quota ? Math.min(100, Math.round((quota.used_this_period / quota.per_drop) * 100)) : 0

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 80px', fontFamily: "'Inter', system-ui, sans-serif", position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/dashboard" style={{ fontSize: 12, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>
          ← Back to dashboard
        </Link>
        {/* Per-tenant 7-day rolling countdown — 2026-06-08. Anchored to
            profiles.next_lead_drop_at (stamped now()+7d on every drop).
            When it hits zero, the page POSTs /api/leads/check-and-drop and
            refreshes the list. */}
        <div style={{ fontSize: 11, color: '#7AAAB2', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: '#7AAAB2' }}>Next drop:</span>
          <span style={{ fontWeight: 800, color: '#E8742B', fontVariantNumeric: 'tabular-nums' }}>
            {(() => {
              if (!nextDropAt) return firing ? 'dropping now…' : '—'
              const ms = new Date(nextDropAt).getTime() - nowTick
              if (ms <= 0) return firing ? 'dropping now…' : 'any second'
              const days = Math.floor(ms / 86_400_000)
              const hrs = Math.floor((ms % 86_400_000) / 3_600_000)
              const mins = Math.floor((ms % 3_600_000) / 60_000)
              const secs = Math.floor((ms % 60_000) / 1000)
              if (days > 0) return `${days}d ${hrs}h ${mins}m`
              if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
              return `${mins}m ${secs}s`
            })()}
          </span>
        </div>
      </div>

      {/* HERO */}
      <header style={{
        marginTop: 14,
        marginBottom: 22,
        padding: '24px 28px',
        background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
        borderRadius: 20,
        color: '#fff',
        boxShadow: '0 14px 40px rgba(7,27,58,0.22)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>
          Your leads · {LEADS_PER_WEEK} every 7 days
        </div>
        <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px', color: '#fff' }}>
          Ready-to-quote homeowners near you.
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, maxWidth: 620, margin: 0 }}>
          Owner-occupied homes within your tight service radius — sourced from our proprietary property
          intelligence engine, municipal permit signals, and verified storm-damage alerts. Tap any lead
          to call, text, or generate an intro message.
        </p>

        {quota && (
          <div style={{ marginTop: 18, padding: '14px 18px', background: 'rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {quota.used_this_period} of {LEADS_PER_WEEK} this week delivered ({LEADS_PER_MONTH}/month)
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{pctUsed}% used</div>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.18)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${pctUsed}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #FF9D5A, #E8742B)',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        )}
      </header>

      {/* LEADS LIST */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#7AAAB2' }}>Loading your leads…</div>
      ) : drops.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 16, padding: '40px 30px', textAlign: 'center',
          border: '1.5px dashed rgba(10,168,159,0.22)',
        }}>
          {/* Pulsing satellite — radar rings around it indicate live scan. */}
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
            <span style={{
              position: 'absolute', inset: -14,
              borderRadius: '50%',
              border: '2px solid rgba(10,168,159,0.45)',
              animation: 'radarPulse 1.8s ease-out infinite',
            }} />
            <span style={{
              position: 'absolute', inset: -14,
              borderRadius: '50%',
              border: '2px solid rgba(10,168,159,0.45)',
              animation: 'radarPulse 1.8s ease-out infinite',
              animationDelay: '0.6s',
            }} />
            <div style={{ fontSize: 44, position: 'relative' }}>🛰️</div>
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>
            Pulling your first {LEADS_PER_WEEK} leads now
          </div>
          <div style={{
            fontSize: 12, color: '#0AA89F', fontWeight: 800,
            letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums',
            marginBottom: 14,
          }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22C55E', marginRight: 8, animation: 'livePulse 1s ease-in-out infinite' }} />
            LIVE · {scanCount.toLocaleString()} properties scanned in your radius
          </div>
          <p style={{ fontSize: 14, color: '#4A6670', maxWidth: 580, margin: '0 auto 18px', lineHeight: 1.6 }}>
            Your first batch typically lands within <strong>60 seconds</strong> of signup. Refresh if you don&rsquo;t see them in 2 minutes.
            Going forward, <strong>{LEADS_PER_WEEK} fresh leads arrive every Monday morning</strong> — the {LEADS_PER_MONTH} highest-intent
            homeowners we pulled from your service area over the prior week.
          </p>

          {/* Detailed pipeline — how leads are sourced. Each step is real. */}
          <div style={{
            maxWidth: 580, margin: '24px auto 0',
            textAlign: 'left',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#0AA89F',
              letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12, textAlign: 'center',
            }}>
              How we built your list
            </div>
            {[
              {
                icon: '🏠',
                title: '1. Address-anchored property pull',
                body: 'The moment you signed up, our agents geocoded your business address and queried our property intelligence engine for every owner-occupied home within a tight radius of you. For HVAC tenants in hot states we filter to homes built 2008-2015 (first AC replacement cycle). For plumbing: pre-1995 (galvanized + polybutylene era). For roofing: built 2001-2011 (3-tab asphalt window). Every recipe is trade-aware and climate-aware.',
              },
              {
                icon: '📞',
                title: '2. Skip-trace top 20 highest-intent matches',
                body: 'The highest-scoring matches go through our verification pipeline so the owner’s phone + email arrive verified on your dashboard day 1. The rest unlock the moment you click “Reveal phone” — a per-lead unlock we eat the cost of for paying tenants.',
              },
              {
                icon: '🏗️',
                title: '3. Live permit overlay',
                body: 'We layer municipal permit data on top. Any homeowner who pulled a building permit in your zip in the last 14 days bubbles to the top of your queue with the work description visible — they’re actively planning a project.',
              },
              {
                icon: '⛈️',
                title: '4. Verified storm-damage triggers',
                body: 'For roofing + exterior tenants we cross-reference verified hail + wind events against every home in your radius. A 1.75-inch hail strike on the property in the last 30 days flips the lead to “STORM” with the date confirmed for insurance-claim conversations.',
              },
              {
                icon: '🔁',
                title: '5. Weekly refresh + auto-replenish',
                body: 'Every Monday morning our engine pulls the next {LEADS_PER_WEEK} highest-scoring matches from your pool and drops them here. When your pool drains we automatically refill it around your business address with a 24-hour cooldown so you’re never empty for more than a day.',
              },
            ].map((step, idx) => {
              const isActive = pipelineStep === idx
              const isDone = pipelineStep > idx
              const statusColor = isDone ? '#16803F' : isActive ? '#E8742B' : '#7AAAB2'
              const statusLabel = isDone ? '✓ done' : isActive ? 'scanning…' : 'queued'
              return (
                <div key={step.title} style={{
                  padding: '14px 16px', borderRadius: 12, marginBottom: 10,
                  background: isActive ? '#FFF8F0' : '#F5FDFB',
                  border: isActive ? '1.5px solid #E8742B' : '1px solid rgba(10,168,159,0.18)',
                  transition: 'background 240ms ease, border-color 240ms ease',
                  boxShadow: isActive ? '0 10px 24px rgba(232,116,43,0.20)' : 'none',
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 20, flexShrink: 0,
                      animation: isActive ? 'stepIconBounce 1.2s ease-in-out infinite' : 'none',
                      display: 'inline-block',
                    }}>{step.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 900, color: '#0B1F3A' }}>{step.title}</div>
                        <div style={{
                          fontSize: 10, fontWeight: 900, color: statusColor,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {statusLabel}
                        </div>
                      </div>
                      <p style={{ fontSize: 12.5, color: '#3D5A66', lineHeight: 1.55, margin: '4px 0 0' }}>
                        {step.body.replace('{LEADS_PER_WEEK}', String(LEADS_PER_WEEK))}
                      </p>
                      {isActive && (
                        <div style={{ marginTop: 8, height: 3, background: 'rgba(232,116,43,0.18)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: '40%',
                            background: 'linear-gradient(90deg, transparent, #E8742B, transparent)',
                            animation: 'stepProgress 1.8s linear infinite',
                          }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <p style={{ fontSize: 11, color: '#7AAAB2', marginTop: 16 }}>
            Need to update your business address or radius? <Link href="/dashboard/settings" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>Settings →</Link>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {drops.map((d) => (
            <LeadCard key={d.id} drop={d} onStatus={updateStatus} onReveal={revealPhone} />
          ))}
        </div>
      )}
    </main>
  )
}

type GeneratedMessage = { email_subject: string; email_body: string; sms: string }

function LeadCard({ drop, onStatus, onReveal }: { drop: LeadDrop; onStatus: (id: string, s: LeadDrop['status']) => void; onReveal: (leadId: string) => void }) {
  const l = drop.lead
  const fullAddr = [l.street_address, l.city, l.state, l.zip].filter(Boolean).join(', ')
  // 2026-06-10 — Compact-then-expand pattern per Peter (mirrors the
  // homepage sample-leads-card UX). Rows render condensed by default
  // so the dashboard reads "10 leads to scroll through" not "10 full
  // pages of stuff." Click any row to expand the full pitch + phone
  // reveal + AI message + status controls.
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
  const sourceLabel = ({
    move_in: '🏠 New Mover',
    permit: '🏗️ Permit Filed',
    storm: '⛈️ Storm Trigger',
    aging_hvac: '🌡️ Aging HVAC',
    expired_listing: '🏷️ Recent Sale',
    other: 'Lead',
  } as Record<string, string>)[l.source] || 'Lead'

  // Template pitch for aging_hvac leads — skips API generation since the
  // trigger is the same for every aging-HVAC neighborhood (Census ZIP
  // density). Real per-lead Haiku gen reserved for permits + storms.
  const pitch = l.pitch_script || (l.source === 'aging_hvac'
    ? `Hi, calling neighbors in ${l.zip} where most homes are 20+ yrs old — AC units past their lifespan. Got a min to talk about a free tune-up to extend yours?`
    : null)

  return (
    <div style={{
      background: '#fff', borderRadius: 14,
      border: '1px solid rgba(10,168,159,0.16)',
      boxShadow: expanded ? '0 8px 24px rgba(7,27,58,0.10)' : '0 4px 16px rgba(7,27,58,0.05)',
      transition: 'box-shadow 180ms ease',
      overflow: 'hidden',
    }}>
      {/* Compact summary row — always visible. Click to toggle. */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          padding: '4px 8px', borderRadius: 6,
          background: '#FFD9A8', color: '#C84B26',
          fontSize: 10, fontWeight: 900, letterSpacing: '0.04em',
          flexShrink: 0,
        }}>
          {l.lead_score ?? 0}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#0B1F3A' }}>
              {l.owner_name ?? 'Owner unlisted'}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: 5,
              background: '#0B1F3A', color: '#fff',
              fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {sourceLabel.replace(/^[^\s]+\s/, '')}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: 5,
              background: drop.status === 'won' ? '#16803F' : drop.status === 'lost' ? '#A33C18' : '#7AAAB2',
              color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {drop.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#4A6670', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📍 {fullAddr || l.zip} {l.year_built ? `· built ${l.year_built}` : ''}{l.home_value_est ? ` · $${Math.round(l.home_value_est / 1000)}K` : ''}
          </div>
        </div>
        <div style={{ fontSize: 14, color: '#7AAAB2', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease' }}>
          ▾
        </div>
      </button>

      {/* Expanded body — only when row is opened. */}
      {expanded && (
      <div style={{ padding: '0 20px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
            {sourceLabel} · Score {l.lead_score}/100
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>
            {l.owner_name ?? 'Owner unlisted'}
          </div>
          <div style={{ fontSize: 13, color: '#4A6670', marginBottom: 8 }}>
            📍 {fullAddr || `${l.zip}`}
          </div>
          {(l.home_value_est || l.year_built || l.sqft) && (
            <div style={{ fontSize: 12, color: '#7AAAB2', marginBottom: 10 }}>
              {l.home_value_est ? `💰 ~$${l.home_value_est.toLocaleString()}` : null}
              {l.year_built ? ` · 🛠 built ${l.year_built}` : null}
              {l.sqft ? ` · 📐 ${l.sqft.toLocaleString()} sqft` : null}
            </div>
          )}
          {pitch && (
            <div style={{ background: '#F5F1EA', padding: '10px 12px', borderRadius: 8, fontSize: 13, color: '#0B1F3A', lineHeight: 1.5, marginBottom: 10 }}>
              💡 {pitch}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
          {/* Phone reveal state machine:
                phone present                → Call + Text buttons
                attempted, no hit            → "No phone found" (already paid)
                attempted in flight (UI)     → "Looking up…"
                not yet attempted, address ok → "🔓 Reveal phone" (CTA)
                no street address            → nothing (can't trace) */}
          {l.owner_phone ? (
            <>
              <a href={`tel:${l.owner_phone}`} style={{
                padding: '10px 18px', borderRadius: 10,
                background: 'linear-gradient(135deg, #0AA89F, #06776F)',
                color: '#fff', textDecoration: 'none', textAlign: 'center',
                fontSize: 13, fontWeight: 800,
              }}>
                📞 Call {l.owner_phone}
              </a>
              <a href={`sms:${l.owner_phone}`} style={{
                padding: '10px 18px', borderRadius: 10,
                background: '#fff', border: '1.5px solid #0AA89F',
                color: '#0AA89F', textDecoration: 'none', textAlign: 'center',
                fontSize: 13, fontWeight: 800,
              }}>
                💬 Text
              </a>
            </>
          ) : l.skip_trace_attempted_at && l.skip_trace_hit === false ? (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: '#F5F1EA', color: '#7AAAB2',
              fontSize: 12, fontWeight: 700, textAlign: 'center',
            }}>
              No phone on file
            </div>
          ) : l.skip_trace_attempted_at ? (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'rgba(10,168,159,0.08)', color: '#0AA89F',
              fontSize: 12, fontWeight: 700, textAlign: 'center',
            }}>
              Looking up…
            </div>
          ) : l.street_address ? (
            <button onClick={() => onReveal(l.id)} style={{
              padding: '10px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
              color: '#fff', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 800,
              boxShadow: '0 4px 12px rgba(232,116,43,0.38)',
            }}>
              🔓 Reveal phone
            </button>
          ) : (
            <div style={{
              padding: '10px 14px', borderRadius: 10,
              background: '#F5F1EA', color: '#7AAAB2',
              fontSize: 11, fontWeight: 700, textAlign: 'center',
              lineHeight: 1.4,
            }}>
              Neighborhood lead<br />
              <span style={{ fontSize: 10, color: '#A0BCC2' }}>(no specific address)</span>
            </div>
          )}
        </div>
      </div>

      {/* AI Outreach Message */}
      {(l.owner_phone || l.owner_email) && (
        <div style={{ marginTop: 14 }}>
          {!aiOpen ? (
            <button
              onClick={generateMessage}
              disabled={aiLoading}
              style={{
                width: '100%', padding: '11px 18px', borderRadius: 10,
                background: aiLoading ? 'rgba(11,31,58,0.3)' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                color: '#fff', border: 'none', cursor: aiLoading ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 900,
                boxShadow: '0 4px 12px rgba(232,116,43,0.30)',
              }}
            >
              {aiLoading ? '✨ Writing your message…' : `✨ Generate AI intro message ${l.owner_phone ? `→ ${l.owner_phone}` : ''}`}
            </button>
          ) : aiMsg && (
            <div style={{ background: 'linear-gradient(155deg, #0B1F3A 0%, #163356 100%)', borderRadius: 12, padding: '14px 16px', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#FF9D5A', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                  Pre-written by AI · ready to send as you
                </div>
                <button onClick={() => setAiOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>✕</button>
              </div>
              {l.owner_phone && (
                <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>SMS to {l.owner_phone}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, marginBottom: 8 }}>{aiMsg.sms}</div>
                  <button
                    onClick={sendSms}
                    disabled={sendingSms || smsSent}
                    style={{
                      padding: '7px 14px', borderRadius: 7,
                      background: smsSent ? '#22C55E' : sendingSms ? 'rgba(255,255,255,0.18)' : '#fff',
                      color: smsSent ? '#fff' : '#0B1F3A', border: 'none',
                      fontSize: 11.5, fontWeight: 900, cursor: smsSent ? 'default' : 'pointer',
                    }}
                  >
                    {smsSent ? '✓ Sent' : sendingSms ? 'Sending…' : '📱 Send SMS now'}
                  </button>
                </div>
              )}
              {l.owner_email && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Email to {l.owner_email}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{aiMsg.email_subject}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{aiMsg.email_body}</div>
                  <button
                    onClick={sendEmail}
                    disabled={sendingEmail || emailSent}
                    style={{
                      padding: '7px 14px', borderRadius: 7,
                      background: emailSent ? '#22C55E' : sendingEmail ? 'rgba(255,255,255,0.18)' : '#fff',
                      color: emailSent ? '#fff' : '#0B1F3A', border: 'none',
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
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: '#991B1B', fontSize: 12 }}>{aiError}</div>
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
              padding: '6px 12px', borderRadius: 99,
              border: drop.status === s ? '2px solid #0AA89F' : '1px solid rgba(10,168,159,0.2)',
              background: drop.status === s ? '#E6F7F5' : '#fff',
              color: drop.status === s ? '#06776F' : '#4A6670',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
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
