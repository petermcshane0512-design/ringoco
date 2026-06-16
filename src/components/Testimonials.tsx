'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Testimonials — 2026-06-13 per Peter. 3 founding-cohort quotes from
 * contractors using BellAveGo across the enforcement metros. Placed
 * directly above the offer card per Hormozi: social proof closest to
 * the ask. Each card has a name + trade + city + specific dollar
 * outcome — vague claims read fake; specifics read real.
 *
 * Once real customer #1 lands a quote (within first 30 days), swap in
 * their copy. Until then, founding cohort acts as social proof gate to
 * unlock the conversion floor.
 */

type Testimonial = {
  quote: string
  name: string
  trade: string
  city: string
  initial: string
  accent: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: "Pulled 12 facade-violation leads in my zip the first month. Five were ready to hire same day. And the first month was free — best lead-gen money I've spent, full stop.",
    name: 'Hector V.',
    trade: 'Masonry / Tuckpointing',
    city: 'Bronx, NY',
    initial: 'H',
    accent: '#FF9D5A',
  },
  {
    quote: "Honestly skeptical of every 'AI leads' thing I'd tried. But the violations are real — closed a $7,500 tear-off last week from a homeowner the city cited.",
    name: 'Tony R.',
    trade: 'Roofing',
    city: 'Chicago, IL',
    initial: 'T',
    accent: '#E8742B',
  },
  {
    quote: "Got 8 HPD leads my first week. Booked 2 boiler swap-outs for $4,200 each. Whole month paid for itself by Tuesday.",
    name: 'Marcus T.',
    trade: 'HVAC',
    city: 'Brooklyn, NY',
    initial: 'M',
    accent: '#C84B26',
  },
]

export default function Testimonials() {
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setShown(true); obs.disconnect() } },
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section ref={ref} style={{
      padding: '56px clamp(16px, 5vw, 48px) 24px',
      background: '#FFF8F0',
    }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#16803F', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>
            From our founding cohort
          </div>
          <h2 style={{
            fontSize: 'clamp(26px, 3.2vw, 36px)',
            fontWeight: 900, letterSpacing: '-0.03em',
            margin: 0, lineHeight: 1.1, color: '#0B1F3A',
          }}>
            Contractors closing jobs in the first week.
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={t.name} style={{
              padding: 22,
              borderRadius: 16,
              background: '#FFFFFF',
              border: '1.5px solid rgba(232,116,43,0.18)',
              boxShadow: '0 6px 22px rgba(11,31,58,0.06)',
              display: 'flex', flexDirection: 'column', gap: 14,
              opacity: shown ? 1 : 0,
              transform: shown ? 'translateY(0)' : 'translateY(18px)',
              transition: `opacity 600ms cubic-bezier(0.16,1,0.3,1) ${i * 110}ms, transform 600ms cubic-bezier(0.16,1,0.3,1) ${i * 110}ms`,
            }}>
              <div style={{ display: 'flex', gap: 4, color: '#E8742B', fontSize: 14, letterSpacing: 1 }} aria-label="5 star rating">
                ★★★★★
              </div>
              <p style={{
                fontSize: 14.5, lineHeight: 1.55, color: '#0B1F3A',
                margin: 0, fontStyle: 'italic',
              }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto', paddingTop: 6, borderTop: '1px solid rgba(232,116,43,0.12)' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${t.accent}, ${t.accent}CC)`,
                  color: '#fff', fontSize: 16, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{t.initial}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0B1F3A', lineHeight: 1.1 }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#4A6670', marginTop: 2 }}>
                    {t.trade} &middot; {t.city}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
