'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export default function WaitlistPage() {
  return (
    <Suspense fallback={null}>
      <WaitlistForm />
    </Suspense>
  )
}

function WaitlistForm() {
  const params = useSearchParams()
  const tierParam = params.get('tier')
  const [tier] = useState<'concierge' | 'multi_location'>(
    tierParam === 'multi_location' ? 'multi_location' : 'concierge',
  )

  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [zip, setZip] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [revenue, setRevenue] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tierLabel = tier === 'multi_location' ? 'Multi-Location' : 'Elite'
  const tierBlurb = tier === 'multi_location'
    ? 'Enterprise multi-location ($2,497/loc/mo + $25K setup). For franchises and 3+ location operators.'
    : 'Everything in Pro, plus: 24 AI lead reports/yr (bi-weekly), custom integrations into Jobber/Housecall Pro/ServiceTitan, 4-hour priority SLA, and direct founder access for the first 90 days. $597/mo — waitlist-only until we validate Pro with 3 paying customers.'

  useEffect(() => {
    document.title = `Join the ${tierLabel} waitlist · BellAveGo`
  }, [tierLabel])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/waitlist/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          business_name: businessName.trim(),
          phone: phone.trim(),
          business_type: businessType.trim(),
          zip_code: zip.trim(),
          team_size: teamSize,
          monthly_revenue: revenue,
          tier_interested: tier,
          notes: notes.trim(),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Something went wrong — text us at (773) 710-9565')
      } else {
        setSuccess(true)
      }
    } catch {
      setError('Network error — try again or text us at (773) 710-9565')
    }
    setSubmitting(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #F2F9F5 0%, #EBF7F3 100%)', fontFamily: "'Inter', system-ui, sans-serif", padding: '40px 20px 80px' }}>

      {/* Top nav (minimal) */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1100, margin: '0 auto 40px' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={665} height={210} style={{ height: 56, width: 'auto', objectFit: 'contain' }} />
        </Link>
        <Link href="/pricing" style={{ fontSize: 13, fontWeight: 700, color: '#0AA89F', textDecoration: 'none' }}>
          ← Back to pricing
        </Link>
      </nav>

      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        {success ? (
          <div style={{ background: '#fff', borderRadius: 22, padding: '40px 32px', textAlign: 'center', border: '1px solid rgba(10,168,159,0.18)', boxShadow: '0 20px 50px rgba(7,27,58,0.08)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #22C55E, #16A34A)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 28px rgba(34,197,94,0.42)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px', marginBottom: 12 }}>
              You&apos;re on the list.
            </h1>
            <p style={{ fontSize: 15, color: '#4A6670', lineHeight: 1.6, marginBottom: 22 }}>
              Our team will personally reach out within 24 hours to chat about your business and lock in early-access pricing for {tierLabel}.
            </p>
            <p style={{ fontSize: 13, color: '#7AAAB2', lineHeight: 1.55, marginBottom: 24 }}>
              In the meantime, want to see what BellAveGo can do today? Starter + Pro are available right now.
            </p>
            <Link href="/pricing" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 11, background: 'linear-gradient(135deg, #0AA89F 0%, #0D8F87 100%)', color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: '0 6px 18px rgba(10,168,159,0.32)' }}>
              See pricing →
            </Link>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(10,168,159,0.18)', boxShadow: '0 20px 50px rgba(7,27,58,0.08)' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)', padding: '28px 32px 24px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.92)', padding: '4px 11px', borderRadius: 99, fontSize: 10, fontWeight: 900, color: '#C84B26', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', animation: 'pulse 1.8s ease-in-out infinite' }} />
                Limited spots — Q3 2026 launch
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.7px', margin: '0 0 8px', lineHeight: 1.1 }}>
                Join the {tierLabel} waitlist
              </h1>
              <p style={{ fontSize: 14, color: 'rgba(11,31,58,0.78)', lineHeight: 1.55, margin: 0 }}>
                {tierBlurb}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={submit} style={{ padding: '24px 32px 28px' }}>
              <Field label="Email *" required value={email} onChange={setEmail} type="email" placeholder="you@yourbiz.com" />
              <Field label="Business name" value={businessName} onChange={setBusinessName} placeholder="Smith HVAC & Plumbing" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="(555) 000-0000" />
                <Field label="ZIP" value={zip} onChange={setZip} placeholder="60601" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <SelectField label="Trade" value={businessType} onChange={setBusinessType} options={[
                  ['', 'Select…'],
                  ['HVAC', 'HVAC'],
                  ['Plumbing', 'Plumbing'],
                  ['Electrical', 'Electrical'],
                  ['Roofing', 'Roofing'],
                  ['Multi-trade', 'Multi-trade'],
                  ['Other', 'Other'],
                ]} />
                <SelectField label="Team size" value={teamSize} onChange={setTeamSize} options={[
                  ['', 'Select…'],
                  ['1-5', '1–5'],
                  ['6-15', '6–15'],
                  ['16-50', '16–50'],
                  ['50+', '50+'],
                ]} />
              </div>
              <SelectField label="Monthly revenue (rough)" value={revenue} onChange={setRevenue} options={[
                ['', 'Select…'],
                ['under_50k',   'Under $50K'],
                ['50k_150k',    '$50K–$150K'],
                ['150k_500k',   '$150K–$500K'],
                ['500k_plus',   '$500K+'],
              ]} />
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Anything else? (optional — but helpful)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. We're a 3-location franchise. Already spending $4K/mo on Google Ads. Looking for full automation."
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.5 }}
                />
              </div>

              {error && (
                <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!email.trim() || submitting}
                style={{
                  width: '100%', padding: '14px', borderRadius: 11, border: 'none',
                  background: !email.trim() ? '#CBD5E1' : 'linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 50%, #E8742B 100%)',
                  color: !email.trim() ? '#fff' : '#0B1F3A',
                  fontSize: 15, fontWeight: 900,
                  cursor: !email.trim() || submitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', letterSpacing: '-0.1px',
                  boxShadow: !email.trim() ? 'none' : '0 10px 26px rgba(232,116,43,0.42)',
                }}
              >
                {submitting ? 'Submitting…' : `Reserve my ${tierLabel} spot →`}
              </button>

              <p style={{ marginTop: 14, fontSize: 11.5, color: '#7AAAB2', textAlign: 'center', lineHeight: 1.6 }}>
                Our team calls every waitlist signup personally within 24 hrs. No mass emails, no spam. Just a real conversation about your business.
              </p>
            </form>
          </div>
        )}
      </div>
    </main>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#7AAAB2',
  letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', borderRadius: 9,
  border: '1.5px solid rgba(10,168,159,0.2)', background: '#F5FDFB',
  fontSize: 14, color: '#0B1F3A', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

function Field({ label, value, onChange, type = 'text', placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}
