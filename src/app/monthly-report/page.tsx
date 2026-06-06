import type { Metadata } from 'next'
import Link from 'next/link'
import { LEADS, TAG_STYLES, CALLS, usd } from '@/lib/sampleLeads'

/**
 * /monthly-report — public, no-auth, the "what you actually get each month"
 * sample. 20 leads (4 weekly drops × 5 leads each) for a fictional Phoenix
 * HVAC shop, plus the calls-answered / revenue-captured strip.
 *
 * Linked from the homepage ConsultingShowcase CTA ("View Full Monthly
 * Report of 20"). Lives next to /sample-report (the legacy 1:1 cold-
 * outreach growth report) instead of replacing it, so existing cold-
 * email URLs don't 404.
 *
 * noindex: this is a sales artifact, not SEO content. Keeps it from
 * competing with /answering-service/[trade]-[city].
 */
export const metadata: Metadata = {
  title: 'BellAveGo Monthly Lead Report — Sample (Phoenix HVAC)',
  description: '20 high-intent leads ranked by addressable revenue × intent score. Plus every call your AI receptionist answered this month. See exactly what BellAveGo delivers.',
  robots: { index: false, follow: false },
}

const WEEKS = [
  { label: 'Week of June 9, 2026',  range: [0, 5]   as const },
  { label: 'Week of June 16, 2026', range: [5, 10]  as const },
  { label: 'Week of June 23, 2026', range: [10, 15] as const },
  { label: 'Week of June 30, 2026', range: [15, 20] as const },
]

const TOTAL_PIPELINE = LEADS.reduce((sum, l) => sum + l.est, 0)

