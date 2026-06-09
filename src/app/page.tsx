'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@clerk/nextjs'

/**
 * Homepage — 2026-06-09 PIVOT REWRITE.
 *
 * Pure homeowner lead-gen positioning. Drop AI receptionist entirely.
 * Dark theme, big BellAveGo branding, sample-leads dashboard mockup
 * as hero visual.
 *
 * The frame: "If you don't use AI to find your customers, your competitors
 * will." Hormozi grand slam — dream outcome (more booked jobs) + perceived
 * likelihood (real public-record signal) + low time delay (Monday) + low
 * effort (auto-outreach).
 */

const SAMPLE_LEADS = [
  { name: 'Mike Coleman', addr: '7842 Oak Ridge Dr', city: 'Plano, TX 75024', signal: 'AC permit filed · 14yr-old unit', age: '3 hrs ago', value: '$3,200', status: 'fresh' },
  { name: 'Sarah Whitman', addr: '4421 Maple Crest', city: 'Plano, TX 75093', signal: 'Property sold · new owner', age: '5 hrs ago', value: '$1,800', status: 'fresh' },
  { name: 'Carlos Reyes', addr: '1923 Briarwood Ln', city: 'Frisco, TX 75035', signal: 'Heating system 16yr · code flag', age: '6 hrs ago', value: '$5,400', status: 'replied' },
  { name: 'Linda Hong', addr: '6618 Aspen Trail', city: 'Allen, TX 75002', signal: 'Re-permit AC condenser', age: '8 hrs ago', value: '$2,100', status: 'fresh' },
  { name: 'James Patel', addr: '388 Cedar Park Way', city: 'McKinney, TX 75072', signal: 'New owner · 12yr HVAC', age: '11 hrs ago', value: '$2,800', status: 'fresh' },
]

