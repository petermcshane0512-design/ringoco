'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'
import { LEADS_PER_WEEK, PRICE_MONTHLY_USD } from '@/lib/offer'

/**
 * /dashboard/settings — 2026-06-10 lean dark rewrite per Peter ("settings
 * brings us to the old settings, gotta fix this").
 *
 * The prior 1,122-line page was receptionist-era: auto-booking windows,
 * calendar OAuth, AI voice tone, call-handling — none of which exist in
 * the leads-only product. Deleted (git history keeps it).
 *
 * A lead-gen customer needs to change exactly five things, plus billing
 * and sign-out. Matches the dark command-center aesthetic of the
 * dashboard + onboarding:
 *   - Business address (re-geocodes via /api/profile → re-aims the scan)
 *   - Service zip
 *   - Trade recipe
 *   - Delivery radius (0–20 mi cap)
 *   - Alert cell phone
 *
 * Saves through /api/profile (service-role; auto-geocodes business_address
 * on change). Billing opens the Stripe customer portal.
 */

type Profile = {
  business_name?: string | null
  owner_first_name?: string | null
  business_address?: string | null
  service_zips?: string[] | null
  service_radius_mi?: number | null
  business_type?: string | null
  services_offered?: string | null
  owner_phone?: string | null
  plan_tier?: string | null
}

const TRADES = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const

