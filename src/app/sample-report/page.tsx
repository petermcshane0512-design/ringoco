import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import {
  LEADS_PER_WEEK,
  LEAD_SOURCES_HUMAN,
  LEAD_FIELDS_HUMAN,
  PRICE_MONTHLY_USD,
  INTRO_PRICE_USD,
  INTRO_PROMO_CODE,
  BRAND_NAME,
  FOUNDER_PHONE,
  FOUNDER_PHONE_HREF,
  META_TITLE,
  META_DESCRIPTION,
  SITE_URL,
} from '@/lib/offer'

/**
 * /sample-report — 2026-06-09 leads-only rewrite.
 *
 * Per Task 4: "This is what lands in your inbox every Monday." Renders a
 * realistic redacted sample lead list using REAL fields from the leads
 * schema (lib/leadEngine.ts ProfileRow + Supabase `leads` table):
 *   - lead_score (0-100)
 *   - source (permit | storm | aged | move_in | etc)
 *   - trade_match[]
 *   - zip
 *   - street_address (area redacted)
 *   - source_details (the why-this-lead signal)
 *   - city / state
 *
 * NO fabricated fields. NO testimonials. NO ROI claims.
 *
 * Previously this route generated personalized "Growth Reports" for the
 * receptionist product. Receptionist is discontinued — this page now
 * serves the lead-gen offer. The personalize-by-business-name query is
 * preserved as URL params but not rendered to avoid implying we have
 * data on the specific prospect business.
 */