export default function Home() {
  const { isSignedIn } = useAuth()

  return (
    <main style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#050E1F', color: '#fff', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* TOP NAV */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px clamp(16px, 4vw, 56px)',
        background: 'rgba(5,14,31,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(94,234,212,0.15)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={180} height={56} style={{ objectFit: 'contain', filter: 'brightness(1.05)' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Link href="/pricing" style={{ color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Pricing</Link>
          {isSignedIn ? (
            <Link href="/dashboard" style={ctaPrimary}>Open Dashboard →</Link>
          ) : (
            <>
              <Link href="/sign-in" style={{ color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Sign in</Link>
              <Link href="/start?promo=FIRST200" style={ctaPrimary}>Get $97 first month →</Link>
            </>
          )}
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        padding: 'clamp(48px, 8vw, 96px) clamp(16px, 5vw, 48px) 64px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(94,234,212,0.10) 0%, rgba(5,14,31,0) 60%)',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)', gap: 'clamp(32px, 6vw, 80px)', alignItems: 'center' }} className="hero-grid">
          {/* Left — copy */}
          <div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 99,
              background: 'rgba(94,234,212,0.10)',
              border: '1px solid rgba(94,234,212,0.30)',
              fontSize: 11, fontWeight: 800, color: '#5EEAD4',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              marginBottom: 22,
            }}>🔥 Exclusive homeowner leads · weekly</span>
            <h1 style={{
              fontSize: 'clamp(36px, 5.5vw, 64px)',
              fontWeight: 900, letterSpacing: '-0.045em',
              lineHeight: 1.02, margin: '0 0 24px',
            }}>
              If you don&rsquo;t use AI to find your customers,{' '}
              <span style={{
                background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%, #C84B26 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}>your competitors will.</span>
            </h1>
            <p style={{ fontSize: 'clamp(16px, 1.6vw, 19px)', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55, margin: '0 0 28px', maxWidth: 580 }}>
              BellAveGo delivers <strong style={{ color: '#fff' }}>80 fresh exclusive homeowner leads</strong> to your dashboard every month — real names, addresses, phones, all flagged by permits + aged units + property changes in YOUR zip. Then our AI emails + texts each one <strong style={{ color: '#fff' }}>as YOU</strong>, using a prompt tailored to your business. You only respond when they say yes.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
              <Link href="/start?promo=FIRST200" style={ctaHeroPrimary}>
                Claim $97 first month →
              </Link>
              <Link href="/pricing" style={ctaHeroSecondary}>
                See pricing
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 560 }}>
              {[
                { num: '80', lab: 'fresh leads / mo' },
                { num: '$3.71', lab: 'per lead exclusive' },
                { num: '30d', lab: 'money back · cancel anytime' },
              ].map((t) => (
                <div key={t.lab}>
                  <div style={{
                    fontSize: 'clamp(22px, 2.4vw, 30px)', fontWeight: 900,
                    background: 'linear-gradient(135deg, #5EEAD4, #14B8A6)',
                    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                    letterSpacing: '-0.02em', lineHeight: 1.1,
                  }}>{t.num}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 3 }}>{t.lab}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — leads dashboard mockup */}
          <div className="hero-stage">
            <LeadsDashboardMock />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px clamp(16px, 5vw, 48px)', background: '#0B1F3A' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px', textAlign: 'center' }}>
            Find leads. Close them. <span style={{ color: '#5EEAD4' }}>Without lifting a finger.</span>
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: 640, margin: '0 auto 48px', lineHeight: 1.55 }}>
            Three things happen every Monday. You wake up, you check your dashboard, you respond only to homeowners who replied yes.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 22 }}>
            {[
              {
                n: '1',
                title: 'We find the leads',
                body: 'Every Monday, we scan public-record events in YOUR zip — permits filed, AC/heating units past their lifespan, property turnover. Real intent signal. Real names, real addresses, real phones. EXCLUSIVE — never shared like HomeAdvisor.',
              },
              {
                n: '2',
                title: 'AI emails + texts them as YOU',
                body: 'Our AI writes a custom prompt using your business name, years in business, value props, and tone preferences. It then emails AND texts each delivered lead within 6 hours — sounds human, signed by you, totally personalized.',
              },
              {
                n: '3',
                title: 'You only reply to interested ones',
                body: 'Phone notification the second a homeowner replies. You see the thread, the original lead info, their answer. Call them, text back, or push to your CRM. No cold-prospecting. No HomeAdvisor bait. Just real conversations.',
              },
            ].map((s) => (
              <div key={s.n} style={{
                padding: 28, borderRadius: 16,
                background: 'linear-gradient(165deg, rgba(15,37,66,0.7) 0%, rgba(10,27,51,0.8) 100%)',
                border: '1px solid rgba(94,234,212,0.22)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 22, color: '#0B1F3A',
                  marginBottom: 16,
                }}>{s.n}</div>
                <h3 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6, margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPETITOR COMPARISON */}
      <section style={{ padding: '80px clamp(16px, 5vw, 48px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 42px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 14px', textAlign: 'center' }}>
            Stupid cheap compared to anything else.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.65)', textAlign: 'center', maxWidth: 640, margin: '0 auto 36px', lineHeight: 1.55 }}>
            HomeAdvisor sells you bait. Yelp shares it 5 ways. We give you exclusive territory and reach out for you.
          </p>
          <div style={{ overflowX: 'auto', borderRadius: 14, background: 'rgba(15,37,66,0.55)', border: '1px solid rgba(94,234,212,0.22)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr style={{ background: 'rgba(11,31,58,0.7)' }}>
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
                <tr style={{ background: 'rgba(232,116,43,0.10)', borderTop: '2px solid rgba(232,116,43,0.30)' }}>
                  <td style={{ ...td, fontWeight: 900, color: '#FF9D5A' }}>BellAveGo</td>
                  <td style={{ ...td, fontWeight: 900, color: '#5EEAD4' }}>$3.71</td>
                  <td style={{ ...td, fontWeight: 800, color: '#5EEAD4' }}>✓ EXCLUSIVE per zip</td>
                  <td style={{ ...td, fontWeight: 800, color: '#5EEAD4' }}>✓ AI emails + SMS as you</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            $3.71/lead at 80 leads/mo for $297. À la carte $15/lead when you want more.
          </p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '88px clamp(16px, 5vw, 48px)', background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 100%)', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 900, marginBottom: 18, letterSpacing: '-1px', lineHeight: 1.1 }}>
          Your competitors are using AI<br />to find customers. <span style={{ color: '#FF9D5A' }}>Are you?</span>
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 17, maxWidth: 580, margin: '0 auto 36px', lineHeight: 1.7 }}>
          80 fresh homeowner leads in your zip every month. We email + SMS each one as you. $97 first month w/ <strong style={{ color: '#FFD9A8' }}>FIRST200</strong>. 30-day money-back. No setup.
        </p>
        <Link href="/start?promo=FIRST200" style={ctaFinal}>
          Claim $97 first month →
        </Link>
        <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          Cancel anytime · No phone numbers required · No integration · Onboarding in 90 seconds
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '36px 24px', background: '#020816', textAlign: 'center', borderTop: '1px solid rgba(94,234,212,0.10)' }}>
        <Image src="/logo.png" alt="BellAveGo" width={220} height={68} style={{ objectFit: 'contain', marginBottom: 12 }} />
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>If you don&rsquo;t use AI to find your customers, your competitors will.</p>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Exclusive homeowner lead-gen for HVAC, plumbing, electrical, roofing, and handyman pros · Cancel anytime</p>
        <p style={{ margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
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

function LeadsDashboardMock() {
  return (
    <div style={{
      borderRadius: 18,
      background: 'linear-gradient(155deg, #050E1F 0%, #0B1F3A 100%)',
      border: '1px solid rgba(94,234,212,0.30)',
      padding: 22,
      boxShadow: '0 30px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(94,234,212,0.08)',
      maxWidth: 540,
      width: '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.12em', textTransform: 'uppercase' }}>This week&rsquo;s leads</div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>Plano TX · HVAC</div>
        </div>
        <div style={{
          padding: '5px 11px', borderRadius: 99,
          background: 'rgba(34,197,94,0.15)',
          border: '1px solid rgba(34,197,94,0.40)',
          fontSize: 10, fontWeight: 800, color: '#22C55E', letterSpacing: '0.08em',
        }}>5 NEW</div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {SAMPLE_LEADS.map((l, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 11,
            background: l.status === 'replied' ? 'rgba(232,116,43,0.10)' : 'rgba(15,37,66,0.65)',
            border: l.status === 'replied' ? '1.5px solid rgba(232,116,43,0.45)' : '1px solid rgba(94,234,212,0.12)',
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{l.name}</div>
                {l.status === 'replied' && (
                  <span style={{ padding: '2px 7px', borderRadius: 6, background: '#E8742B', color: '#0B1F3A', fontSize: 9, fontWeight: 900, letterSpacing: '0.05em' }}>REPLIED</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{l.addr} · {l.city}</div>
              <div style={{ fontSize: 10.5, color: '#5EEAD4', marginTop: 4, fontWeight: 700 }}>{l.signal}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#FFD9A8' }}>{l.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{l.age}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 10, background: 'rgba(94,234,212,0.08)', border: '1px dashed rgba(94,234,212,0.30)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.08em', textTransform: 'uppercase' }}>AI Outreach</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>5 of 5 emails + SMS sent as you · 1 replied · 12 hrs</div>
        </div>
        <div style={{
          padding: '7px 11px', borderRadius: 8,
          background: 'linear-gradient(135deg, #22C55E, #14B8A6)',
          fontSize: 10, fontWeight: 900, color: '#0B1F3A', letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        }}>AUTO · ON</div>
      </div>
    </div>
  )
}

const ctaPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '10px 18px', borderRadius: 10,
  background: 'linear-gradient(135deg, #14B8A6 0%, #06B6D4 100%)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 900, fontSize: 13,
  boxShadow: '0 6px 18px rgba(20,184,166,0.32)',
}

const ctaHeroPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '15px 28px', borderRadius: 12,
  background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 75%, #C84B26 100%)',
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 900, fontSize: 15,
  boxShadow: '0 12px 32px rgba(232,116,43,0.42)',
  letterSpacing: '-0.01em',
}

const ctaHeroSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '15px 26px', borderRadius: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1.5px solid rgba(255,255,255,0.18)',
  color: '#fff', textDecoration: 'none',
  fontWeight: 800, fontSize: 15,
}

const ctaFinal: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '18px 40px', borderRadius: 14,
  background: 'linear-gradient(135deg, #22C55E 0%, #14B8A6 100%)',
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 900, fontSize: 16,
  boxShadow: '0 16px 40px rgba(34,197,94,0.42)',
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '14px 18px 10px',
  fontSize: 11, fontWeight: 800,
  letterSpacing: '0.10em', textTransform: 'uppercase' as const,
  color: '#5EEAD4',
}
const td: React.CSSProperties = {
  padding: '14px 18px',
  fontSize: 13,
  color: 'rgba(255,255,255,0.85)',
  verticalAlign: 'middle' as const,
}
const tdMuted: React.CSSProperties = { ...td, color: 'rgba(255,255,255,0.55)' }
const trStyle: React.CSSProperties = { borderTop: '1px solid rgba(94,234,212,0.10)' }