export default function Page() {
  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 55%, #112C4A 100%)',
      color: '#fff',
      minHeight: '100vh',
    }}>
      {/* HERO */}
      <section style={{
        padding: '64px 24px 40px',
        textAlign: 'center',
        background:
          'radial-gradient(900px 500px at 90% 8%, rgba(232,123,55,0.18), transparent 65%),' +
          'radial-gradient(700px 500px at 8% 92%, rgba(94,234,212,0.10), transparent 65%)',
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px',
            borderRadius: 99,
            background: 'rgba(94,234,212,0.10)',
            border: '1px solid rgba(94,234,212,0.30)',
            fontSize: 10.5, fontWeight: 800, color: '#5EEAD4',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            marginBottom: 16,
          }}>BellAveGo Monthly Lead Report · Sample</span>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 46px)',
            fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.05,
            margin: '0 0 14px',
          }}>
            20 high-intent homeowners. Four weekly drops.{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%, #C84B26 100%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(232,116,43,0.35))',
            }}>{usd(TOTAL_PIPELINE)} in addressable pipeline.</span>
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.55, color: 'rgba(255,255,255,0.72)',
            maxWidth: 700, margin: '0 auto 28px',
          }}>
            This is a real sample month for a Phoenix HVAC shop. Every Monday we drop 5 pre-qualified
            homeowners with the exact reason they need service today, their real phone number, and
            a tap-to-call link. Permits, deed transfers, aging units, rebate windows, new neighbors,
            storm zones, energy-bill spikes, probate transitions, and competitor-switch targets — sourced
            from public data the moment it hits the wire.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/pricing" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '15px 26px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%)',
              color: '#0B1F3A',
              fontWeight: 900, fontSize: 15,
              textDecoration: 'none',
              boxShadow: '0 14px 36px rgba(232,116,43,0.42)',
            }}>
              Get my monthly report — $297/mo →
            </Link>
            <Link href="/" style={{
              padding: '15px 22px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(94,234,212,0.30)',
              color: '#fff',
              fontWeight: 700, fontSize: 14,
              textDecoration: 'none',
            }}>← Back to homepage</Link>
          </div>
        </div>
      </section>

      {/* WEEKLY DROPS */}
      <section style={{ padding: '20px 16px 40px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          {WEEKS.map((wk, wi) => {
            const slice = LEADS.slice(wk.range[0], wk.range[1])
            const weekPipeline = slice.reduce((s, l) => s + l.est, 0)
            return (
              <div key={wk.label} style={{
                background: 'linear-gradient(165deg, #0F2542 0%, #0A1B33 100%)',
                border: '1px solid rgba(94,234,212,0.24)',
                borderRadius: 18,
                boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(94,234,212,0.10)',
                overflow: 'hidden',
                marginBottom: 26,
              }}>
                <div style={{
                  padding: '18px 22px',
                  background: 'linear-gradient(135deg, rgba(232,116,43,0.08), rgba(94,234,212,0.06))',
                  borderBottom: '1px solid rgba(94,234,212,0.14)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 900, fontSize: 14,
                      boxShadow: '0 6px 14px rgba(232,116,43,0.42)',
                    }}>{wi + 1}</div>
                    <div>
                      <div style={{
                        fontSize: 10, fontWeight: 800, color: '#FF9D5A',
                        letterSpacing: '0.16em', textTransform: 'uppercase',
                      }}>Weekly Drop</div>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>{wk.label}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>This week</div>
                    <div style={{
                      fontSize: 22, fontWeight: 900,
                      background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)',
                      WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                      letterSpacing: '-0.4px',
                    }}>{usd(weekPipeline)}</div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Homeowner</th>
                        <th style={thStyle}>Why you should call</th>
                        <th style={thStyle}>Phone</th>
                        <th style={thStyle}>Score</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Est. Job</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map((l, i) => {
                        const ts = TAG_STYLES[l.tag]
                        const idx = wk.range[0] + i + 1
                        const telHref = 'tel:+1' + l.phone.replace(/[^0-9]/g, '')
                        return (
                          <tr key={`${wi}-${i}`}>
                            <td style={tdStyle}>
                              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700 }}>{String(idx).padStart(2, '0')}</span>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.1px' }}>{l.owner}</div>
                              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{l.address}</div>
                              <div style={{ marginTop: 6 }}>
                                <span style={{
                                  display: 'inline-block',
                                  fontSize: 9.5, fontWeight: 800,
                                  padding: '3px 8px', borderRadius: 99,
                                  background: ts.bg, color: ts.color,
                                  border: '1px solid ' + ts.border,
                                  letterSpacing: '0.04em',
                                  whiteSpace: 'nowrap',
                                }}>{l.tag}</span>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.82)', maxWidth: 380 }}>{l.why}</div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#5EEAD4', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>{l.phone}</div>
                            </td>
                            <td style={tdStyle}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, fontWeight: 800,
                                padding: '3px 8px', borderRadius: 8,
                                background: 'rgba(34,197,94,0.10)',
                                border: '1px solid rgba(34,197,94,0.30)',
                                color: '#86EFAC',
                              }}>{l.score.toFixed(1)} / 10</span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <div style={{
                                fontSize: 13, fontWeight: 900,
                                background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)',
                                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                                whiteSpace: 'nowrap', letterSpacing: '-0.2px',
                              }}>{usd(l.est)}</div>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <a href={telHref} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '7px 11px',
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                                color: '#fff',
                                fontSize: 11, fontWeight: 800,
                                textDecoration: 'none',
                                boxShadow: '0 4px 12px rgba(232,116,43,0.42)',
                                whiteSpace: 'nowrap',
                              }}>Call</a>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CALLS STRIP */}
      <section style={{ padding: '0 16px 60px' }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto',
          background:
            'radial-gradient(600px 220px at 90% 0%, rgba(94,234,212,0.10), transparent 70%),' +
            'linear-gradient(165deg, #0F2542 0%, #0A1B33 100%)',
          border: '1px solid rgba(94,234,212,0.22)',
          borderRadius: 16,
          padding: '24px 24px 22px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-block',
              fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
              color: '#5EEAD4',
              padding: '4px 10px', borderRadius: 99,
              background: 'rgba(94,234,212,0.10)',
              border: '1px solid rgba(94,234,212,0.30)',
            }}>Also this month</span>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
              Your AI receptionist worked while you slept.
            </div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}>
            <StatBox num={String(CALLS.answered)} lab="Calls Answered" tone="teal" />
            <StatBox num={String(CALLS.bookedJobs)} lab="Jobs Booked" tone="teal" />
            <StatBox num={usd(CALLS.estRevenueCaptured)} lab="Est. Revenue Captured" tone="money" />
            <StatBox num={usd(CALLS.avgTicket)} lab="Avg Ticket" tone="money" />
          </div>
          <div style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(232,116,43,0.08)',
            border: '1px solid rgba(232,116,43,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 800, color: '#FF9D5A', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Biggest call this month</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginTop: 2 }}>{CALLS.topCall.customer}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{CALLS.topCall.note}</div>
            </div>
            <div style={{
              fontSize: 20, fontWeight: 900,
              background: 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>{usd(CALLS.topCall.value)}</div>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section style={{ padding: '0 24px 80px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 36px)',
            fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1,
            color: '#fff', margin: '0 0 14px',
          }}>This is what shows up in your dashboard every Monday.</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55, marginBottom: 24 }}>
            $297/mo flat. Unlimited calls answered. 5 fresh neighborhood leads delivered every Monday.
            30-day money-back guarantee. Cancel anytime.
          </p>
          <Link href="/pricing" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '17px 30px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%)',
            color: '#0B1F3A',
            fontWeight: 900, fontSize: 16,
            textDecoration: 'none',
            boxShadow: '0 14px 36px rgba(232,116,43,0.42)',
          }}>
            Get started — 30-day money back →
          </Link>
        </div>
      </section>
    </main>
  )
}

function StatBox({ num, lab, tone }: { num: string; lab: string; tone: 'teal' | 'money' }) {
  return (
    <div>
      <div style={{
        fontSize: 26, fontWeight: 900,
        background: tone === 'money'
          ? 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)'
          : 'linear-gradient(135deg, #5EEAD4, #14B8A6)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        letterSpacing: '-0.5px', lineHeight: 1.05,
      }}>{num}</div>
      <div style={{
        fontSize: 10.5, fontWeight: 700,
        color: 'rgba(255,255,255,0.55)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        marginTop: 4,
      }}>{lab}</div>
    </div>
  )
}

const thStyle = {
  textAlign: 'left' as const,
  padding: '12px 12px 8px',
  fontSize: 10, fontWeight: 800,
  letterSpacing: '0.12em', textTransform: 'uppercase' as const,
  color: 'rgba(94,234,212,0.85)',
  borderBottom: '1px solid rgba(94,234,212,0.14)',
}

const tdStyle = {
  padding: '14px 12px',
  fontSize: 12.5,
  color: 'rgba(255,255,255,0.85)',
  borderBottom: '1px solid rgba(94,234,212,0.07)',
  verticalAlign: 'top' as const,
}