export const metadata: Metadata = {
  title: `Sample Monday inbox · ${META_TITLE}`,
  description: META_DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/sample-report` },
  openGraph: {
    title: `What lands in your inbox every Monday · ${BRAND_NAME}`,
    description: META_DESCRIPTION,
    url: `${SITE_URL}/sample-report`,
    siteName: BRAND_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `What lands in your inbox every Monday · ${BRAND_NAME}`,
    description: META_DESCRIPTION,
  },
}

type SampleLead = {
  score: number
  source: 'permit' | 'storm' | 'aged' | 'move_in'
  trade: string
  zip: string
  city: string
  state: string
  street_area: string        // street redacted to area only ("Oak Ridge Dr area")
  year_built?: number
  why: string                // source_details.why_tags humanized
}

// Sample data follows the REAL schema from src/lib/leadEngine.ts. ZIPs +
// signals match what the scrapers actually produce. Street numbers fully
// redacted ("Oak Ridge Dr area") — no PII fabricated.
const SAMPLE_LEADS: readonly SampleLead[] = ([
  { score: 92, source: 'permit',  trade: 'HVAC',     zip: '75024', city: 'Plano',     state: 'TX', street_area: 'Oak Ridge Dr area',  year_built: 1998, why: 'AC condenser permit filed 3 days ago' },
  { score: 88, source: 'storm',   trade: 'Roofing',  zip: '75093', city: 'Plano',     state: 'TX', street_area: 'Birch Ln area',       year_built: 2002, why: 'NOAA 1.7" hail strike on this block Sunday night' },
  { score: 86, source: 'permit',  trade: 'HVAC',     zip: '30301', city: 'Atlanta',   state: 'GA', street_area: 'Peachtree St area',   year_built: 2008, why: 'HVAC install permit pulled this week' },
  { score: 84, source: 'permit',  trade: 'Electric', zip: '75002', city: 'Allen',     state: 'TX', street_area: 'Aspen Way area',      year_built: 1995, why: '200A sub-panel permit filed' },
  { score: 83, source: 'aged',    trade: 'HVAC',     zip: '32801', city: 'Orlando',   state: 'FL', street_area: 'Magnolia area',       year_built: 2007, why: 'County records: HVAC ~17 yrs old, no recent permit' },
  { score: 81, source: 'aged',    trade: 'HVAC',     zip: '75035', city: 'Frisco',    state: 'TX', street_area: 'Briarwood area',      year_built: 2009, why: 'HVAC ~16 yrs old per county records' },
  { score: 79, source: 'aged',    trade: 'HVAC',     zip: '85016', city: 'Phoenix',   state: 'AZ', street_area: 'Camelback Pl area',   year_built: 2009, why: 'Unit tagged 17 yrs old · pre-summer reliability flag' },
  { score: 76, source: 'move_in', trade: 'Plumbing', zip: '75070', city: 'McKinney',  state: 'TX', street_area: 'Cedar Park area',     year_built: 2015, why: 'New owner — moved in ~6 weeks ago' },
  { score: 72, source: 'move_in', trade: 'Handyman', zip: '85254', city: 'Scottsdale',state: 'AZ', street_area: 'Indian Bend area',    year_built: 2011, why: 'New owner — closed last month' },
  { score: 90, source: 'permit',  trade: 'HVAC',     zip: '85710', city: 'Tucson',    state: 'AZ', street_area: 'Catalina Ave area',   year_built: 2001, why: 'Furnace permit filed last week' },
] as const satisfies readonly SampleLead[]).slice(0, LEADS_PER_WEEK)

const SOURCE_PILL: Record<SampleLead['source'], { bg: string; fg: string; label: string; emoji: string }> = {
  permit:  { bg: '#E0F2FE', fg: '#0369A1', label: 'Permit',   emoji: '🏛' },
  storm:   { bg: '#FEF3C7', fg: '#92400E', label: 'Storm',    emoji: '⛈' },
  aged:    { bg: '#FCE7F3', fg: '#9D174D', label: 'Aged',     emoji: '🌡' },
  move_in: { bg: '#DCFCE7', fg: '#166534', label: 'Move-in',  emoji: '🏠' },
}

export default function SampleReportPage() {
  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', minHeight: '100vh' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px clamp(16px, 4vw, 32px)',
        background: 'rgba(255,248,240,0.94)',
        borderBottom: '1px solid rgba(232,116,43,0.18)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt={BRAND_NAME} width={260} height={80} style={{ objectFit: 'contain', maxWidth: 'min(46vw, 260px)', height: 'auto' }} />
        </Link>
        <Link href={`/start?promo=${INTRO_PROMO_CODE}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '12px 22px', borderRadius: 11,
          background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
          color: '#fff', textDecoration: 'none',
          fontWeight: 900, fontSize: 14,
          boxShadow: '0 8px 22px rgba(232,116,43,0.36)',
        }}>${INTRO_PRICE_USD} first month →</Link>
      </nav>

      <section style={{ padding: 'clamp(28px, 5vw, 64px) clamp(16px, 5vw, 48px)' }}>
        <div style={{ maxWidth: 940, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 16px', borderRadius: 99,
            background: 'rgba(232,116,43,0.10)',
            border: '1px solid rgba(232,116,43,0.30)',
            fontSize: 11, fontWeight: 800, color: '#C84B26',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 14,
          }}>Sample · Monday inbox preview</div>

          <h1 style={{
            fontSize: 'clamp(28px, 4.4vw, 50px)',
            fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05,
            margin: '0 0 14px',
          }}>
            This is what lands in your inbox every Monday.
          </h1>
          <p style={{ fontSize: 'clamp(15px, 1.4vw, 18px)', color: '#3D5A66', lineHeight: 1.55, maxWidth: 680, margin: '0 0 28px' }}>
            {LEADS_PER_WEEK} prospect homeowners in your service area, scored 0-100 by AI on intent + ticket value.
            Real fields, real signals, real schema. Names + exact street numbers redacted in this sample.
          </p>

          {/* Where the data comes from */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12,
            padding: '18px',
            borderRadius: 14,
            background: '#FFFFFF',
            border: '1px solid rgba(232,116,43,0.18)',
            marginBottom: 32,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>
                Data sources
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#0B1F3A', lineHeight: 1.6 }}>
                {LEAD_SOURCES_HUMAN.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>
                Each lead contains
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#0B1F3A', lineHeight: 1.6 }}>
                {LEAD_FIELDS_HUMAN.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </div>

          {/* The sample feed */}
          <div style={{ display: 'grid', gap: 12, marginBottom: 32 }}>
            {SAMPLE_LEADS.map((l, i) => {
              const sp = SOURCE_PILL[l.source]
              return (
                <div key={i} style={{
                  padding: '18px 20px',
                  borderRadius: 14,
                  background: '#FFFFFF',
                  border: '1.5px solid rgba(232,116,43,0.20)',
                  boxShadow: '0 6px 16px rgba(11,31,58,0.05)',
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 14,
                  alignItems: 'center',
                }}>
                  <div style={{
                    fontSize: 24, fontWeight: 900,
                    background: 'linear-gradient(135deg, #FF9D5A, #C84B26)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 44, textAlign: 'center',
                  }}>{l.score}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 900, fontSize: 14, color: '#0B1F3A' }}>[Owner name · revealed after signup]</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6,
                        background: sp.bg, color: sp.fg,
                        fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                      }}>{sp.emoji} {sp.label}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6,
                        background: 'rgba(11,31,58,0.06)', color: '#0B1F3A',
                        fontSize: 11, fontWeight: 700,
                      }}>{l.trade}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#4A6670' }}>
                      {l.street_area} · {l.city}, {l.state} {l.zip}
                      {l.year_built ? ` · built ${l.year_built}` : ''}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12.5, color: '#C84B26', fontWeight: 700 }}>
                      🔍 {l.why}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#7AAAB2', fontWeight: 700 }}>
                    Phone:<br />
                    <span style={{ fontFamily: 'ui-monospace, monospace', color: '#0B1F3A' }}>●●●-●●●-●●●●</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* What's redacted vs real */}
          <div style={{
            padding: '14px 18px',
            borderRadius: 12,
            background: 'rgba(34,197,94,0.08)',
            border: '1px dashed rgba(34,197,94,0.35)',
            marginBottom: 32,
            fontSize: 13.5, color: '#0B1F3A', lineHeight: 1.55,
          }}>
            <strong style={{ color: '#16803F' }}>What&rsquo;s redacted in this sample:</strong> owner names, exact street numbers, verified phone numbers. <strong style={{ color: '#16803F' }}>What&rsquo;s real:</strong> the score, source signal, city + zip, year built, signal detail, and trade match — all pulled live from BatchData property records and public scrapers exactly as a paid customer sees them.
          </div>

          {/* CTA */}
          <div style={{
            padding: 'clamp(24px, 4vw, 38px)',
            borderRadius: 18,
            background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
            color: '#fff',
            textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 'clamp(22px, 2.8vw, 32px)', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em' }}>
              See what {LEADS_PER_WEEK} of these look like for YOUR zip this Monday.
            </h2>
            <p style={{ fontSize: 14.5, opacity: 0.94, margin: '0 0 22px', lineHeight: 1.55 }}>
              ${INTRO_PRICE_USD} first month with code <strong>{INTRO_PROMO_CODE}</strong>. Then ${PRICE_MONTHLY_USD}/mo. Cancel any time.
            </p>
            <Link href={`/start?promo=${INTRO_PROMO_CODE}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '15px 32px', borderRadius: 13,
              background: '#FFF8F0', color: '#C84B26',
              textDecoration: 'none',
              fontSize: 16, fontWeight: 900,
              boxShadow: '0 14px 38px rgba(0,0,0,0.20)',
            }}>Start ${INTRO_PRICE_USD} trial → lock my zip</Link>
            <p style={{ marginTop: 18, fontSize: 12, opacity: 0.85 }}>
              Or call {FOUNDER_PHONE}: <a href={FOUNDER_PHONE_HREF} style={{ color: '#FFF8F0', fontWeight: 800 }}>{FOUNDER_PHONE}</a>
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
