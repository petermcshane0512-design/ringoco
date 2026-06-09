'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

/**
 * /dashboard/settings/outreach
 *
 * 2026-06-09 LEADS-ONLY PIVOT.
 *
 * Lets the contractor view + regenerate the AI outreach prompt template
 * that gets merged for every delivered lead. The template was first
 * written at the end of /dashboard/setup by Sonnet from their onboarding
 * data. This page lets them:
 *   - See the current email subject / body / SMS template
 *   - Regenerate (re-run Sonnet w/ current profile data — useful after
 *     they update value props or tone in /dashboard/settings)
 *   - Preview merged version w/ sample lead data
 */

type Template = {
  email_subject?: string
  email_body?: string
  sms?: string
  generated_at?: string
  tone?: string
}

const SAMPLE = {
  lead_first_name: 'Mike',
  lead_address: '7842 Oak Ridge Dr',
  lead_zip: '75024',
  lead_signal: 'permit filed: AC condenser replacement',
}

function merge(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '')
}

export default function OutreachSettingsPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const [tpl, setTpl] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { router.replace('/sign-in?redirect_url=/dashboard/settings/outreach'); return }
    ;(async () => {
      try {
        const r = await fetch('/api/leads/generate-outreach-prompt')
        if (r.ok) {
          const j = await r.json()
          if (j.template) setTpl(j.template)
        }
      } catch { /* */ }
      setLoading(false)
    })()
  }, [isLoaded, isSignedIn, router])

  async function regenerate() {
    setRegenerating(true); setError(null); setSuccess(null)
    try {
      const r = await fetch('/api/leads/generate-outreach-prompt', { method: 'POST' })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        setError(j.error || 'failed')
      } else {
        setSuccess('Template regenerated.')
        // Refetch latest
        const r2 = await fetch('/api/leads/generate-outreach-prompt')
        if (r2.ok) {
          const j2 = await r2.json()
          if (j2.template) setTpl(j2.template)
        }
      }
    } catch (e) { setError((e as Error).message) }
    setRegenerating(false)
  }

  if (loading) {
    return <main style={loadingStyle}><div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Loading…</div></main>
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 65%, #112C4A 100%)',
      color: '#fff',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <nav style={navStyle}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo.png" alt="BellAveGo" width={160} height={48} style={{ objectFit: 'contain' }} priority />
        </Link>
        <div style={{ display: 'flex', gap: 16 }}>
          <Link href="/dashboard/leads" style={navLink}>Leads</Link>
          <Link href="/dashboard/settings/outreach" style={{ ...navLink, color: '#5EEAD4' }}>Outreach</Link>
          <Link href="/dashboard/setup" style={navLink}>Settings</Link>
        </div>
      </nav>

      <section style={{ padding: '32px clamp(16px, 4vw, 40px)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ marginBottom: 8 }}>
            <Link href="/dashboard" style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>← Dashboard</Link>
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.03em' }}>
            AI Outreach Template
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 24, lineHeight: 1.55 }}>
            Every fresh lead delivered to your dashboard gets this email + SMS sent within 6 hours, automatically, signed by you. Merge tags <code style={codeStyle}>{'{{lead_first_name}}'}</code>, <code style={codeStyle}>{'{{lead_address}}'}</code>, <code style={codeStyle}>{'{{lead_signal}}'}</code>, and <code style={codeStyle}>{'{{lead_zip}}'}</code> get replaced with the actual homeowner&rsquo;s info at send time.
          </p>

          {!tpl && (
            <div style={{ padding: 24, borderRadius: 14, background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.30)', marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FF9D5A', marginBottom: 8 }}>⚠ Template not yet generated</div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: '0 0 14px', lineHeight: 1.55 }}>
                Finish onboarding so we have your business details, then click below to write your outreach template.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <Link href="/dashboard/setup" style={ctaSecondary}>Finish setup →</Link>
                <button onClick={regenerate} disabled={regenerating} style={ctaPrimary}>
                  {regenerating ? 'Generating…' : '✨ Generate now'}
                </button>
              </div>
            </div>
          )}

          {tpl && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                <button onClick={regenerate} disabled={regenerating} style={ctaPrimary}>
                  {regenerating ? 'Regenerating…' : '✨ Regenerate template'}
                </button>
                <button onClick={() => setShowPreview(!showPreview)} style={ctaSecondary}>
                  {showPreview ? 'Show raw template (with merge tags)' : 'Show preview (sample lead)'}
                </button>
                {tpl.generated_at && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginLeft: 'auto' }}>
                    Last generated {new Date(tpl.generated_at).toLocaleString()}
                  </span>
                )}
              </div>

              {success && <Banner type="success">{success}</Banner>}
              {error && <Banner type="error">{error}</Banner>}

              <Section title="Email Subject">
                <div style={previewBox}>
                  {showPreview ? merge(tpl.email_subject || '', SAMPLE) : tpl.email_subject}
                </div>
              </Section>

              <Section title="Email Body">
                <div style={{ ...previewBox, whiteSpace: 'pre-wrap' }}>
                  {showPreview ? merge(tpl.email_body || '', SAMPLE) : tpl.email_body}
                </div>
              </Section>

              <Section title="SMS">
                <div style={{ ...previewBox, fontStyle: 'italic' }}>
                  {showPreview ? merge(tpl.sms || '', SAMPLE) : tpl.sms}
                </div>
              </Section>

              {showPreview && (
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(94,234,212,0.08)', border: '1px dashed rgba(94,234,212,0.30)', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                  Preview shown above merges with sample homeowner: <strong style={{ color: '#5EEAD4' }}>{SAMPLE.lead_first_name}</strong>, at <strong style={{ color: '#5EEAD4' }}>{SAMPLE.lead_address}</strong>, signal: <strong style={{ color: '#5EEAD4' }}>{SAMPLE.lead_signal}</strong>.
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Banner({ type, children }: { type: 'success' | 'error'; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10, marginBottom: 14,
      background: type === 'success' ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
      border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)'}`,
      color: type === 'success' ? '#22C55E' : '#FCA5A5',
      fontSize: 13, fontWeight: 700,
    }}>
      {children}
    </div>
  )
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh', background: '#050E1F', color: '#fff',
  fontFamily: "'Inter', system-ui, sans-serif",
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const navStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '16px clamp(16px, 4vw, 40px)',
  background: 'rgba(5,14,31,0.85)', backdropFilter: 'blur(10px)',
  borderBottom: '1px solid rgba(94,234,212,0.18)',
  position: 'sticky', top: 0, zIndex: 50,
}

const navLink: React.CSSProperties = { color: 'rgba(255,255,255,0.75)', textDecoration: 'none', fontSize: 13, fontWeight: 700 }

const previewBox: React.CSSProperties = {
  padding: '14px 16px', borderRadius: 11,
  background: 'rgba(15,37,66,0.55)',
  border: '1px solid rgba(94,234,212,0.18)',
  fontSize: 13.5, lineHeight: 1.6,
  color: 'rgba(255,255,255,0.92)',
  fontFamily: "'Inter', system-ui, sans-serif",
}

const codeStyle: React.CSSProperties = {
  padding: '1px 6px', borderRadius: 5,
  background: 'rgba(94,234,212,0.12)', color: '#5EEAD4',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 11.5,
}

const ctaPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '11px 18px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
  color: '#0B1F3A', border: 'none', textDecoration: 'none',
  fontWeight: 900, fontSize: 13, cursor: 'pointer',
  boxShadow: '0 6px 18px rgba(232,116,43,0.42)',
}

const ctaSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '11px 16px', borderRadius: 10,
  background: 'rgba(94,234,212,0.10)',
  border: '1px solid rgba(94,234,212,0.30)',
  color: '#5EEAD4', textDecoration: 'none',
  fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
}
