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
  status_summary?: {
    lastStep?: { from?: string; stepID?: string; timestamp_executed?: string }
  }
  timestamp_last_contact?: string
  timestamp_last_open?: string
  timestamp_last_click?: string
}

type CampaignTodayStats = {
  sent: number
  contacted: number
  opens: number
  unique_opens: number
  clicks: number
  unique_clicks: number
  replies: number
  bounces: number
  unsubs: number
}

async function fetchCampaignTodayStats(): Promise<CampaignTodayStats | null> {
  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return null
  try {
    const r = await fetch(`https://api.instantly.ai/api/v2/campaigns/analytics/daily?campaign_id=${CAMPAIGN_ID}`, {
      headers: { Authorization: `Bearer ${KEY}` },
      cache: 'no-store',
    })
    if (!r.ok) return null
    const j = await r.json()
    const today = (Array.isArray(j) ? j : []).find((d: { date?: string }) => d.date === new Date().toISOString().slice(0, 10)) || (Array.isArray(j) ? j[0] : null)
    if (!today) return null
    return {
      sent: today.sent ?? 0,
      contacted: today.contacted ?? today.new_leads_contacted ?? 0,
      opens: today.opened ?? 0,
      unique_opens: today.unique_opened ?? 0,
      clicks: today.clicks ?? 0,
      unique_clicks: today.unique_clicks ?? 0,
      replies: today.replies ?? 0,
      bounces: today.bounced ?? 0,
      unsubs: today.unsubscribed ?? 0,
    }
  } catch {
    return null
  }
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
  step_id: string | null              // e.g. "0_1_0" = step 0, variant 0
  step_label: string | null           // "Step 0 (hook)" | "Step 1 (bump)" | "Step 2 (closer)"
  last_contact_at: string | null
  last_open_at: string | null
  last_click_at: string | null
  staged_email: string | null
  staged_at: string | null
  staged_open_count: number | null
  outreach_id: string | null
  pushed_at: string | null
  call_attempted_at: string | null
  call_outcome: string | null
  notes: string | null
  hotness: number  // composite score for sort
}

function stepLabel(stepID: string | undefined): string | null {
  if (!stepID) return null
  const step = stepID.split('_')[0]
  if (step === '0') return 'Step 0 · hook'
  if (step === '1') return 'Step 1 · bump'
  if (step === '2') return 'Step 2 · closer'
  return `Step ${step}`
}

type LeadWithCampaign = InstantlyLead & { campaign?: string }

