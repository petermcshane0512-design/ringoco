'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Homepage — 2026-06-09 LIGHTER REWRITE.
 *
 * Peter feedback: previous dark-theme version too intimidating + AI-feeling.
 * Switched to warm cream/white palette w/ navy text + orange CTA.
 * BellAveGo logo enlarged. Sample leads dramatically more descriptive +
 * "Generate intro message" button (static AI-grade demo) per lead.
 * Real contractors can click + see exactly what the AI would send.
 */

type SampleLead = {
  name: string
  addr: string
  city: string
  phone: string
  propertyValue: string
  yearBuilt: number
  signalType: string
  signalDetail: string
  hvacAge?: string
  jobValue: string
  score: number
  whatTheyNeed: string
  aiMessage: string
}

const SAMPLE_LEADS: SampleLead[] = [
  {
    name: 'Mike Coleman',
    addr: '7842 Oak Ridge Dr',
    city: 'Plano, TX 75024',
    phone: '(214) 555-0167',
    propertyValue: '$485K',
    yearBuilt: 1998,
    signalType: 'PERMIT FILED',
    signalDetail: 'AC condenser permit · filed 3 days ago',
    hvacAge: '14 yrs',
    jobValue: '$3,200 – $4,800',
    score: 92,
    whatTheyNeed: 'Replacement quote on aging condenser, likely R-22 phase-out',
    aiMessage: `Hi Mike — Pete here w/ Coleman HVAC out of Plano. Saw you pulled a permit for your AC condenser last week, figured I'd reach out before someone else does. We've been running Coleman HVAC for 12 yrs, A+ BBB rated, and right now we're offering 0% financing on full replacements. Want me to swing by for a free second-opinion quote this week? No pressure either way. — Pete (214-555-0166)`,
  },
  {
    name: 'Sarah Whitman',
    addr: '4421 Maple Crest',
    city: 'Plano, TX 75093',
    phone: '(972) 555-0142',
    propertyValue: '$612K',
    yearBuilt: 2002,
    signalType: 'PROPERTY SOLD',
    signalDetail: 'Sold 11 days ago · new homeowner',
    hvacAge: '12 yrs',
    jobValue: '$1,800 – $6,400',
    score: 88,
    whatTheyNeed: 'New homeowners typically schedule HVAC inspection + tune-up within 60 days',
    aiMessage: `Hey Sarah — congrats on the new house on Maple Crest! Pete w/ Coleman HVAC here. Most folks moving in want a quick AC + furnace tune-up before summer hits, makes sure nothing was hiding from the inspection. We're booking $89 tune-up specials all month + we're family-owned, been doing Plano homes 12 yrs. Want me to slot you in this week? — Pete (214-555-0166)`,
  },
  {
    name: 'Carlos Reyes',
    addr: '1923 Briarwood Ln',
    city: 'Frisco, TX 75035',
    phone: '(469) 555-0188',
    propertyValue: '$540K',
    yearBuilt: 2008,
    signalType: 'AGED SYSTEM FLAG',
    signalDetail: 'Heating system 16 yrs old · efficiency code flag',
    hvacAge: '16 yrs',
    jobValue: '$5,400 – $9,200',
    score: 95,
    whatTheyNeed: 'Full heat pump or AC+furnace replacement quote, energy-efficient model',
    aiMessage: `Carlos — Pete from Coleman HVAC, hope you're doing well. Quick note: your heating system pinged on our radar at 16 yrs, which is right at the wall where the efficiency drop really starts costing on monthly bills. We're doing full heat-pump swaps right now w/ 5-yr warranty + Energy Star rebates of $1.5K+. Worth a quick chat? — Pete (214-555-0166)`,
  },
  {
    name: 'Linda Hong',
    addr: '6618 Aspen Trail',
    city: 'Allen, TX 75002',
    phone: '(214) 555-0119',
    propertyValue: '$398K',
    yearBuilt: 1995,
    signalType: 'PERMIT FILED',
    signalDetail: 'Re-permit AC condenser · failed first inspection',
    hvacAge: '15 yrs',
    jobValue: '$2,100 – $3,400',
    score: 86,
    whatTheyNeed: 'Second opinion after a failed inspection — common rescue play',
    aiMessage: `Hi Linda — Pete w/ Coleman HVAC. Noticed Allen pulled a re-permit on your AC, usually that means the first crew missed something on inspection. I've fixed a few of these for neighbors on Aspen + Cottonwood lately. We're licensed + bonded + insured, and a second opinion's free + no pressure. Want me to swing by Thursday? — Pete (214-555-0166)`,
  },
  {
    name: 'James Patel',
    addr: '388 Cedar Park Way',
    city: 'McKinney, TX 75072',
    phone: '(972) 555-0133',
    propertyValue: '$555K',
    yearBuilt: 2004,
    signalType: 'NEW OWNER · AGED HVAC',
    signalDetail: 'Sold 6 weeks ago · system 12 yrs old',
    hvacAge: '12 yrs',
    jobValue: '$2,800 – $5,600',
    score: 84,
    whatTheyNeed: 'New homeowner tune-up + replacement consultation',
    aiMessage: `James — Pete here w/ Coleman HVAC, family-owned outta Plano 12 yrs. Saw you just moved into Cedar Park, congrats! Most new folks like to get the HVAC checked before the brutal summer hits — bonus if you're already thinking long-term, we run $89 tune-ups + can give you a no-pressure replacement quote w/ financing if it's at end-of-life. Want me to come out? — Pete (214-555-0166)`,
  },
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
              padding: '6px 14px', borderRadius: 99,
              background: 'rgba(232,116,43,0.10)',
              border: '1.5px solid rgba(232,116,43,0.30)',
              fontSize: 11, fontWeight: 800, color: '#C84B26',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              marginBottom: 22,
            }}>🔥 Exclusive leads · 80/mo · auto-outreach</span>
            <h1 style={{
              fontSize: 'clamp(34px, 5.2vw, 60px)',
              fontWeight: 900, letterSpacing: '-0.045em',
              lineHeight: 1.03, margin: '0 0 22px',
              color: '#0B1F3A',
            }}>
              If you don&rsquo;t use AI to find your customers,{' '}
              <span style={{
                background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>your competitors will.</span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 1.55vw, 18px)', color: '#4A6670', lineHeight: 1.6, margin: '0 0 28px', maxWidth: 580 }}>
              BellAveGo delivers <strong style={{ color: '#0B1F3A' }}>80 fresh exclusive homeowner leads</strong> to your dashboard every month — real names, addresses, phones, all flagged by permits + aged units + property changes in YOUR zip. Then our AI emails + texts each one <strong style={{ color: '#0B1F3A' }}>as YOU</strong>, using a script tailored to your business. You only respond when they say yes.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
              <Link href="/start?promo=FIRST200" style={ctaHeroPrimary}>
                Claim $97 first month →
              </Link>
              <Link href="/pricing" style={ctaHeroSecondary}>
                See pricing
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, maxWidth: 580 }}>
              {[
                { num: '80', lab: 'fresh leads / mo' },
                { num: '$3.71', lab: 'per lead exclusive' },
                { num: '30d', lab: 'money back · cancel anytime' },
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

          {/* Sample leads card */}
          <div className="hero-stage">
            <LeadsCard />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '76px clamp(16px, 5vw, 48px)', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 40px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px', textAlign: 'center', color: '#0B1F3A' }}>
            Find leads. Close them. <span style={{ color: '#E8742B' }}>Without lifting a finger.</span>
          </h2>
          <p style={{ fontSize: 16, color: '#4A6670', textAlign: 'center', maxWidth: 620, margin: '0 auto 48px', lineHeight: 1.55 }}>
            Three things happen every Monday. You wake up, you check your dashboard, you respond only to homeowners who replied yes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 22 }}>
            {[
              { n: '1', title: 'We find the leads', body: 'Every Monday, we scan public-record events in YOUR zip — permit filings, AC/heating units past their service lifespan, property turnover, code-violation listings. Real intent signal. Real names, addresses, phones. EXCLUSIVE — never shared like HomeAdvisor.' },
              { n: '2', title: 'AI emails + texts them as YOU', body: 'Our AI writes a custom script using your business name, years in business, value props, and tone preference. It then emails AND texts each delivered lead within 6 hours — sounds human, signed by you, totally personalized.' },
              { n: '3', title: 'You only reply to interested ones', body: 'Phone notification the second a homeowner replies. You see the thread, the original lead info, their answer. Call them, text back, or push to your CRM. No cold-prospecting. No HomeAdvisor bait. Just real conversations.' },
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
            Stupid cheap compared to anything else.
          </h2>
          <p style={{ fontSize: 16, color: '#4A6670', textAlign: 'center', maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.55 }}>
            HomeAdvisor sells you bait. Yelp shares it 5 ways. We give you exclusive territory and reach out for you.
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
                  <td style={{ ...td, fontWeight: 900, color: '#C84B26' }}>$3.71</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0B1F3A' }}>✓ EXCLUSIVE per zip</td>
                  <td style={{ ...td, fontWeight: 800, color: '#0B1F3A' }}>✓ AI emails + SMS as you</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#4A6670' }}>
            $3.71/lead at 80 leads/mo for $297. À la carte $15/lead when you want more.
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '80px clamp(16px, 5vw, 48px)', background: 'linear-gradient(135deg, #FF9D5A 0%, #E8742B 50%, #C84B26 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(30px, 4.2vw, 50px)', fontWeight: 900, marginBottom: 18, letterSpacing: '-0.5px', lineHeight: 1.1, color: '#fff' }}>
          Your competitors are using AI<br />to find customers. Are you?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.92)', fontSize: 17, maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.65 }}>
          80 fresh homeowner leads in your zip every month. We email + SMS each one as you. $97 first month w/ <strong>FIRST200</strong>. 30-day money-back. No setup.
        </p>
        <Link href="/start?promo=FIRST200" style={ctaFinal}>
          Claim $97 first month →
        </Link>
        <p style={{ marginTop: 22, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
          Cancel anytime · No phone numbers required · No integration · Onboarding in 90 seconds
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
            <Link href="/start?promo=FIRST200" style={ctaNavPrimary}>$97 first month →</Link>
          </>
        )}
      </div>
    </nav>
  )
}

