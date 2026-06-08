import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@supabase/supabase-js'
import HandRaiseCard from './HandRaiseCard'

export const metadata: Metadata = {
  title: 'Hand-Raisers — BellAveGo Admin',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'

type InstantlyLead = {
  id?: string
  email?: string
  company_name?: string
  email_open_count?: number
  email_click_count?: number
  email_reply_count?: number
  status?: number
}

type OutreachRow = {
  id: string
  email: string
  business_name: string | null
  owner_first_name: string | null
  owner_phone: string | null
  city: string | null
  state: string | null
  trade: string | null
  website_domain: string | null
  pushed_at: string | null
  hand_raise_followup_sent_at: string | null
  hand_raise_open_count_at_send: number | null
  hand_raise_followup_body: string | null
  call_attempted_at: string | null
  call_outcome: string | null
  notes: string | null
}

type Merged = {
  email: string
  business: string
  city: string | null
  state: string | null
  trade: string | null
  owner_first_name: string | null
  owner_phone: string | null
  website_domain: string | null
  opens: number
  clicks: number
  replies: number
  staged_email: string | null
  staged_at: string | null
  staged_open_count: number | null
  outreach_id: string | null
  call_attempted_at: string | null
  call_outcome: string | null
  notes: string | null
  hotness: number  // composite score for sort
}

async function fetchInstantlyLeads(): Promise<InstantlyLead[]> {
  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return []
  try {
    const r = await fetch('https://api.instantly.ai/api/v2/leads/list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_ids: [CAMPAIGN_ID], limit: 300 }),
      cache: 'no-store',
    })
    if (!r.ok) return []
    const j = await r.json()
    return (j.items || j.data || []) as InstantlyLead[]
  } catch {
    return []
  }
}

function hotnessScore(opens: number, clicks: number): number {
  return clicks * 100 + opens * 5
}