async function fetchInstantlyLeads(): Promise<InstantlyLead[]> {
  const KEY = process.env.INSTANTLY_API_KEY
  if (!KEY) return []
  // Paginate w/ small limit to avoid Instantly rate-limit. No server-side
  // filter (campaign_ids param is unreliable — returns 0 intermittently).
  // Pull up to 500 leads, filter by lead.campaign client-side.
  const all: LeadWithCampaign[] = []
  let cursor: string | undefined
  for (let page = 0; page < 10; page++) {
    try {
      const body: Record<string, unknown> = { limit: 100 }
      if (cursor) body.starting_after = cursor
      const r = await fetch('https://api.instantly.ai/api/v2/leads/list', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      if (!r.ok) break
      const j = await r.json()
      const items = (j.items || j.data || []) as LeadWithCampaign[]
      all.push(...items)
      // Instantly returns the next page token in `next_starting_after`.
      // Stop when token absent (end of list).
      cursor = j.next_starting_after as string | undefined
      if (!cursor) break
    } catch {
      break
    }
  }
  return all.filter((l) => l.campaign === CAMPAIGN_ID)
}

function hotnessScore(opens: number, clicks: number): number {
  return clicks * 100 + opens * 5
}

export default async function HandRaisesPage() {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/sign-in?redirect_url=/admin/hand-raises')

  const [instantlyLeads, outreachRows, todayStats] = await Promise.all([
    fetchInstantlyLeads(),
    supabase
      .from('outreach_leads')
      .select('id, email, business_name, owner_first_name, owner_phone, city, state, trade, website_domain, pushed_at, hand_raise_followup_sent_at, hand_raise_open_count_at_send, hand_raise_followup_body, call_attempted_at, call_outcome, notes')
      .not('pushed_at', 'is', null)
      .order('pushed_at', { ascending: false })
      .limit(500)
      .then((r) => (r.data || []) as OutreachRow[]),
    fetchCampaignTodayStats(),
  ])

  // Overall campaign totals (lifetime — sums of email_*_count from leads)
  const totalLeadsInCampaign = instantlyLeads.length
  const lifetimeOpens = instantlyLeads.reduce((s, l) => s + (l.email_open_count ?? 0), 0)
  const lifetimeClicks = instantlyLeads.reduce((s, l) => s + (l.email_click_count ?? 0), 0)
  const lifetimeReplies = instantlyLeads.reduce((s, l) => s + (l.email_reply_count ?? 0), 0)
  const uniqueOpenersLifetime = instantlyLeads.filter((l) => (l.email_open_count ?? 0) > 0).length
  const uniqueClickersLifetime = instantlyLeads.filter((l) => (l.email_click_count ?? 0) > 0).length

  // Map email → outreach row
  const outreachByEmail = new Map<string, OutreachRow>()
  for (const r of outreachRows) outreachByEmail.set(r.email.toLowerCase(), r)

  // Build merged collection for hand-raisers AND warming-up tier
  const handRaisers: Merged[] = []
  const warmingUp: Merged[] = []  // 1-2 opens, no click, no reply
  const seen = new Set<string>()

  for (const l of instantlyLeads) {
    const email = (l.email || '').toLowerCase()
    if (!email) continue
    const opens = l.email_open_count ?? 0
    const clicks = l.email_click_count ?? 0
    const replies = l.email_reply_count ?? 0
    if (replies > 0) continue  // replied = handled elsewhere
    if (opens === 0 && clicks === 0) continue  // not engaged at all

    const o = outreachByEmail.get(email)
    const row: Merged = {
      email,
      business: l.company_name || o?.business_name || email,
      city: o?.city ?? null,
      state: o?.state ?? null,
      trade: o?.trade ?? null,
      owner_first_name: o?.owner_first_name ?? null,
      owner_phone: o?.owner_phone ?? null,
      website_domain: o?.website_domain ?? null,
      opens, clicks, replies,
      step_id: l.status_summary?.lastStep?.stepID ?? null,
      step_label: stepLabel(l.status_summary?.lastStep?.stepID),
      last_contact_at: l.timestamp_last_contact ?? l.status_summary?.lastStep?.timestamp_executed ?? null,
      last_open_at: l.timestamp_last_open ?? null,
      last_click_at: l.timestamp_last_click ?? null,
      staged_email: o?.hand_raise_followup_body ?? null,
      staged_at: o?.hand_raise_followup_sent_at ?? null,
      staged_open_count: o?.hand_raise_open_count_at_send ?? null,
      outreach_id: o?.id ?? null,
      pushed_at: o?.pushed_at ?? null,
      call_attempted_at: o?.call_attempted_at ?? null,
      call_outcome: o?.call_outcome ?? null,
      notes: o?.notes ?? null,
      hotness: hotnessScore(opens, clicks),
    }
    const isHandRaiser = clicks >= 1 || opens >= 3
    if (isHandRaiser) handRaisers.push(row)
    else warmingUp.push(row)
    seen.add(email)
  }

  // Pull staged-but-not-in-current-Instantly-snapshot
  for (const o of outreachRows) {
    if (!o.hand_raise_followup_sent_at) continue
    const email = o.email.toLowerCase()
    if (seen.has(email)) continue
    handRaisers.push({
      email,
      business: o.business_name || email,
      city: o.city, state: o.state, trade: o.trade,
      owner_first_name: o.owner_first_name, owner_phone: o.owner_phone, website_domain: o.website_domain,
      opens: o.hand_raise_open_count_at_send ?? 0, clicks: 0, replies: 0,
      step_id: null, step_label: null,
      last_contact_at: null, last_open_at: null, last_click_at: null,
      staged_email: o.hand_raise_followup_body, staged_at: o.hand_raise_followup_sent_at,
      staged_open_count: o.hand_raise_open_count_at_send,
      outreach_id: o.id, pushed_at: o.pushed_at,
      call_attempted_at: o.call_attempted_at, call_outcome: o.call_outcome, notes: o.notes,
      hotness: hotnessScore(o.hand_raise_open_count_at_send ?? 0, 0),
    })
  }

  handRaisers.sort((a, b) => b.hotness - a.hotness)
  warmingUp.sort((a, b) => b.hotness - a.hotness)

  const uncalled = handRaisers.filter((m) => !m.call_attempted_at)
  const called = handRaisers.filter((m) => m.call_attempted_at)

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

      {/* TODAY's campaign performance */}
      {todayStats && (
        <section style={{ padding: '0 24px 14px', maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.50)', marginBottom: 8 }}>
            Today · campaign
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
            padding: '14px 18px',
            background: 'rgba(15,37,66,0.55)',
            border: '1px solid rgba(94,234,212,0.22)',
            borderRadius: 14,
          }}>
            <Stat label="Emails sent" value={todayStats.sent} tone="teal" />
            <Stat label="Unique contacted" value={todayStats.contacted} tone="teal" />
            <Stat label="Opens" value={`${todayStats.unique_opens}/${todayStats.opens}`} tone="teal" subLabel="uniq/raw" />
            <Stat label="Clicks" value={todayStats.unique_clicks} tone="money" hot={todayStats.unique_clicks > 0} />
            <Stat label="Replies" value={todayStats.replies} tone="money" hot={todayStats.replies > 0} />
            <Stat label="Bounces" value={todayStats.bounces} tone="teal" warn={todayStats.bounces > 3} />
          </div>
        </section>
      )}

      {/* HAND-RAISERS tile */}
      <section style={{ padding: '0 24px 14px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#FF9D5A', marginBottom: 8 }}>
          🔥 Hot signal · today
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(232,116,43,0.12) 0%, rgba(15,37,66,0.5) 100%)',
          border: '1px solid rgba(232,116,43,0.30)',
          borderRadius: 14,
        }}>
          <Stat label="Hand-raisers" value={handRaisers.length} tone="money" />
          <Stat label="🔥 Clickers" value={handRaisers.filter((m) => m.clicks > 0).length} tone="money" hot />
          <Stat label="Uncalled" value={uncalled.length} tone="money" hot={uncalled.length > 0} />
          <Stat label="Called" value={called.length} tone="teal" />
        </div>
      </section>

      {/* Lifetime campaign stats */}
      <section style={{ padding: '0 24px 24px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.50)', marginBottom: 8 }}>
          Lifetime · campaign
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
          padding: '14px 18px',
          background: 'rgba(15,37,66,0.40)',
          border: '1px solid rgba(94,234,212,0.18)',
          borderRadius: 14,
        }}>
          <Stat label="Leads in campaign" value={totalLeadsInCampaign} tone="teal" />
          <Stat label="Total opens" value={`${uniqueOpenersLifetime}/${lifetimeOpens}`} tone="teal" subLabel="uniq/raw" />
          <Stat label="Total clicks" value={`${uniqueClickersLifetime}/${lifetimeClicks}`} tone="money" hot={lifetimeClicks > 0} />
          <Stat label="Total replies" value={lifetimeReplies} tone="teal" />
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
        <section style={{ padding: '0 24px 24px', maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: 10 }}>
            ✓ Already called ({called.length})
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {called.map((m) => <HandRaiseCard key={m.email} lead={m} called />)}
          </div>
        </section>
      )}

      {/* WARMING UP — 1-2 opens, not hand-raisers yet */}
      {warmingUp.length > 0 && (
        <section style={{ padding: '0 24px 64px', maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 10 }}>
            ◔ Warming up · 1-2 opens ({warmingUp.length})
          </h2>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', maxWidth: 600, margin: '0 0 12px' }}>
            Opened your email but not yet at hand-raise threshold. If they bump to 3+ they auto-promote to the call list.
          </p>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {warmingUp.slice(0, 30).map((m) => (
              <div key={m.email} style={{
                padding: '10px 12px', borderRadius: 10,
                background: 'rgba(15,37,66,0.30)',
                border: '1px solid rgba(94,234,212,0.10)',
                fontSize: 12, color: 'rgba(255,255,255,0.65)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.business}</div>
                  <div style={{ fontSize: 11, color: '#5EEAD4', fontWeight: 800, flexShrink: 0 }}>{m.opens} open{m.opens > 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                  {m.email}
                  {m.city && ` · ${m.city}`}
                  {m.step_label && ` · ${m.step_label}`}
                </div>
              </div>
            ))}
          </div>
          {warmingUp.length > 30 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.40)', textAlign: 'center' }}>
              + {warmingUp.length - 30} more warming
            </div>
          )}
        </section>
      )}
    </main>
  )
}

function Stat({ label, value, tone, hot, warn, subLabel }: { label: string; value: number | string; tone: 'teal' | 'money'; hot?: boolean; warn?: boolean; subLabel?: string }) {
  const bg = warn
    ? 'rgba(239,68,68,0.10)'
    : hot
      ? 'rgba(232,116,43,0.10)'
      : 'transparent'
  const border = warn
    ? '1px solid rgba(239,68,68,0.30)'
    : hot
      ? '1px solid rgba(232,116,43,0.30)'
      : 'none'
  return (
    <div style={hot || warn ? { padding: '8px 12px', borderRadius: 10, background: bg, border } : {}}>
      <div style={{
        fontSize: 22, fontWeight: 900,
        background: warn
          ? 'linear-gradient(135deg, #FCA5A5, #EF4444)'
          : tone === 'money'
            ? 'linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B)'
            : 'linear-gradient(135deg, #5EEAD4, #14B8A6)',
        WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        letterSpacing: '-0.5px', lineHeight: 1.1,
      }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>
        {label}{subLabel ? <span style={{ marginLeft: 4, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>· {subLabel}</span> : null}
      </div>
    </div>
  )
}
