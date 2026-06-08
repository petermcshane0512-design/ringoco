'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

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

  useEffect(() => {
    fetch('/api/leads/list')
      .then((r) => r.json())
      .then((j) => {
        if (j.drops) setDrops(j.drops)
        if (j.quota) setQuota(j.quota)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
        {/* Small next-drop countdown — top right per Peter 2026-06-07. */}
        <div style={{ fontSize: 11, color: '#7AAAB2', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 700, color: '#7AAAB2' }}>Next drop:</span>
          <span style={{ fontWeight: 800, color: '#E8742B', fontVariantNumeric: 'tabular-nums' }}>
            {(() => {
              const now = new Date()
              const day = now.getUTCDay()
              const hoursToMonday10 = (((1 - day + 7) % 7) * 24) + (10 - now.getUTCHours()) - (now.getUTCMinutes() / 60)
              const next = new Date(now.getTime() + hoursToMonday10 * 3600 * 1000)
              const ms = next.getTime() - now.getTime()
              if (ms <= 0) return 'any minute'
              const days = Math.floor(ms / 86_400_000)
              const hrs = Math.floor((ms % 86_400_000) / 3_600_000)
              const mins = Math.floor((ms % 3_600_000) / 60_000)
              if (days > 0) return `${days}d ${hrs}h ${mins}m`
              return `${hrs}h ${mins}m`
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
          Neighborhood Leads · {quota?.tier_display ?? 'Active'}
        </div>
        <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px', color: '#fff' }}>
          Ready-to-quote homeowners near you.
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, maxWidth: 620, margin: 0 }}>
          New movers, fresh permits, storm-damage triggers, and aging-HVAC homes — delivered to your dashboard at your tier&apos;s cadence. Tap to call or text directly.
        </p>

        {quota && (
          <div style={{ marginTop: 18, padding: '14px 18px', background: 'rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {quota.used_this_period} of {quota.per_drop} {quota.cadence_label} leads delivered
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
          <div style={{ fontSize: 44, marginBottom: 8 }}>🛰️</div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#0B1F3A', marginBottom: 8 }}>
            Scanning your service area now
          </div>
          <p style={{ fontSize: 14, color: '#4A6670', maxWidth: 520, margin: '0 auto 18px', lineHeight: 1.55 }}>
            We pull from 5 free public data sources in real time: city permits, US Census aging-home data,
            NOAA storm alerts, new-mover signals, and competitor footprints. Your first {quota?.per_drop ?? 5}{' '}
            {quota?.cadence_label ?? 'weekly'} leads land within 24 hours of signup.
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10, maxWidth: 540, margin: '18px auto 0', textAlign: 'left',
          }}>
            {[
              { icon: '🏗️', label: 'Live permit feeds' },
              { icon: '🌡️', label: 'Aging HVAC data' },
              { icon: '⛈️', label: 'Storm triggers' },
              { icon: '🏠', label: 'Move-in signals' },
            ].map((s) => (
              <div key={s.label} style={{
                padding: '10px 12px', borderRadius: 10,
                background: '#F5FDFB', border: '1px solid rgba(10,168,159,0.16)',
                fontSize: 12, color: '#0B1F3A', fontWeight: 700,
              }}>
                {s.icon} {s.label}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#7AAAB2', marginTop: 16 }}>
            Want to expand your service radius? <Link href="/dashboard/settings" style={{ color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>Settings →</Link>
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

function LeadCard({ drop, onStatus, onReveal }: { drop: LeadDrop; onStatus: (id: string, s: LeadDrop['status']) => void; onReveal: (leadId: string) => void }) {
  const l = drop.lead
  const fullAddr = [l.street_address, l.city, l.state, l.zip].filter(Boolean).join(', ')
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
      background: '#fff', borderRadius: 14, padding: '18px 20px',
      border: '1px solid rgba(10,168,159,0.16)',
      boxShadow: '0 4px 16px rgba(7,27,58,0.05)',
    }}>
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
  )
}
