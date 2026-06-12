'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import LeadMap from '@/components/LeadMap'
import { LEADS_PER_WEEK, INTRO_PROMO_CODE } from '@/lib/offer'

/**
 * SampleDashboard — homepage hero preview, 2026-06-12 per Peter.
 *
 * This is a 1:1 visual replica of the REAL /dashboard/leads view (same tan
 * #F2EAD9 canvas, same LeadMap with shop pin + numbered lead pins, same
 * Monday-countdown card, same white lead rows with plain-English reason
 * tags) so the dashboard a prospect sees on the homepage IS the dashboard
 * a customer logs into. The old dark "command-center" LeadsCard died the
 * same day — it promised an aesthetic the product no longer has.
 *
 * Demo persona: a Brooklyn, NY roofing company. ALL ten leads below are
 * FICTIONAL — invented names, masked house numbers (84●● 13th Ave), masked
 * phones, hand-placed block-level coordinates. No real homeowner's name,
 * address, or number appears here, and the card carries both a SAMPLE pill
 * and an explicit "fictional data" footnote. Do not replace these with
 * rows from the real leads table — that would put actual homeowner PII on
 * a public marketing page.
 *
 * The countdown is REAL (ticks to next Monday 9:00 AM local — the actual
 * drop cadence), the map is a real Static Maps render of Brooklyn (one
 * cached URL for every visitor), and distances are computed, not typed.
 * Every interactive surface funnels to /start.
 */

const START_HREF = `/start?promo=${INTRO_PROMO_CODE}`

// Demo shop — Bay Ridge, Brooklyn.
const SHOP = { lat: 40.6264, lng: -74.0299 }

type Tone = 'red' | 'orange' | 'slate' | 'teal'

type SampleLead = {
  id: string
  name: string
  addr: string       // house number masked — fictional, see header comment
  area: string
  lat: number
  lng: number
  tag: string
  tone: Tone
  value: string
  phone: string | null
}

const SAMPLE_LEADS: SampleLead[] = [
  { id: 's1',  name: 'T. Alvarez',    addr: '76●● 4th Ave',      area: 'Bay Ridge',      lat: 40.6334, lng: -74.0241, tag: 'Aging roof · 1961 build',        tone: 'slate',  value: '$9.4K – $15.8K',  phone: null },
  { id: 's2',  name: 'P. Rosario',    addr: '56●● 6th Ave',      area: 'Sunset Park',    lat: 40.6402, lng: -74.0117, tag: 'City cited — roof repair ordered', tone: 'red',    value: '$12.6K – $19.4K', phone: '(718) ●●●-●208' },
  { id: 's3',  name: 'R. Castellano', addr: '84●● 13th Ave',     area: 'Dyker Heights',  lat: 40.6195, lng: -74.0117, tag: 'Roof permit filed',              tone: 'orange', value: '$11.2K – $17.6K', phone: '(718) ●●●-●142' },
  { id: 's4',  name: 'A. Petrov',     addr: '53●● 11th Ave',     area: 'Borough Park',   lat: 40.6354, lng: -73.9961, tag: 'Hearings + fine — roof repair due', tone: 'red',   value: '$14.2K – $21.8K', phone: null },
  { id: 's5',  name: 'S. Lindgren',   addr: '22●● 65th St',      area: 'Bensonhurst',    lat: 40.6122, lng: -73.9905, tag: 'Roof permit filed',              tone: 'orange', value: '$10.8K – $16.2K', phone: '(929) ●●●-●377' },
  { id: 's6',  name: 'L. Nguyen',     addr: '18●● W 9th St',     area: 'Gravesend',      lat: 40.5946, lng: -73.9819, tag: 'Failed inspection — roof, must re-pass', tone: 'red', value: '$9.8K – $14.6K',  phone: '(347) ●●●-●521' },
  { id: 's7',  name: 'D. Mancini',    addr: '14●● Avenue R',     area: 'Midwood',        lat: 40.6092, lng: -73.9532, tag: 'Storm damage zone',              tone: 'orange', value: '$13.4K – $20.2K', phone: '(718) ●●●-●664' },
  { id: 's8',  name: 'C. Brennan',    addr: '45●● Bedford Ave',  area: 'Sheepshead Bay', lat: 40.5895, lng: -73.9486, tag: 'Aging roof · 1958 build',        tone: 'slate',  value: '$8.6K – $13.4K',  phone: null },
  { id: 's9',  name: 'M. Okafor',     addr: '11●● E 38th St',    area: 'Flatbush',       lat: 40.6312, lng: -73.9396, tag: 'City cited — fix or get fined',  tone: 'red',    value: '$12.2K – $18.4K', phone: '(347) ●●●-●093' },
  { id: 's10', name: 'J. Whitfield',  addr: '29●● Gerritsen Ave', area: 'Marine Park',   lat: 40.5984, lng: -73.9322, tag: 'New owner · 5 wks',              tone: 'teal',   value: '$7.8K – $12.2K',  phone: '(917) ●●●-●485' },
]