function LeadsCard() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#C84B26', letterSpacing: '0.12em', textTransform: 'uppercase' }}>This week&rsquo;s leads</div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4, color: '#0B1F3A' }}>Plano TX · HVAC</div>
        </div>
        <div style={{
          padding: '5px 11px', borderRadius: 99,
          background: 'rgba(34,197,94,0.12)',
          border: '1px solid rgba(34,197,94,0.40)',
          fontSize: 10, fontWeight: 800, color: '#16803F', letterSpacing: '0.08em',
        }}>5 NEW</div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {SAMPLE_LEADS.map((l, i) => {
          const open = openIdx === i
          return (
            <div key={i} style={{
              borderRadius: 13,
              background: open ? '#FFF8F0' : '#FFFFFF',
              border: open ? '1.5px solid rgba(232,116,43,0.40)' : '1px solid rgba(232,116,43,0.12)',
              overflow: 'hidden',
              transition: 'all 200ms ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '13px 15px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#0B1F3A' }}>{l.name}</div>
                    <span style={{
                      padding: '2px 7px', borderRadius: 6,
                      background: l.signalType === 'PERMIT FILED' ? '#E8742B' : l.signalType === 'PROPERTY SOLD' ? '#14B8A6' : '#0B1F3A',
                      color: '#fff', fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
                    }}>{l.signalType}</span>
                    <span style={{
                      padding: '2px 7px', borderRadius: 6,
                      background: '#FFD9A8', color: '#C84B26', fontSize: 9, fontWeight: 900,
                    }}>SCORE {l.score}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#4A6670' }}>{l.addr} · {l.city}</div>
                  <div style={{ fontSize: 11, color: '#4A6670', marginTop: 4, lineHeight: 1.5 }}>
                    Built {l.yearBuilt} · {l.propertyValue} home{l.hvacAge ? ` · HVAC ${l.hvacAge}` : ''} · Phone <span style={{ color: '#0B1F3A', fontWeight: 700 }}>{l.phone}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#C84B26', marginTop: 4, fontWeight: 700 }}>📍 {l.signalDetail}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#0B1F3A' }}>{l.jobValue}</div>
                  <div style={{ fontSize: 10, color: '#7AAAB2', marginTop: 2 }}>Est. job value</div>
                </div>
              </div>
              <div style={{ padding: '0 15px 12px' }}>
                <button
                  onClick={() => setOpenIdx(open ? null : i)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: open ? '#0B1F3A' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 900, fontSize: 12, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(232,116,43,0.30)',
                    letterSpacing: '0.02em',
                    transition: 'background 200ms ease',
                  }}
                >
                  {open ? '✕ Hide AI message' : `✨ Show AI intro message → ${l.phone}`}
                </button>
                {open && (
                  <div style={{
                    marginTop: 10,
                    padding: '12px 14px',
                    borderRadius: 11,
                    background: 'linear-gradient(155deg, #0B1F3A 0%, #163356 100%)',
                    color: '#fff',
                    fontSize: 12.5, lineHeight: 1.55,
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#FF9D5A', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 6 }}>
                      Pre-written by AI · ready to send
                    </div>
                    <div style={{ marginBottom: 8, color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>
                      <strong>To:</strong> {l.phone} · <strong>What they need:</strong> {l.whatTheyNeed}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', padding: 11, borderRadius: 9, border: '1px solid rgba(255,255,255,0.10)' }}>
                      &ldquo;{l.aiMessage}&rdquo;
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10.5, color: 'rgba(255,255,255,0.55)' }}>
                      Click &ldquo;Send&rdquo; in your dashboard → message goes from YOUR number, signed by YOU.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px dashed rgba(34,197,94,0.40)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#16803F', letterSpacing: '0.08em', textTransform: 'uppercase' }}>AI Outreach</div>
          <div style={{ fontSize: 12, color: '#0B1F3A', marginTop: 2 }}>All 5 messages ready · 1 already replied · 12 hrs</div>
        </div>
        <div style={{
          padding: '7px 11px', borderRadius: 8,
          background: 'linear-gradient(135deg, #22C55E, #16803F)',
          fontSize: 10, fontWeight: 900, color: '#fff', letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        }}>AUTO · ON</div>
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
