'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Report = { id: string; report_type: string; week_start: string; opened_at: string | null; created_at: string }
type Campaign = { id: string; platform: string; campaign_name: string; status: string; daily_budget_cents: number; spend_to_date_cents: number; impressions: number; clicks: number; conversions: number }
type Creative = { id: string; platform: string; headline: string; description: string; cta: string; status: string; created_at: string }
type Lead = { id: string; lead_source: string; customer_name: string; customer_phone: string; address: string; contacted_at: string | null; booked_job_id: string | null; created_at: string }
type Competitor = { competitor_name: string; rating: number; review_count: number; new_reviews_today: number; recent_review_themes: string[]; snapshot_date: string }
type WalletEntry = { id: string; kind: string; amount_cents: number; balance_after_cents: number; note: string; created_at: string }
type SeoPost = { id: string; title: string; target_query: string; published_url: string | null; status: string; created_at: string }

type DashboardData = {
  businessName: string
  reports: Report[]
  campaigns: Campaign[]
  creatives: Creative[]
  leads: Lead[]
  competitors: Competitor[]
  walletLedger: WalletEntry[]
  walletBalanceCents: number
  seoPosts: SeoPost[]
  settings: { onboarded_at?: string | null } | null
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14, padding: '24px 26px' }
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: '#0B1F3A', margin: '0 0 16px', letterSpacing: '-0.2px' }
const subText: React.CSSProperties = { fontSize: 12, color: '#64748B' }

export default function ConciergeDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/concierge/data')
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Failed to load')
        return j as DashboardData
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#64748B' }}>Loading your AI Marketing Ops...</div>
  if (error) return <div style={{ padding: 40, color: '#DC2626' }}>{error}</div>
  if (!data) return null

  const needsOnboarding = !data.settings?.onboarded_at

  if (needsOnboarding) {
    return (
      <div style={{ padding: 40, maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>Welcome to Concierge.</h1>
        <p style={{ fontSize: 16, color: '#64748B', marginBottom: 28 }}>
          Tell us about your service area, your competitors, and your website. Takes about 4 minutes. After that, our AI runs your marketing on autopilot — you just close the work.
        </p>
        <Link href="/dashboard/concierge/onboarding" style={{ display: 'inline-block', padding: '14px 28px', background: 'linear-gradient(135deg,#0AA89F 0%,#0D8F87 100%)', color: '#fff', fontWeight: 800, fontSize: 14, borderRadius: 10, textDecoration: 'none' }}>
          Start onboarding →
        </Link>
      </div>
    )
  }

  const liveCampaigns = data.campaigns.filter(c => c.status === 'active')
  const pendingCreatives = data.creatives.filter(c => c.status === 'pending_approval')
  const newLeads = data.leads.filter(l => !l.contacted_at)
  const bookedLeads = data.leads.filter(l => l.booked_job_id)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.6px' }}>AI Marketing Operations</h1>
          <p style={{ ...subText, marginTop: 4 }}>{data.businessName} · Concierge tier</p>
        </div>
        <Link href="/dashboard/concierge/onboarding" style={{ fontSize: 13, color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>Settings →</Link>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Live ad campaigns', value: liveCampaigns.length, accent: '#0AA89F' },
          { label: 'Pending creatives', value: pendingCreatives.length, accent: '#F59E0B' },
          { label: 'New leads (uncontacted)', value: newLeads.length, accent: '#3B82F6' },
          { label: 'Wallet balance', value: `$${(data.walletBalanceCents / 100).toFixed(0)}`, accent: '#22C55E' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '18px 22px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: s.accent, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>{s.label}</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#0B1F3A', margin: 0, letterSpacing: '-0.8px' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Weekly strategy reports */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h2 style={sectionTitle}>Weekly Strategy Reports</h2>
        {data.reports.length === 0 ? (
          <p style={subText}>Your first report will arrive Monday morning. AI is collecting baseline data.</p>
        ) : (
          <div>
            {data.reports.map((r, i) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#0B1F3A', margin: '0 0 2px' }}>Week of {r.week_start}</p>
                  <p style={subText}>{r.opened_at ? `Opened ${new Date(r.opened_at).toLocaleDateString()}` : 'Unread'}</p>
                </div>
                <Link href={`/r/${r.id}`} style={{ fontSize: 13, color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>Open →</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two-column: campaigns + leads */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <h2 style={sectionTitle}>Active Ad Campaigns</h2>
          {liveCampaigns.length === 0 ? (
            <p style={subText}>No active campaigns yet. Google Ads MCC + Meta Business Manager approvals pending. AI will spin up campaigns automatically once live.</p>
          ) : (
            liveCampaigns.map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{c.campaign_name}</p>
                  <p style={{ fontSize: 12, color: '#0AA89F', margin: 0, fontWeight: 600 }}>{c.platform}</p>
                </div>
                <p style={{ ...subText, marginTop: 4 }}>
                  Spent: ${(c.spend_to_date_cents / 100).toFixed(0)} · {c.impressions.toLocaleString()} impr · {c.clicks} clicks · {c.conversions} conv
                </p>
              </div>
            ))
          )}
        </div>
        <div style={card}>
          <h2 style={sectionTitle}>Lead Pipeline</h2>
          <p style={{ fontSize: 13, color: '#0B1F3A', margin: '0 0 12px' }}>{newLeads.length} new · {bookedLeads.length} booked this period</p>
          {data.leads.slice(0, 6).map(l => (
            <div key={l.id} style={{ padding: '8px 0', borderTop: '1px solid #F1F5F9', fontSize: 13 }}>
              <p style={{ fontWeight: 600, margin: 0 }}>{l.customer_name || l.customer_phone || 'Lead'}</p>
              <p style={subText}>{l.lead_source} · {l.booked_job_id ? '✓ Booked' : l.contacted_at ? 'Contacted' : 'New'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pending creatives */}
      {pendingCreatives.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={sectionTitle}>Ad Creatives Awaiting Approval ({pendingCreatives.length})</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {pendingCreatives.slice(0, 6).map(c => (
              <div key={c.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#0AA89F', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>{c.platform}</p>
                <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{c.headline}</p>
                <p style={{ ...subText, lineHeight: 1.4 }}>{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Competitor intel */}
      {data.competitors.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <h2 style={sectionTitle}>Competitor Intel</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {data.competitors.slice(0, 8).map((c, i) => (
              <div key={i} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{c.competitor_name}</p>
                <p style={subText}>⭐ {c.rating} · {c.review_count} reviews · {c.new_reviews_today > 0 ? `+${c.new_reviews_today} new` : 'no new'}</p>
                {c.recent_review_themes?.length > 0 && (
                  <p style={{ ...subText, marginTop: 4, fontStyle: 'italic' }}>Themes: {c.recent_review_themes.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SEO posts */}
      {data.seoPosts.length > 0 && (
        <div style={card}>
          <h2 style={sectionTitle}>SEO Blog Posts</h2>
          {data.seoPosts.map(p => (
            <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>{p.title}</p>
                <p style={subText}>Targeting "{p.target_query}" · {p.status}</p>
              </div>
              {p.published_url && (
                <a href={p.published_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#0AA89F', fontWeight: 700, textDecoration: 'none' }}>View →</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
