'use client'
import { useEffect, useState } from 'react'

type ReferralData = {
  code: string
  shareUrl: string
  count: number
  totalCreditDollars: number
}

/**
 * Referral widget for the dashboard settings page.
 *
 * Self-contained — fetches the contractor's code on mount via GET /api/referrals/me,
 * shows a copy-to-clipboard share link, total referrals, and total credit earned.
 * Free-month-per-referral system; copy emphasizes the unlimited + auto-credited
 * mechanics to drive sharing behavior.
 */
export default function ReferralWidget() {
  const [data, setData] = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<'link' | 'code' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/referrals/me')
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error)
        else setData(j as ReferralData)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  function copy(text: string, kind: 'link' | 'code') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind)
      setTimeout(() => setCopied(null), 1800)
    }).catch(() => {})
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF8F0 0%, #FFF1E2 100%)',
      border: '1px solid rgba(232,116,43,0.22)',
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 16,
      boxShadow: '0 4px 22px rgba(232,116,43,0.10)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid rgba(232,116,43,0.16)',
        background: 'rgba(255,255,255,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎁</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0B1F3A' }}>Refer a contractor, get a free month</div>
            <div style={{ fontSize: 11, color: '#7AAAB2', marginTop: 2 }}>Unlimited referrals · Credit auto-applies to your next bill</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '20px 18px' }}>
        {loading && <div style={{ fontSize: 13, color: '#7AAAB2' }}>Loading your referral code…</div>}
        {error && <div style={{ fontSize: 13, color: '#C84B26' }}>Couldn&apos;t load referral data: {error}</div>}
        {data && (
          <>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <Stat label="Referrals" value={`${data.count}`} accent="#0AA89F" />
              <Stat label="Credit earned" value={`$${data.totalCreditDollars}`} accent="#E8742B" />
            </div>

            {/* Share link */}
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4A7A80', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
              Your share link
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                readOnly
                value={data.shareUrl}
                style={{
                  flex: 1, background: '#fff',
                  border: '1.5px solid rgba(232,116,43,0.22)',
                  borderRadius: 8, padding: '10px 14px',
                  fontSize: 13, color: '#0B1F3A',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  outline: 'none',
                }}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => copy(data.shareUrl, 'link')}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: copied === 'link' ? '#22C55E' : 'linear-gradient(135deg, #FF9D5A, #E8742B)',
                  color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  boxShadow: '0 6px 18px rgba(232,116,43,0.32)',
                  transition: 'all 0.2s ease',
                }}
              >
                {copied === 'link' ? '✓ Copied' : 'Copy link'}
              </button>
            </div>

            {/* Code */}
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4A7A80', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' }}>
              Or just share the code
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <div style={{
                flex: 1, padding: '10px 14px', borderRadius: 8,
                background: '#fff', border: '1.5px solid rgba(232,116,43,0.22)',
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                fontSize: 15, fontWeight: 800, color: '#0B1F3A',
                letterSpacing: '0.1em',
              }}>
                {data.code}
              </div>
              <button
                onClick={() => copy(data.code, 'code')}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: '1.5px solid rgba(232,116,43,0.22)',
                  background: copied === 'code' ? '#22C55E' : '#fff',
                  color: copied === 'code' ? '#fff' : '#C84B26', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit', whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                }}
              >
                {copied === 'code' ? '✓ Copied' : 'Copy code'}
              </button>
            </div>

            {/* How it works */}
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(10,168,159,0.14)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0AA89F', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                How it works
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#3D5A62', lineHeight: 1.7 }}>
                <li>Share your link with another home-service contractor</li>
                <li>They sign up + pick a tier through your link</li>
                <li>The day their first payment clears, your next BellAveGo bill is on us</li>
              </ol>
              <p style={{ fontSize: 11, color: '#7AAAB2', marginTop: 10, marginBottom: 0, fontStyle: 'italic' }}>
                Credit equals your current monthly tier price. No cap on referrals. Credits apply automatically.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '14px 16px',
      border: '1px solid rgba(232,116,43,0.14)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#7AAAB2', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: accent, letterSpacing: '-0.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  )
}