export default async function HandRaisesPage() {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/sign-in?redirect_url=/admin/hand-raises')

  const [instantlyLeads, outreachRows] = await Promise.all([
    fetchInstantlyLeads(),
    supabase
      .from('outreach_leads')
      .select('id, email, business_name, owner_first_name, owner_phone, city, state, trade, website_domain, pushed_at, hand_raise_followup_sent_at, hand_raise_open_count_at_send, hand_raise_followup_body, call_attempted_at, call_outcome, notes')
      .not('pushed_at', 'is', null)
      .order('pushed_at', { ascending: false })
      .limit(500)
      .then((r) => (r.data || []) as OutreachRow[]),
  ])

  // Map email → outreach row
  const outreachByEmail = new Map<string, OutreachRow>()
  for (const r of outreachRows) outreachByEmail.set(r.email.toLowerCase(), r)

  // Merge: anyone w/ ≥3 opens OR ≥1 click in Instantly OR staged followup in supabase
  const merged: Merged[] = []
  const seen = new Set<string>()

  for (const l of instantlyLeads) {
    const email = (l.email || '').toLowerCase()
    if (!email) continue
    const opens = l.email_open_count ?? 0
    const clicks = l.email_click_count ?? 0
    const replies = l.email_reply_count ?? 0
    // Skip replied — they're handled elsewhere
    if (replies > 0) continue
    const isHandRaiser = clicks >= 1 || opens >= 3
    if (!isHandRaiser) continue
    const o = outreachByEmail.get(email)
    merged.push({
      email,
      business: l.company_name || o?.business_name || email,
      city: o?.city ?? null,
      state: o?.state ?? null,
      trade: o?.trade ?? null,
      owner_first_name: o?.owner_first_name ?? null,
      owner_phone: o?.owner_phone ?? null,
      website_domain: o?.website_domain ?? null,
      opens, clicks, replies,
      staged_email: o?.hand_raise_followup_body ?? null,
      staged_at: o?.hand_raise_followup_sent_at ?? null,
      staged_open_count: o?.hand_raise_open_count_at_send ?? null,
      outreach_id: o?.id ?? null,
      call_attempted_at: o?.call_attempted_at ?? null,
      call_outcome: o?.call_outcome ?? null,
      notes: o?.notes ?? null,
      hotness: hotnessScore(opens, clicks),
    })
    seen.add(email)
  }

  // Also pull staged-but-not-in-current-Instantly-snapshot (cron may have written ahead of UI)
  for (const o of outreachRows) {
    if (!o.hand_raise_followup_sent_at) continue
    const email = o.email.toLowerCase()
    if (seen.has(email)) continue
    merged.push({
      email,
      business: o.business_name || email,
      city: o.city,
      state: o.state,
      trade: o.trade,
      owner_first_name: o.owner_first_name,
      owner_phone: o.owner_phone,
      website_domain: o.website_domain,
      opens: o.hand_raise_open_count_at_send ?? 0,
      clicks: 0,
      replies: 0,
      staged_email: o.hand_raise_followup_body,
      staged_at: o.hand_raise_followup_sent_at,
      staged_open_count: o.hand_raise_open_count_at_send,
      outreach_id: o.id,
      call_attempted_at: o.call_attempted_at,
      call_outcome: o.call_outcome,
      notes: o.notes,
      hotness: hotnessScore(o.hand_raise_open_count_at_send ?? 0, 0),
    })
  }

  merged.sort((a, b) => b.hotness - a.hotness)

  const uncalled = merged.filter((m) => !m.call_attempted_at)
  const called = merged.filter((m) => m.call_attempted_at)

  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      background: 'linear-gradient(180deg, #050E1F 0%, #0B1F3A 60%, #112C4A 100%)',
      color: '#fff',
      minHeight: '100vh',
    }}>
      <section style={{ padding: '36px 24px 20px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '5px 14px', borderRadius: 99,
          background: 'rgba(232,116,43,0.10)',
          border: '1px solid rgba(232,116,43,0.30)',
          fontSize: 10.5, fontWeight: 800, color: '#FF9D5A',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          marginBottom: 14,
        }}>🔥 Live · Hand-Raisers</div>
        <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
          Today&apos;s hand-raisers — call within the hour.
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', maxWidth: 720, margin: 0 }}>
          Every prospect w/ ≥3 opens OR any link click. Sorted by hotness. Call from your phone, copy/send the staged Sonnet email, then mark called.
        </p>
      </section>

      <section style={{ padding: '0 24px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12,
          padding: '16px 20px',
          background: 'rgba(15,37,66,0.55)',
          border: '1px solid rgba(94,234,212,0.22)',
          borderRadius: 14,
        }}>
          <Stat label="Hand-raisers" value={merged.length} tone="teal" />
          <Stat label="Uncalled" value={uncalled.length} tone="money" hot />
          <Stat label="Called" value={called.length} tone="teal" />
          <Stat label="🔥 Clickers" value={merged.filter((m) => m.clicks > 0).length} tone="money" />
        </div>
      </section>

      <section style={{ padding: '0 24px 32px', maxWidth: 1180, margin: '0 auto' }}>
        <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#FF9D5A', marginBottom: 10 }}>
          ⚡ Call these now ({uncalled.length})
        </h2>
        {uncalled.length === 0 ? (
          <div style={{ padding: 28, borderRadius: 12, background: 'rgba(15,37,66,0.45)', border: '1px solid rgba(94,234,212,0.18)', color: 'rgba(255,255,255,0.55)', textAlign: 'center', fontSize: 13 }}>
            No uncalled hand-raisers right now. Check back in an hour.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {uncalled.map((m) => <HandRaiseCard key={m.email} lead={m} />)}
          </div>
        )}
      </section>

      {called.length > 0 && (
        <section style={{ padding: '0 24px 64px', maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 10 }}>
            ✓ Already called ({called.length})
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {called.map((m) => <HandRaiseCard key={m.email} lead={m} called />)}
          </div>
        </section>
      )}
    </main>
  )
}

function Stat({ label, value, tone, hot }: { label: string; value: number; tone: 'teal' | 'money'; hot?: boolean }) {
  return (
    <div style={hot ? { padding: '8px 12px', borderRadius: 10, background: 'rgba(232,116,43,0.10)', border: '1px solid rgba(232,116,43,0.30)' } : {}}>
      <div style={{
        fontSize: 24, fontWeight: 900,
        background: tone === 'money'
          ? 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)'
          : 'linear-gradient(135deg, #5EEAD4, #14B8A6)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        letterSpacing: '-0.5px', lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
    </div>
  )
}
