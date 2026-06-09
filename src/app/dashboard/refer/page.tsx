'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * /dashboard/refer
 *
 * Customer-to-customer referral page. Each paying customer gets a
 * unique BAVG-XXXXXX code → when their HVAC buddy signs up + pays
 * month 1, the referrer earns 1 month free + the buddy gets 14-day
 * $1 trial.
 *
 * This is the engine that pushes the business from bear → mid → bull
 * outcome by Dec 25.
 */

type Referral = {
  business_name: string | null
  signed_up_at: string
  paid: boolean
  tier: string | null
}

type ReferralData = {
  referral_code: string
  referral_link: string
  business_name: string | null
  total_referred: number
  paid_referrals_count: number
  pending_referrals_count: number
  earned_free_months_count: number
  referrals: Referral[]
}

export default function ReferPage() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/my-referrals')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function copyLink() {
    if (!data) return
    await navigator.clipboard.writeText(data.referral_link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function shareSMS() {
    if (!data) return
    const text = `Yo — I've been using BellAveGo (exclusive homeowner leads delivered Monday + AI lead outreach that reaches out to homeowners for me). Honest game-changer. Free 14-day trial w/ my link: ${data.referral_link}`
    window.location.href = `sms:?body=${encodeURIComponent(text)}`
  }

  if (loading) return <main style={shell}><div style={loadingBox}>Loading…</div></main>
  if (!data) return <main style={shell}><div style={loadingBox}>No referral data yet. Email peter@bellavego.com.</div></main>

  return (
    <main style={shell}>
      <Link href="/dashboard" style={backLink}>← Dashboard</Link>

      <header style={{
        marginTop: 14,
        marginBottom: 22,
        padding: '28px 32px',
        background: 'linear-gradient(135deg, #0B1F3A 0%, #163356 60%, #0D8F87 100%)',
        borderRadius: 20,
        color: '#fff',
        boxShadow: '0 14px 40px rgba(7,27,58,0.22)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>
          💰 Refer a friend · Earn free months
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.5px', margin: '0 0 8px' }}>
          Send your HVAC buddies. Get free BellAveGo.
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.55, margin: 0 }}>
          Every buddy who signs up + pays = <strong style={{ color: '#5EEAD4' }}>1 month free for you</strong>.
          They get 14-day $1 trial. Win/win.
        </p>
      </header>

      {/* Referral link box */}
      <section style={card}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Your referral link
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px',
          background: '#F5FDFB',
          border: '1.5px solid rgba(10,168,159,0.2)',
          borderRadius: 12,
          marginBottom: 12,
        }}>
          <code style={{ flex: 1, fontSize: 14, color: '#0B1F3A', fontWeight: 700, overflow: 'auto' }}>
            {data.referral_link}
          </code>
          <button onClick={copyLink} style={{
            padding: '8px 16px', background: copied ? '#22C55E' : '#0AA89F',
            color: '#fff', border: 'none', borderRadius: 8,
            fontWeight: 800, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
            {copied ? '✓ Copied' : 'Copy link'}
          </button>
        </div>
        <button onClick={shareSMS} style={{
          width: '100%', padding: '12px',
          background: '#fff', color: '#0AA89F',
          border: '1.5px solid #0AA89F', borderRadius: 10,
          fontWeight: 800, fontSize: 13, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          💬 Send via text message
        </button>
      </section>

      {/* Stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 14 }}>
        <Stat label="Referrals sent" value={data.total_referred} accent="#0B1F3A" />
        <Stat label="Paid + earning you 💰" value={data.paid_referrals_count} accent="#22C55E" />
        <Stat label="Pending (trial)" value={data.pending_referrals_count} accent="#F59E0B" />
        <Stat label="Free months earned" value={data.earned_free_months_count} accent="#7C3AED" />
      </section>

      {/* How it works */}
      <section style={{ ...card, marginTop: 14 }}>
        <h2 style={h2}>How it works</h2>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#0B1F3A', lineHeight: 1.7 }}>
          <li>Share your link with HVAC / plumbing / electrical / roofing buddies</li>
          <li>They sign up via your link → get 14-day $1 trial (no full price upfront)</li>
          <li>When they pay their first month → <strong style={{ color: '#22C55E' }}>you get 1 month free</strong> (applied to your next invoice)</li>
          <li>No cap. Refer 12 friends = full year of BellAveGo free.</li>
        </ol>
      </section>

      {/* Referral list */}
      {data.referrals.length > 0 && (
        <section style={{ ...card, marginTop: 14 }}>
          <h2 style={h2}>Your referrals</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.referrals.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 14px', background: '#F5FDFB',
                borderRadius: 8, fontSize: 13,
              }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0B1F3A' }}>{r.business_name || '(unnamed shop)'}</div>
                  <div style={{ fontSize: 11, color: '#7AAAB2' }}>
                    Signed up {new Date(r.signed_up_at).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 99,
                  background: r.paid ? '#22C55E' : '#F59E0B',
                  color: '#fff',
                }}>
                  {r.paid ? '💰 PAID — Earned you 1 mo free' : '⏳ In trial'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{
      background: '#fff', padding: '14px 16px', borderRadius: 12,
      border: '1px solid rgba(10,168,159,0.14)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#7AAAB2', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  )
}

const shell: React.CSSProperties = {
  maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px',
  fontFamily: "'Inter', system-ui, sans-serif",
  background: '#F5FCFA', minHeight: '100vh',
}
const backLink: React.CSSProperties = {
  fontSize: 12, color: '#0AA89F', fontWeight: 700, textDecoration: 'none',
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: '20px 22px',
  border: '1px solid rgba(10,168,159,0.14)',
  boxShadow: '0 4px 16px rgba(7,27,58,0.05)',
}
const h2: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: '#0AA89F',
  letterSpacing: '0.08em', textTransform: 'uppercase',
  margin: '0 0 12px',
}
const loadingBox: React.CSSProperties = {
  padding: 60, textAlign: 'center', color: '#7AAAB2',
}