// Same chip palette the real dashboard's reason tags use.
const TONE_STYLE: Record<Tone, { bg: string; color: string; border: string }> = {
  red:    { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  orange: { bg: '#fef3ec', color: '#c2410c', border: '#fed7aa' },
  slate:  { bg: '#f3f4f6', color: '#374151', border: '#e5e7eb' },
  teal:   { bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' },
}

function distMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Next Monday 9:00 AM local — the real drop cadence. Pure function of `now`. */
function nextDropAt(now: number): number {
  const d = new Date(now)
  d.setHours(9, 0, 0, 0)
  let add = (1 - d.getDay() + 7) % 7
  if (add === 0 && d.getTime() <= now) add = 7
  d.setDate(d.getDate() + add)
  return d.getTime()
}

export default function SampleDashboard() {
  const [now, setNow] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Tick after mount only — keeps server/client first paint identical.
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 0)
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearTimeout(t); clearInterval(id) }
  }, [])

  const countdownLabel = (() => {
    if (now === null) return '—'
    const ms = nextDropAt(now) - now
    const days = Math.floor(ms / 86_400_000)
    const hrs = Math.floor((ms % 86_400_000) / 3_600_000)
    const mins = Math.floor((ms % 3_600_000) / 60_000)
    const secs = Math.floor((ms % 60_000) / 1000)
    if (days > 0) return `${days}d ${hrs}h ${mins}m`
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`
    return `${mins}m ${secs}s`
  })()

  // Closest-first, numbered to match the map pins — same ordering rule as
  // the real dashboard list.
  const leads = useMemo(() =>
    [...SAMPLE_LEADS]
      .map((l) => ({ ...l, mi: distMiles(SHOP.lat, SHOP.lng, l.lat, l.lng) }))
      .sort((a, b) => a.mi - b.mi),
  [])

  function focusLead(id: string) {
    setActiveId(id)
    document.getElementById(`sample-lead-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div style={{
      borderRadius: 20,
      // Same canvas as the real dashboard (/dashboard layout bg).
      background: '#F2EAD9',
      border: '1px solid #E3D8C2',
      boxShadow: '0 24px 60px rgba(11,31,58,0.16)',
      padding: 16,
      maxWidth: 620,
      width: '100%',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      color: '#1f2937',
    }}>
      {/* Header — mirrors the real dashboard chrome */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#c2410c', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
            Your dashboard · live preview
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#374151', marginTop: 2 }}>
            Demo: a Brooklyn, NY roofing company
          </div>
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 11px', borderRadius: 99,
          background: 'rgba(34,197,94,0.10)',
          border: '1px solid rgba(34,197,94,0.40)',
          fontSize: 10, fontWeight: 800, color: '#16803F', letterSpacing: '0.08em',
        }}>
          <span aria-hidden style={{ position: 'relative', width: 14, height: 14, borderRadius: '50%', border: '1px solid rgba(22,128,63,0.45)', overflow: 'hidden', flexShrink: 0 }}>
            <span style={{
              position: 'absolute', inset: 0,
              background: 'conic-gradient(from 0deg, rgba(34,197,94,0.85), transparent 70deg, transparent 360deg)',
              animation: 'bavgSampleRadar 2.4s linear infinite',
            }} />
          </span>
          SAMPLE DATA
        </div>
      </div>

      {/* Map — shop pin + 10 numbered lead pins, exactly like the product */}
      <LeadMap
        businessLat={SHOP.lat}
        businessLng={SHOP.lng}
        leads={leads.map((l, i) => ({
          id: l.id,
          lat: l.lat,
          lng: l.lng,
          label: String(i + 1),
          title: `${l.addr}, ${l.area}`,
          hasPhone: !!l.phone,
        }))}
        onPinClick={focusLead}
      />

      {/* Countdown card — same copy + format as the real dashboard */}
      <div style={{
        borderRadius: 12, padding: '13px 16px', margin: '10px 0',
        background: '#ffffff',
        border: '1px solid #E3D8C2',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Next {LEADS_PER_WEEK} leads drop in
          </div>
          <div style={{ fontSize: 'clamp(19px, 3vw, 24px)', fontWeight: 700, color: '#1f2937', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {countdownLabel}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1f2937', lineHeight: 1 }}>{LEADS_PER_WEEK}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>this week</div>
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#1f2937', lineHeight: 1 }}>{LEADS_PER_WEEK * 4}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280' }}>this month</div>
          </div>
        </div>
      </div>

      {/* This week's leads — same section head + row anatomy as the product */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1f2937' }}>This week&rsquo;s leads</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{leads.length} delivered · closest to you first · tap a pin</div>
      </div>

      {/* Call-angle framing — the RED leads are the money: the city has
          ordered the repair, so the homeowner has to act. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '9px 12px', borderRadius: 9, marginBottom: 8,
        background: '#fef2f2', border: '1px solid #fecaca',
      }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626', flexShrink: 0, marginTop: 4 }} />
        <span style={{ fontSize: 11.5, color: '#991b1b', fontWeight: 600, lineHeight: 1.45 }}>
          <strong>Red = the city ordered this repair.</strong> These homeowners have to fix it or face fines — mention it on the call and they almost always say yes.
        </span>
      </div>

      <div ref={scrollRef} className="bavg-sample-scroll" style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 4, marginRight: -4, scrollbarWidth: 'thin' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {leads.map((l, i) => {
            const tone = TONE_STYLE[l.tone]
            const active = activeId === l.id
            return (
              <Link key={l.id} href={START_HREF} style={{ textDecoration: 'none', display: 'block' }}>
                <div
                  id={`sample-lead-${l.id}`}
                  className="bavg-sample-row"
                  style={{
                    borderRadius: 10,
                    background: '#ffffff',
                    border: active ? '1.5px solid #E8742B' : '1px solid #E3D8C2',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: l.phone ? 'linear-gradient(135deg, #FF9D5A, #E8742B)' : 'linear-gradient(135deg, #64748B, #475569)',
                      color: '#fff', fontSize: 10, fontWeight: 900,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1f2937' }}>{l.name}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6,
                      background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`,
                      fontSize: 10, fontWeight: 800,
                    }}>{l.tag}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#c2410c', whiteSpace: 'nowrap' }}>{l.value}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 4, paddingLeft: 28 }}>
                    {l.addr}, {l.area} · {l.mi.toFixed(1)} mi
                    {l.phone
                      ? <> · {l.phone} <span style={{ color: '#c2410c', fontWeight: 800 }}>← unlock w/ trial</span></>
                      : <> · phone on request</>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* CTA strip + the legal footnote that keeps this card safe to ship */}
      <Link href={START_HREF} style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{
          marginTop: 10, padding: '11px 14px', borderRadius: 10,
          background: '#E8742B', textAlign: 'center', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff' }}>
            Get {LEADS_PER_WEEK} real ones for your zip → claim my area
          </span>
        </div>
      </Link>
      <div style={{ fontSize: 10, color: '#8a8062', fontWeight: 600, marginTop: 8, lineHeight: 1.5 }}>
        Sample data — names, addresses, and phone numbers above are fictional
        placeholders, not real residents. Your dashboard shows real, verified
        homeowners in your service area.
      </div>

      <style>{`
        @keyframes bavgSampleRadar {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .bavg-sample-scroll::-webkit-scrollbar { width: 6px; }
        .bavg-sample-scroll::-webkit-scrollbar-thumb { background: rgba(232,116,43,0.35); border-radius: 6px; }
        .bavg-sample-scroll::-webkit-scrollbar-track { background: rgba(232,116,43,0.08); }
        .bavg-sample-row:hover {
          transform: translateY(-1px);
          border-color: #E8742B !important;
          box-shadow: 0 6px 18px rgba(232,116,43,0.18);
        }
      `}</style>
    </div>
  )
}
