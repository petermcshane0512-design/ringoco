'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '28px 32px', marginBottom: 16 }
const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#0B1F3A', display: 'block', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }
const helpText: React.CSSProperties = { fontSize: 12, color: '#7AAAB2', marginTop: 6, lineHeight: 1.5 }

export default function ConciergeOnboarding() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    service_area_zips: '',
    competitor_place_ids: '',
    google_place_id: '',
    website_url: '',
    website_provider: 'wordpress',
    website_api_token: '',
    website_collection_id: '',
    growth_wallet_auto_topup_cents: 0,
  })

  async function save() {
    setSaving(true)
    const payload = {
      service_area_zips: form.service_area_zips.split(',').map(s => s.trim()).filter(Boolean),
      competitor_place_ids: form.competitor_place_ids.split(/[\n,]/).map(s => s.trim()).filter(Boolean),
      google_place_id: form.google_place_id.trim() || null,
      website_url: form.website_url.trim() || null,
      website_provider: form.website_provider,
      website_api_token: form.website_api_token.trim() || null,
      website_collection_id: form.website_collection_id.trim() || null,
      growth_wallet_auto_topup_cents: form.growth_wallet_auto_topup_cents,
      reactivation_enabled: true,
      weather_triggers_enabled: true,
      permits_enabled: true,
      competitor_watch_enabled: true,
    }
    const res = await fetch('/api/concierge/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      router.push('/dashboard/concierge')
    } else {
      const j = await res.json().catch(() => ({}))
      alert(`Save failed: ${j.error ?? 'unknown'}`)
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0AA89F', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>Elite Setup · Step {step} of 4</p>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8, letterSpacing: '-0.6px' }}>
        {step === 1 && 'Where do you serve?'}
        {step === 2 && 'Who are your top competitors?'}
        {step === 3 && 'Connect your website'}
        {step === 4 && 'Growth Wallet preferences'}
      </h1>
      <p style={{ fontSize: 15, color: '#64748B', marginBottom: 24 }}>
        {step === 1 && 'List the ZIP codes you actively serve. We watch permits + severe weather for these areas.'}
        {step === 2 && 'Paste Google Maps Place IDs for up to 5 competitors. We daily-track their reviews + ratings.'}
        {step === 3 && 'Optional. If you have a website, AI publishes one local SEO blog post per week. Skip if no website.'}
        {step === 4 && 'Optional. Pre-fund a monthly ad budget. AI generates creative + runs Google/Meta ads. 15% management fee.'}
      </p>

      {step === 1 && (
        <div style={card}>
          <label style={label}>Service area ZIP codes</label>
          <input style={input} placeholder="30301, 30302, 30303" value={form.service_area_zips} onChange={e => setForm({ ...form, service_area_zips: e.target.value })} />
          <p style={helpText}>Comma-separated. Up to 25 ZIPs. We use these for weather alerts + permit scans.</p>
        </div>
      )}

      {step === 2 && (
        <div style={card}>
          <label style={label}>Competitor Google Maps Place IDs</label>
          <textarea style={{ ...input, minHeight: 120, resize: 'vertical' }} placeholder={'ChIJN1t_tDeuEmsRUsoyG83frY4\nChIJVXealLU_xkcRja_At0z9AGY\n...'} value={form.competitor_place_ids} onChange={e => setForm({ ...form, competitor_place_ids: e.target.value })} />
          <p style={helpText}>One per line OR comma-separated. Find Place IDs at <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" style={{ color: '#0AA89F' }}>this tool</a>. Skip if you'd rather we find them for you.</p>
          <div style={{ height: 18 }} />
          <label style={label}>Your business's Google Place ID (optional)</label>
          <input style={input} placeholder="ChIJ..." value={form.google_place_id} onChange={e => setForm({ ...form, google_place_id: e.target.value })} />
          <p style={helpText}>Lets us pull your own reviews + ranking each week.</p>
        </div>
      )}

      {step === 3 && (
        <div style={card}>
          <label style={label}>Website URL</label>
          <input style={input} placeholder="https://yourcompany.com" value={form.website_url} onChange={e => setForm({ ...form, website_url: e.target.value })} />
          <div style={{ height: 14 }} />
          <label style={label}>Platform</label>
          <select style={{ ...input, height: 42 }} value={form.website_provider} onChange={e => setForm({ ...form, website_provider: e.target.value })}>
            <option value="wordpress">WordPress</option>
            <option value="webflow">Webflow</option>
            <option value="other">Other / manual publish</option>
          </select>
          <div style={{ height: 14 }} />
          <label style={label}>API token / app password</label>
          <input style={input} type="password" placeholder="Base64-encoded user:apppassword for WP" value={form.website_api_token} onChange={e => setForm({ ...form, website_api_token: e.target.value })} />
          <p style={helpText}>WordPress: <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noopener noreferrer" style={{ color: '#0AA89F' }}>create an Application Password</a>, then base64-encode <code>username:password</code>. Webflow: Site Settings → Apps & Integrations → Generate API token (cms:write scope). Stored encrypted at rest.</p>
          {form.website_provider === 'webflow' && (
            <>
              <div style={{ height: 14 }} />
              <label style={label}>Webflow CMS Collection ID</label>
              <input style={input} placeholder="68a1c5b2e3f4..." value={form.website_collection_id} onChange={e => setForm({ ...form, website_collection_id: e.target.value })} />
              <p style={helpText}>Required for Webflow only. Find it at Webflow Designer → CMS → your blog collection → Settings → Collection ID. We post weekly SEO articles into this collection.</p>
            </>
          )}
        </div>
      )}

      {step === 4 && (
        <div style={card}>
          <label style={label}>Monthly auto-replenish amount (Growth Wallet)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[0, 100000, 250000, 500000].map(cents => (
              <button key={cents} onClick={() => setForm({ ...form, growth_wallet_auto_topup_cents: cents })} style={{ padding: '14px 10px', border: form.growth_wallet_auto_topup_cents === cents ? '2px solid #0AA89F' : '1.5px solid #E2E8F0', borderRadius: 10, background: form.growth_wallet_auto_topup_cents === cents ? '#F0FDFA' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#0B1F3A' }}>
                {cents === 0 ? 'Skip' : `$${(cents / 100).toLocaleString()}`}
              </button>
            ))}
          </div>
          <p style={helpText}>If your wallet drops to $0, we auto-charge this amount to keep ads running. 15% management fee added. You can change this anytime. Skip if you want manual control.</p>
          <div style={{ marginTop: 24, padding: '16px 18px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: '0 0 4px' }}>⚠️ Google Ads MCC + Meta Business Manager approvals required</p>
            <p style={{ fontSize: 12, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
              Live ad spend turns on once Google approves our Manager Account (3-7 biz days) + you approve our Business Manager request to your Meta Ad Account. Until then, AI continues to generate creatives — they wait in your approval queue.
            </p>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 24 }}>
        {step > 1 ? (
          <button onClick={() => setStep(step - 1)} style={{ padding: '12px 24px', border: '1.5px solid #E2E8F0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>← Back</button>
        ) : <div />}
        {step < 4 ? (
          <button onClick={() => setStep(step + 1)} style={{ padding: '12px 28px', background: 'linear-gradient(135deg,#0AA89F 0%,#0D8F87 100%)', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>Continue →</button>
        ) : (
          <button onClick={save} disabled={saving} style={{ padding: '12px 28px', background: saving ? '#94A3B8' : '#22C55E', color: '#fff', border: 'none', borderRadius: 10, cursor: saving ? 'wait' : 'pointer', fontWeight: 800, fontSize: 14 }}>{saving ? 'Saving...' : 'Finish setup ✓'}</button>
        )}
      </div>
    </div>
  )
}
