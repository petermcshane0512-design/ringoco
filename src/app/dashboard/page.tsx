'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

/**
 * /dashboard — 2026-06-09 LEADS-ONLY REWRITE.
 *
 * Old: 1244-line receptionist dashboard w/ call logs, missed calls,
 * Vapi assistant status, A2P 10DLC widgets, AI prompt editor.
 *
 * New: clean dark-theme leads dashboard.
 *  - This week's leads (count + value)
 *  - Auto-outreach status (X of Y emailed, Z replied)
 *  - Recent replies (hot list, top of fold)
 *  - Recent leads grid
 *  - Quick links: /dashboard/leads, settings, setup
 *
 * Routes through /dashboard/setup if onboarding not complete.
 */

type Profile = {
  user_id: string
  business_name?: string | null
  owner_first_name?: string | null
  setup_complete?: boolean | null
  first_lead_drop_at?: string | null
  outreach_prompt_template?: string | null
}

type LeadStub = {
  id: string
  street_address: string | null
  zip: string | null
  trade_match: string[] | null
  source: string | null
  lead_score: number | null
  source_event_date: string | null
}

type DashboardSummary = {
  ok: boolean
  this_week_count: number
  this_week_value_cents: number
  outreach_sent: number
  outreach_replied: number
  hot_replies: LeadStub[]
  recent_leads: LeadStub[]
}

export default function DashboardLeadsRoot() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { router.replace('/sign-in?redirect_url=/dashboard'); return }
    ;(async () => {
      try {
        const [p, s] = await Promise.all([
          fetch('/api/profile').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/dashboard/leads-summary').then((r) => (r.ok ? r.json() : null)),
        ])
        if (p) {
          setProfile(p)
          if (!p.setup_complete) {
            router.replace('/dashboard/setup')
            return
          }
        }
        if (s) setSummary(s)
      } catch { /* swallow */ }
      setLoading(false)
    })()
  }, [isLoaded, isSignedIn, router])

  if (loading || !isLoaded) {
    return (
      <main style={loadingStyle}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Loading…</div>
      </main>
    )
  }

  const tplGenerated = !!profile?.outreach_prompt_template

  return (
    <main style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 65%, #112C4A 100%)',
      color: '#fff',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <Nav profile={profile} />

      <section style={{ padding: '32px clamp(16px, 4vw, 40px)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 4 }}>
                {profile?.business_name || 'Your dashboard'}
              </div>
              <h1 style={{ fontSize: 'clamp(26px, 3.2vw, 36px)', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>
                {profile?.owner_first_name ? `Hey ${profile.owner_first_name} — ` : ''}This week&rsquo;s leads
              </h1>
            </div>
            <Link href="/dashboard/leads" style={ctaSecondary}>See all leads →</Link>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 14,
            padding: '20px 24px',
            background: 'linear-gradient(165deg, rgba(15,37,66,0.6) 0%, rgba(10,27,51,0.7) 100%)',
            border: '1px solid rgba(94,234,212,0.22)',
            borderRadius: 16,
            marginBottom: 24,
          }}>
            <Stat label="Fresh leads this week" value={String(summary?.this_week_count ?? 0)} tone="teal" />
            <Stat label="Pipeline value" value={dollars(summary?.this_week_value_cents ?? 0)} tone="money" />
            <Stat label="Auto-outreach sent" value={String(summary?.outreach_sent ?? 0)} tone="teal" />
            <Stat label="Homeowners replied" value={String(summary?.outreach_replied ?? 0)} tone="money" hot={(summary?.outreach_replied ?? 0) > 0} />
          </div>

          <div style={{
            padding: '20px 24px', borderRadius: 14,
            background: tplGenerated
              ? 'linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(15,37,66,0.5) 100%)'
              : 'linear-gradient(135deg, rgba(232,116,43,0.15) 0%, rgba(15,37,66,0.5) 100%)',
            border: tplGenerated ? '1px solid rgba(34,197,94,0.40)' : '1px solid rgba(232,116,43,0.40)',
            marginBottom: 24,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: tplGenerated ? '#22C55E' : '#FF9D5A', letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 4 }}>
                {tplGenerated ? '✓ AI Outreach · live' : '⚠ AI Outreach · not configured'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {tplGenerated
                  ? 'Every new lead gets a personalized email + SMS within 6 hrs of delivery.'
                  : 'Finish onboarding so we can write your outreach prompt and start contacting homeowners for you.'}
              </div>
            </div>
            <Link href={tplGenerated ? '/dashboard/settings/outreach' : '/dashboard/setup'} style={tplGenerated ? ctaSecondary : ctaPrimary}>
              {tplGenerated ? 'Edit template →' : 'Finish setup →'}
            </Link>
          </div>

          {summary && summary.hot_replies.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#FF9D5A', marginBottom: 10 }}>
                🔥 Hot replies · call within the hour
              </h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {summary.hot_replies.map((l) => <LeadCard key={l.id} lead={l} hot />)}
              </div>
            </section>
          )}

          <section>
            <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 10 }}>
              Recent leads
            </h2>
            {summary && summary.recent_leads.length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {summary.recent_leads.slice(0, 10).map((l) => <LeadCard key={l.id} lead={l} />)}
              </div>
            ) : (
              <div style={{
                padding: 28, textAlign: 'center', borderRadius: 14,
                background: 'rgba(15,37,66,0.45)',
                border: '1px dashed rgba(94,234,212,0.30)',
                color: 'rgba(255,255,255,0.65)',
                fontSize: 14,
              }}>
                {profile?.first_lead_drop_at
                  ? 'No leads delivered yet this week. Next drop fires Monday.'
                  : 'Your first lead drop arrives within 24 hrs of finishing onboarding. Sit tight.'}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

function Nav({ profile }: { profile: Profile | null }) {
  return (
    <nav style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '16px clamp(16px, 4vw, 40px)',
      background: 'rgba(5,14,31,0.85)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(94,234,212,0.18)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        <Image src="/logo.png" alt="BellAveGo" width={160} height={48} style={{ objectFit: 'contain' }} priority />
      </Link>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link href="/dashboard/leads" style={navLink}>Leads</Link>
        <Link href="/dashboard/settings/outreach" style={navLink}>Outreach</Link>
        <Link href="/dashboard/setup" style={navLink}>{profile?.setup_complete ? 'Settings' : 'Finish setup'}</Link>
      </div>
    </nav>
  )
}

function LeadCard({ lead, hot }: { lead: LeadStub; hot?: boolean }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 12,
      background: hot ? 'rgba(232,116,43,0.10)' : 'rgba(15,37,66,0.60)',
      border: hot ? '1.5px solid rgba(232,116,43,0.45)' : '1px solid rgba(94,234,212,0.18)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
          {lead.street_address || `ZIP ${lead.zip ?? '—'}`}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.60)', marginTop: 3 }}>
          {(lead.trade_match || []).join(' · ')} · {lead.source || 'lead'}
          {lead.source_event_date && ` · ${new Date(lead.source_event_date).toLocaleDateString()}`}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {typeof lead.lead_score === 'number' && (
          <div style={{ fontSize: 11, fontWeight: 800, color: '#5EEAD4', padding: '3px 8px', borderRadius: 6, background: 'rgba(94,234,212,0.15)' }}>
            {lead.lead_score}
          </div>
        )}
        <Link href={`/dashboard/leads/${lead.id}`} style={ctaTiny}>Open →</Link>
      </div>
    </div>
  )
}