export default function SettingsPage() {
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [portalLoading, setPortalLoading] = useState(false)

  const [bizName, setBizName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [address, setAddress] = useState('')
  const [zip, setZip] = useState('')
  const [trade, setTrade] = useState('')
  const [otherTrade, setOtherTrade] = useState('')
  const [radius, setRadius] = useState(20)
  const [phone, setPhone] = useState('')
  const [tier, setTier] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((p: Profile) => {
        const bn = (p.business_name ?? '').trim()
        setBizName(bn.toLowerCase() === 'my business' ? '' : bn)
        setFirstName(p.owner_first_name ?? '')
        setAddress(p.business_address ?? '')
        setZip((p.service_zips?.[0] ?? '').toString())
        const bt = (p.business_type ?? '').toLowerCase()
        if ((TRADES as readonly string[]).includes(bt)) setTrade(bt)
        else if (bt) { setTrade('other'); setOtherTrade(bt) }
        setRadius(Math.max(0, Math.min(20, p.service_radius_mi ?? 20)))
        setPhone(p.owner_phone ?? '')
        setTier(p.plan_tier ?? null)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function save() {
    setErr('')
    const phoneDigits = phone.replace(/\D/g, '')
    if (bizName.trim().length < 2) return setErr('Enter your business name — the AI signs every outreach message with it.')
    if (address.trim().length < 8) return setErr('Enter your full business address.')
    if (!/^\d{5}$/.test(zip)) return setErr('Enter a 5-digit zip.')
    const resolvedTrade = trade === 'other' ? otherTrade.trim().toLowerCase() : trade
    if (!resolvedTrade) return setErr('Pick your trade.')
    if (phoneDigits.length < 10) return setErr('Enter a 10-digit cell number.')

    setSaving(true)
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: bizName.trim(),
          owner_first_name: firstName.trim() || undefined,
          business_address: address.trim(),
          service_zips: [zip],
          service_radius_mi: radius,
          business_type: resolvedTrade,
          services_offered: resolvedTrade,
          owner_phone: phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`,
        }),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || 'Save failed.'); return }
      setSavedAt(Date.now())
    } catch {
      setErr('Network error. Try again.')
    } finally {
      setSaving(false)
    }
  }

  async function openBilling() {
    setPortalLoading(true)
    try {
      const r = await fetch('/api/stripe/portal', { method: 'POST' })
      const j = await r.json()
      if (j.url) window.location.href = j.url
      else setErr('Could not open billing. Text 773-710-9565.')
    } catch {
      setErr('Could not open billing.')
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #060D18 0%, #0B1F3A 60%, #081B26 100%)',
      fontFamily: "'Inter', system-ui, sans-serif",
      color: '#E6FFFA',
      paddingBottom: 60,
    }}>
      {/* Command bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(6,13,24,0.88)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(94,234,212,0.14)',
        padding: '12px clamp(14px, 3vw, 28px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/dashboard/leads" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontSize: 13, color: '#5EEAD4', fontWeight: 800, fontFamily: 'ui-monospace, monospace' }}>← command center</span>
        </Link>
        <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: '0.16em', color: '#5EEAD4', textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace' }}>
          ⚙ Settings
        </span>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px clamp(14px, 3vw, 28px) 0' }}>
        <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, letterSpacing: '-0.03em', margin: '0 0 6px', color: '#F0FDFA' }}>
          Re-aim your scan
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(230,255,250,0.5)', margin: '0 0 22px', lineHeight: 1.55 }}>
          Change any of these and your next sweep retargets around the new address. {LEADS_PER_WEEK} leads/week stays the same.
        </p>

        {!loaded ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(94,234,212,0.5)', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            ▸ loading…
          </div>
        ) : (
          <div style={panel}>
            <Field label="Business name">
              <input value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Mike's HVAC & Plumbing" style={darkInput} />
              <Hint>The AI signs every outreach message as this — homeowners see your shop, never &ldquo;BellAveGo.&rdquo;</Hint>
            </Field>

            <Field label="Your first name (optional)" mt>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mike" style={darkInput} autoComplete="given-name" />
              <Hint>If set, messages sign with your name; otherwise they sign with the business name.</Hint>
            </Field>

            <Field label="Business address" mt>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Chicago, IL 60643" style={darkInput} autoComplete="street-address" />
              <Hint>Leads pull from rings around this exact point — re-geocoded on save.</Hint>
            </Field>

            <Field label="Service zip" mt>
              <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="60643" inputMode="numeric" maxLength={5} style={darkInput} />
            </Field>

            <Field label="Trade recipe" mt>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8 }}>
                {TRADES.map((t) => (
                  <button key={t} type="button" onClick={() => setTrade(t)} style={tradeBtn(trade === t)}>{t}</button>
                ))}
                <button type="button" onClick={() => setTrade('other')} style={tradeBtn(trade === 'other')}>Other</button>
              </div>
              {trade === 'other' && (
                <input value={otherTrade} onChange={(e) => setOtherTrade(e.target.value.slice(0, 40))} placeholder="e.g. landscaping" style={{ ...darkInput, marginTop: 10 }} />
              )}
            </Field>

            <Field label={`Delivery radius — ${radius} mi`} mt>
              <input type="range" min={0} max={20} step={1} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10))} style={{ width: '100%', accentColor: '#34D399' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(94,234,212,0.45)', fontFamily: 'ui-monospace, monospace' }}>
                <span>0 mi (tightest)</span><span>20 mi (max)</span>
              </div>
              <Hint>Engine starts at 1 mi and only widens to this cap when nearby supply runs low.</Hint>
            </Field>

            <Field label="Alert cell phone" mt>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(773) 555-0100" inputMode="tel" style={darkInput} autoComplete="tel" />
              <Hint>We text this the second a homeowner shows real interest.</Hint>
            </Field>

            {err && <p style={{ fontSize: 12.5, color: '#FCA5A5', margin: '14px 0 0', fontWeight: 700 }}>⚠ {err}</p>}

            <button onClick={save} disabled={saving} style={{
              marginTop: 18, width: '100%', padding: '14px 18px', borderRadius: 12,
              background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #34D399, #0D9488)',
              color: saving ? 'rgba(230,255,250,0.5)' : '#06241C', fontWeight: 900, fontSize: 14,
              border: 'none', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit',
              boxShadow: saving ? 'none' : '0 10px 26px rgba(52,211,153,0.30)',
            }}>
              {saving ? '▸ saving…' : savedAt ? '✓ Saved — retargets next sweep' : 'Save changes'}
            </button>
          </div>
        )}

        {/* Plan + billing */}
        <div style={{ ...panel, marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'ui-monospace, monospace' }}>
            Plan + billing
          </div>
          <div style={{ fontSize: 14, color: '#F0FDFA', fontWeight: 800, marginBottom: 2 }}>
            {tier === 'officemgr' ? 'Pro' : tier === 'concierge' ? 'Elite' : tier === 'receptionist' ? 'Starter' : (tier ?? 'No active plan')} · {LEADS_PER_WEEK} leads/week
          </div>
          <div style={{ fontSize: 12, color: 'rgba(230,255,250,0.45)', marginBottom: 14 }}>${PRICE_MONTHLY_USD}/mo · cancel anytime</div>
          <button onClick={openBilling} disabled={portalLoading} style={{
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(94,234,212,0.25)',
            color: '#A7F3D0', fontWeight: 800, fontSize: 13, cursor: portalLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
          }}>
            {portalLoading ? '▸ opening…' : '💳 Manage billing / cancel'}
          </button>
        </div>

        {/* Account */}
        <div style={{ ...panel, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'rgba(230,255,250,0.45)' }}>Need help? Text Peter at <a href="tel:+17737109565" style={{ color: '#5EEAD4', fontWeight: 800, textDecoration: 'none' }}>(773) 710-9565</a></div>
          <SignOutButton>
            <button style={{
              padding: '9px 16px', borderRadius: 9,
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
              color: '#FCA5A5', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
            }}>Sign out</button>
          </SignOutButton>
        </div>
      </div>

      <style>{`input::placeholder { color: rgba(230,255,250,0.25); }`}</style>
    </main>
  )
}

function Field({ label, mt, children }: { label: string; mt?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: mt ? 16 : 0 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 900, color: 'rgba(230,255,250,0.6)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 10.5, color: 'rgba(230,255,250,0.35)', margin: '6px 0 0', lineHeight: 1.5 }}>{children}</p>
}

const panel: React.CSSProperties = {
  padding: 'clamp(16px, 3vw, 22px)', borderRadius: 16,
  background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(94,234,212,0.16)',
}
const darkInput: React.CSSProperties = {
  width: '100%', padding: '13px 15px', borderRadius: 10,
  border: '1px solid rgba(94,234,212,0.2)', background: 'rgba(2,8,16,0.6)',
  fontSize: 15, fontWeight: 600, fontFamily: 'inherit', color: '#F0FDFA',
  boxSizing: 'border-box', outline: 'none',
}
function tradeBtn(active: boolean): React.CSSProperties {
  return {
    padding: '11px 12px', borderRadius: 10,
    border: active ? '1.5px solid #34D399' : '1px solid rgba(94,234,212,0.18)',
    background: active ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
    fontWeight: 800, fontSize: 13, cursor: 'pointer',
    color: active ? '#34D399' : 'rgba(230,255,250,0.65)',
    textTransform: 'capitalize', fontFamily: 'inherit',
  }
}
