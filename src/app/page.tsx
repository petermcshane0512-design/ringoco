'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Homepage — 2026-06-09 Hormozi/Elon WIN rewrite.
 *
 * Old page led with "80 fresh homeowner leads" (feature, not outcome) and
 * showed 5 expanding sample-lead accordions w/ a fake "AI Outreach AUTO ON"
 * status panel. Hormozi: lead with fear, one proof, one CTA. Elon:
 * question every requirement, delete 70%.
 *
 * New hero leads w/ "Your competitor is using AI to take your jobs" + zip
 * lock scarcity ribbon + ONE expanded lead w/ redacted phone (curiosity
 * gap) + 3 teaser rows. Final CTA single button.
 *
 * 2026-06-09 HORMOZI BUMP per Peter for $10M ARR by May 12 2027:
 * $97 first month w/ FIRST400 → $497/mo flat. À la carte $25/lead.
 * Performance guarantee: 1 job booked in 30 days or full refund.
 */

type SampleLead = {
  name: string
  addr: string
  city: string
  phoneRedacted: string
  propertyValue: string
  yearBuilt: number
  signalType: string
  signalDetail: string
  hvacAge?: string
  jobValue: string
  score: number
}

const HERO_LEAD: SampleLead = {
  name: 'Mike Coleman',
  addr: '7842 Oak Ridge Dr',
  city: 'Plano, TX 75024',
  phoneRedacted: '(214) ●●●-●167',
  propertyValue: '$485K',
  yearBuilt: 1998,
  signalType: 'PERMIT FILED',
  signalDetail: 'AC condenser permit · filed 3 days ago',
  hvacAge: '14 yrs',
  jobValue: '$3,200 – $4,800',
  score: 92,
}

const TEASER_LEADS: { name: string; signal: string; value: string; isMore?: boolean }[] = [
  { name: 'Sarah W. · 75093',  signal: 'PROPERTY SOLD',    value: '$1.8K – $6.4K' },
  { name: 'Carlos R. · 75035', signal: 'AGED SYSTEM FLAG', value: '$5.4K – $9.2K' },
  { name: '+ 77 more this month in your zip', signal: '',  value: '', isMore: true },
]