function Stat({ label, value, tone, hot }: { label: string; value: string; tone: 'teal' | 'money'; hot?: boolean }) {
  return (
    <div style={hot ? { padding: '8px 12px', borderRadius: 10, background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.30)' } : {}}>
      <div style={{
        fontSize: 22, fontWeight: 900,
        background: tone === 'money'
          ? 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)'
          : 'linear-gradient(135deg, #5EEAD4, #14B8A6)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        letterSpacing: '-0.5px', lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
    </div>
  )
}

function dollars(cents: number): string {
  return ((cents ?? 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#050E1F',
  color: '#fff',
  fontFamily: "'Inter', system-ui, sans-serif",
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const navLink: React.CSSProperties = {
  color: 'rgba(255,255,255,0.75)', textDecoration: 'none',
  fontSize: 13, fontWeight: 700,
}

const ctaPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '11px 18px', borderRadius: 10,
  background: 'linear-gradient(135deg, #FF9D5A, #E8742B)',
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 900, fontSize: 13,
  boxShadow: '0 6px 18px rgba(232,116,43,0.42)',
}

const ctaSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 9,
  background: 'rgba(94,234,212,0.10)',
  border: '1px solid rgba(94,234,212,0.30)',
  color: '#5EEAD4', textDecoration: 'none',
  fontWeight: 800, fontSize: 12.5,
}

const ctaTiny: React.CSSProperties = {
  padding: '6px 11px', borderRadius: 7,
  background: '#5EEAD4',
  color: '#0B1F3A', textDecoration: 'none',
  fontWeight: 800, fontSize: 11.5,
}