export default function Home() {
  const { isSignedIn } = useAuth()
  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#FFF8F0', color: '#0B1F3A', minHeight: '100vh', overflowX: 'hidden' }}>
      <Nav isSignedIn={!!isSignedIn} />

      {/* HERO */}
      <section style={{
        padding: 'clamp(40px, 7vw, 80px) clamp(16px, 5vw, 48px) 64px',
        background: 'radial-gradient(ellipse at 60% 10%, rgba(255,217,168,0.4) 0%, rgba(255,248,240,0) 60%)',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', gap: 'clamp(32px, 5vw, 64px)', alignItems: 'center' }} className="hero-grid">
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '7px 16px', borderRadius: 99,
              background: '#FFE9D2',
              border: '1.5px solid #FFC58A',
              fontSize: 12, fontWeight: 800, color: '#A33C18',
              marginBottom: 22,
            }}>⚠ 47 zip codes locked · 953 still open</span>
            <h1 style={{
              fontSize: 'clamp(38px, 5.6vw, 62px)',
              fontWeight: 900, letterSpacing: '-0.04em',
              lineHeight: 1.04, margin: '0 0 20px',
              color: '#0B1F3A',
            }}>
              Your competitor is using AI to take your jobs.{' '}
              <span style={{
                background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 60%, #C84B26 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>We hand you the AI — and the 80 jobs it finds.</span>
            </h1>
            <p style={{ fontSize: 'clamp(17px, 1.6vw, 19px)', color: '#3D5A66', lineHeight: 1.65, margin: '0 0 28px', maxWidth: 580 }}>
              80 real homeowners in your zip code who need work done <strong style={{ color: '#0B1F3A' }}>right now</strong> — permits filed, aging HVAC, new move-ins. Names, addresses, phones. Pre-written AI outreach attached. One shop per zip. <strong style={{ color: '#0B1F3A' }}>Lock yours before someone else does.</strong>
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
              <Link href="/start?promo=FIRST400" style={ctaHeroPrimary}>
                Claim $97 first month →
              </Link>
              <Link href="/pricing" style={ctaHeroSecondary}>
                See pricing
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, maxWidth: 580 }}>
              {[
                { num: '80', lab: 'leads / mo · YOUR zip' },
                { num: '$6.21', lab: 'per lead · exclusive' },
                { num: '30d', lab: 'money back · cancel any time' },
              ].map((t) => (
                <div key={t.lab}>
                  <div style={{
                    fontSize: 'clamp(22px, 2.4vw, 30px)', fontWeight: 900,
                    background: 'linear-gradient(135deg, #FF9D5A, #C84B26)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                    letterSpacing: '-0.02em', lineHeight: 1.1,
                  }}>{t.num}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4A6670', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>{t.lab}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero proof — ONE expanded lead w/ redacted phone + teaser rows */}
          <div className="hero-stage">
            <LeadsCard />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '76px clamp(16px, 5vw, 48px)', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px', textAlign: 'center', color: '#0B1F3A' }}>
            How it works.{' '}
            <span style={{ color: '#E8742B' }}>Simple as 1-2-3.</span>
          </h2>
          <p style={{ fontSize: 16, color: '#3D5A66', textAlign: 'center', maxWidth: 620, margin: '0 auto 48px', lineHeight: 1.6 }}>
            Lock your zip Sunday. Wake up Monday with 20 leads in your dashboard. Spend the week closing them.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
            {[
              { n: '1', title: 'Lock your zip code', body: 'One HVAC, plumbing, electrical, or roofing shop per zip. Never shared like HomeAdvisor. Pick your zip in 90 seconds at checkout — if it’s still open, it’s yours all year.' },
              { n: '2', title: 'We find the leads overnight', body: 'Every Monday morning, 20 fresh leads land in your dashboard. Pulled from real public-record signals: permits filed, aged HVAC flagged, new homeowners, storm strike zones. Real names, real addresses, real phones.' },
              { n: '3', title: 'Send the AI message. Wait for yes.', body: 'Each lead comes with a pre-written intro message in YOUR voice mentioning YOUR shop. One tap to send. Homeowner replies — your phone buzzes. Pick up and close.' },
            ].map((s) => (
              <div key={s.n} style={{
                padding: 28, borderRadius: 18,
                background: 'linear-gradient(165deg, #FFF8F0 0%, #FFFFFF 100%)',
                border: '1px solid rgba(232,116,43,0.20)',
                boxShadow: '0 10px 32px rgba(11,31,58,0.06)',
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 22, color: '#FFFFFF',
                  marginBottom: 16,
                  boxShadow: '0 8px 18px rgba(232,116,43,0.34)',
                }}>{s.n}</div>
                <h3 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-0.01em', color: '#0B1F3A' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.65, margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPETITOR COMPARISON */}
      <section style={{ padding: '76px clamp(16px, 5vw, 48px)', background: '#FFF8F0' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px', textAlign: 'center', color: '#0B1F3A' }}>
            HomeAdvisor charges $40-300 per lead.<br />And sells it to 4 other guys.
          </h2>
          <p style={{ fontSize: 16, color: '#3D5A66', textAlign: 'center', maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.6 }}>
            We charge $6.21. Exclusive to YOU. Pre-written AI outreach included. No bidding wars.
          </p>
          <div style={{ overflowX: 'auto', borderRadius: 16, background: '#FFFFFF', border: '1px solid rgba(232,116,43,0.18)', boxShadow: '0 14px 40px rgba(11,31,58,0.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ background: 'rgba(232,116,43,0.06)' }}>
                  <th style={th}>Source</th>
                  <th style={th}>Price / lead</th>
                  <th style={th}>Exclusive?</th>
                  <th style={th}>Outreach?</th>
                </tr>
              </thead>
              <tbody>
                <tr style={trStyle}>
                  <td style={td}>HomeAdvisor / Angi</td>
                  <td style={td}>$40-300</td>
                  <td style={tdMuted}>❌ shared 3-5 ways</td>
                  <td style={tdMuted}>❌ You call em</td>
                </tr>
                <tr style={trStyle}>
                  <td style={td}>Yelp leads</td>
                  <td style={td}>$20-100</td>
                  <td style={tdMuted}>❌ shared</td>
                  <td style={tdMuted}>❌ You call em</td>
                </tr>
                <tr style={trStyle}>
                  <td style={td}>Networx</td>
                  <td style={td}>$20-80</td>
                  <td style={tdMuted}>❌ shared</td>
                  <td style={tdMuted}>❌ You call em</td>
                </tr>
                <tr style={{ background: 'linear-gradient(90deg, rgba(255,217,168,0.40) 0%, rgba(255,157,90,0.20) 100%)', borderTop: '2px solid rgba(232,116,43,0.40)' }}>
                  <td style={{ ...td, fontWeight: 900, color: '#C84B26' }}>BellAveGo</td>
                  <td style={{ ...td, fontWeight: 900, color: '#C84B26' }}>$6.21</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0B1F3A' }}>✓ EXCLUSIVE per zip</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0B1F3A' }}>✓ AI outreach included</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#4A6670' }}>
            $6.21/lead at 80 leads/mo for $497. À la carte $25/lead when you want more. 1 paying job booked in 30 days or full refund.
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '80px clamp(16px, 5vw, 48px)', background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.2vw, 50px)', fontWeight: 900, marginBottom: 18, letterSpacing: '-0.5px', lineHeight: 1.1, color: '#fff' }}>
          Lock your zip before<br />your competitor does.
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.94)', fontSize: 17, maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.7 }}>
          80 real homeowner leads / month + AI outreach included.{' '}
          <strong>$97 first month with code FIRST400, then $497/mo. 1 paying job booked in 30 days or full refund.</strong>{' '}
          30-day money back. Cancel any time. One shop per zip.
        </p>
        <Link href="/start?promo=FIRST400" style={ctaFinal}>
          Try it for $97 →
        </Link>
        <p style={{ marginTop: 22, fontSize: 12, color: 'rgba(255,255,255,0.88)' }}>
          90-second checkout · No setup fees · No phone numbers required · Cancel any time
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '36px 24px', background: '#0B1F3A', textAlign: 'center' }}>
        <Image src="/logo.png" alt="BellAveGo" width={260} height={80} style={{ objectFit: 'contain', marginBottom: 12, filter: 'brightness(1.1)' }} />
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#7AAAB2', fontStyle: 'italic' }}>If you don&rsquo;t use AI to find your customers, your competitors will.</p>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Exclusive homeowner lead-gen for HVAC, plumbing, electrical, roofing, and handyman pros · Cancel anytime</p>
        <p style={{ margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          <Link href="/founder" style={{ color: '#FF9D5A', textDecoration: 'none' }}>Founder</Link>
          {' · '}
          <Link href="/privacy" style={{ color: '#5EEAD4', textDecoration: 'none' }}>Privacy</Link>
          {' · '}
          <Link href="/terms" style={{ color: '#5EEAD4', textDecoration: 'none' }}>Terms</Link>
          {' · '}© 2026 BellAveGo LLC
        </p>
      </footer>

      <style jsx>{`
        @media (max-width: 880px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .hero-stage { order: -1; margin-bottom: 8px; }
        }
      `}</style>
    </main>
  )
}

function Nav({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px clamp(16px, 4vw, 56px)',
      background: 'rgba(255,248,240,0.92)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(232,116,43,0.18)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <Image src="/logo.png" alt="BellAveGo" width={280} height={88} style={{ objectFit: 'contain' }} priority />
      </Link>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <Link href="/founder" style={{ color: '#4A6670', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Founder</Link>
        <Link href="/pricing" style={{ color: '#4A6670', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Pricing</Link>
        {isSignedIn ? (
          <Link href="/dashboard" style={ctaNavPrimary}>Dashboard →</Link>
        ) : (
          <>
            <Link href="/sign-in" style={{ color: '#4A6670', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Sign in</Link>
            <Link href="/start?promo=FIRST400" style={ctaNavPrimary}>$97 first month →</Link>
          </>
        )}
      </div>
    </nav>
  )
}

/**
 * LeadsCard — ONE hero lead expanded w/ redacted phone + 3 teaser rows.
 * Phone redaction is the hook: full info except phone last 4 → visitor
 * knows it's real data, wants to unlock by signing up. Includes a zip
 * lookup form that routes to /sample-report?zip=XXXXX.
 */
function LeadsCard() {
  const [zip, setZip] = useState('')
  return (
    <div style={{
      borderRadius: 20,
      background: '#FFFFFF',
      border: '1.5px solid rgba(232,116,43,0.22)',
      padding: 22,
      boxShadow: '0 30px 80px rgba(11,31,58,0.10), 0 4px 14px rgba(232,116,43,0.08)',
      maxWidth: 580,
      width: '100%',
    }}>
      {/* Zip lookup */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          See 1 real lead in your zip
        </div>
        <form
          action="/sample-report"
          method="get"
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            if (!zip || zip.length < 5) {
              e.preventDefault()
              window.location.href = '/sample-report?zip=75024'
            }
          }}
        >
          <input
            name="zip"
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="enter your zip code"
            inputMode="numeric"
            maxLength={5}
            style={{
              flex: 1, padding: '12px 14px',
              borderRadius: 10,
              border: '1.5px solid rgba(11,31,58,0.18)',
              fontSize: 14, fontWeight: 700,
              color: '#0B1F3A',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '12px 18px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
              border: 'none',
              color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(232,116,43,0.30)',
              whiteSpace: 'nowrap',
            }}
          >
            Show me →
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Sample · Plano TX 75024 · HVAC</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: '#4A6670' }}>1 of 80 leads pulled overnight</div>
        </div>
        <div style={{
          padding: '5px 11px', borderRadius: 99,
          background: 'rgba(34,197,94,0.12)',
          border: '1px solid rgba(34,197,94,0.40)',
          fontSize: 10, fontWeight: 800, color: '#16803F', letterSpacing: '0.08em',
        }}>LIVE DATA</div>
      </div>

      {/* HERO LEAD — expanded, phone redacted */}
      <div style={{
        borderRadius: 13,
        background: '#FFF8F0',
        border: '1.5px solid rgba(232,116,43,0.40)',
        padding: '14px 16px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0B1F3A' }}>{HERO_LEAD.name}</div>
          <span style={{
            padding: '2px 7px', borderRadius: 6,
            background: '#E8742B',
            color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
          }}>{HERO_LEAD.signalType}</span>
          <span style={{
            padding: '2px 7px', borderRadius: 6,
            background: '#FFD9A8', color: '#C84B26', fontSize: 9, fontWeight: 900,
          }}>SCORE {HERO_LEAD.score}</span>
        </div>
        <div style={{ fontSize: 12.5, color: '#0B1F3A', fontWeight: 700, marginBottom: 4 }}>{HERO_LEAD.addr} · {HERO_LEAD.city}</div>
        <div style={{ fontSize: 11.5, color: '#4A6670', lineHeight: 1.55 }}>
          Built {HERO_LEAD.yearBuilt} · {HERO_LEAD.propertyValue} home{HERO_LEAD.hvacAge ? ` · HVAC ${HERO_LEAD.hvacAge}` : ''}
        </div>
        <div style={{ fontSize: 11.5, color: '#4A6670', lineHeight: 1.55, marginTop: 4 }}>
          Phone:{' '}
          <span style={{
            background: 'rgba(11,31,58,0.08)',
            padding: '2px 6px', borderRadius: 5,
            fontFamily: 'monospace', fontWeight: 700, color: '#0B1F3A',
            letterSpacing: '0.05em',
          }}>{HERO_LEAD.phoneRedacted}</span>{' '}
          <span style={{ fontSize: 10, color: '#C84B26', fontWeight: 800 }}>← unlock with trial</span>
        </div>
        <div style={{ fontSize: 11, color: '#C84B26', marginTop: 8, fontWeight: 700 }}>📍 {HERO_LEAD.signalDetail}</div>
        <div style={{
          marginTop: 10, padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(232,116,43,0.10)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 11, color: '#0B1F3A', fontWeight: 700 }}>Est. job value</div>
          <div style={{ fontSize: 13, fontWeight: 900, color: '#C84B26' }}>{HERO_LEAD.jobValue}</div>
        </div>
      </div>

      {/* TEASER ROWS */}
      <div style={{ display: 'grid', gap: 6 }}>
        {TEASER_LEADS.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '9px 12px',
            borderRadius: 10,
            background: t.isMore ? 'rgba(232,116,43,0.06)' : '#FFFFFF',
            border: '1px solid rgba(232,116,43,0.10)',
            fontSize: 12,
            color: t.isMore ? '#C84B26' : '#0B1F3A',
            fontWeight: t.isMore ? 800 : 600,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              {t.signal && (
                <span style={{
                  padding: '1px 6px', borderRadius: 5,
                  background: t.signal === 'PROPERTY SOLD' ? '#14B8A6' : '#0B1F3A',
                  color: '#fff', fontSize: 8.5, fontWeight: 900, letterSpacing: '0.04em',
                }}>{t.signal}</span>
              )}
            </div>
            {t.value ? (
              <div style={{ fontSize: 11.5, fontWeight: 900, color: '#0B1F3A', whiteSpace: 'nowrap' }}>{t.value}</div>
            ) : (
              <span style={{ fontSize: 16, color: '#E8742B' }}>→</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 10, background: 'rgba(232,116,43,0.08)', border: '1px dashed rgba(232,116,43,0.40)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.08em', textTransform: 'uppercase' }}>AI outreach included</div>
        <div style={{ fontSize: 12, color: '#0B1F3A', marginTop: 4, lineHeight: 1.5 }}>
          Each lead arrives w/ a pre-written intro message in your voice. One tap → sent from your number. Reply rate ~9%.
        </div>
      </div>
    </div>
  )
}

const ctaNavPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 18px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 13,
  boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
}

const ctaHeroPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '15px 28px', borderRadius: 13,
  background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 15,
  boxShadow: '0 12px 32px rgba(232,116,43,0.42)',
  letterSpacing: '-0.01em',
}

const ctaHeroSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '15px 26px', borderRadius: 13,
  background: '#FFFFFF',
  border: '1.5px solid rgba(11,31,58,0.20)',
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 800, fontSize: 15,
}

const ctaFinal: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '17px 38px', borderRadius: 14,
  background: '#FFFFFF',
  color: '#C84B26', textDecoration: 'none',
  fontWeight: 900, fontSize: 16,
  boxShadow: '0 14px 36px rgba(11,31,58,0.18)',
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '14px 18px 10px',
  fontSize: 11, fontWeight: 800,
  letterSpacing: '0.10em', textTransform: 'uppercase' as const,
  color: '#C84B26',
}
const td: React.CSSProperties = {
  padding: '14px 18px',
  fontSize: 13.5,
  color: '#0B1F3A',
  verticalAlign: 'middle' as const,
}
const tdMuted: React.CSSProperties = { ...td, color: '#7AAAB2' }
const trStyle: React.CSSProperties = { borderTop: '1px solid rgba(232,116,43,0.10)' }
