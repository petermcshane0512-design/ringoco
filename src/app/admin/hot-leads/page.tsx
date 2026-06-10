import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import HotLeadsRow from './HotLeadsRow'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * /admin/hot-leads — 2026-06-10 hot-lead-call pivot dispatcher.
 *
 * Persistent list of every prospect who triggered the hot-call SMS
 * (hot_call_sms_sent_at NOT NULL) so Peter never loses one to a missed
 * text. To-call queue sorts undialed first, then by recency.
 *
 * Each row has a tap-to-dial link + a "mark called" button that POSTs
 * /api/admin/hot-leads/dial — the row then drops to the "called"
 * section below the fold.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type HotRow = {
  biz_id: string
  email: string | null
  city: string | null
  state: string | null
  zip: string | null
  trade: string | null
  visit_count: number
  last_visited_at: string | null
  hot_call_sms_sent_at: string | null
  hot_call_dialed_at: string | null
  signed_up_at: string | null
  business_name: string | null
  owner_first_name: string | null
}

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')
    ? process.env.NEXT_PUBLIC_APP_URL
    : 'https://www.bellavego.com'

async function loadHotLeads(): Promise<HotRow[]> {
  // Two-step: hot prospect rows first, then enrich with outreach_leads
  // business_name + owner_first_name + (eventually) phone.
  const { data: hot } = await supabase
    .from('prospect_free_leads')
    .select('biz_id, email, city, state, zip, trade, visit_count, last_visited_at, hot_call_sms_sent_at, hot_call_dialed_at, signed_up_at')
    .not('hot_call_sms_sent_at', 'is', null)
    .order('hot_call_dialed_at', { ascending: true, nullsFirst: true })
    .order('hot_call_sms_sent_at', { ascending: false })
    .limit(200)
  const rows = (hot as Omit<HotRow, 'business_name' | 'owner_first_name'>[]) || []
  if (rows.length === 0) return []
  const emails = Array.from(new Set(rows.map((r) => r.email).filter(Boolean))) as string[]
  let enrichMap: Record<string, { business_name: string | null; owner_first_name: string | null }> = {}
  if (emails.length > 0) {
    const { data: enrich } = await supabase
      .from('outreach_leads')
      .select('email, business_name, owner_first_name')
      .in('email', emails)
    enrichMap = Object.fromEntries(
      ((enrich as { email: string; business_name: string | null; owner_first_name: string | null }[]) || [])
        .map((e) => [e.email, { business_name: e.business_name, owner_first_name: e.owner_first_name }]),
    )
  }
  return rows.map((r) => ({
    ...r,
    business_name: r.email ? enrichMap[r.email]?.business_name ?? null : null,
    owner_first_name: r.email ? enrichMap[r.email]?.owner_first_name ?? null : null,
  }))
}

export default async function AdminHotLeadsPage() {
  const gate = await requireAdmin()
  if (!gate.ok) redirect('/')

  const hot = await loadHotLeads()
  const toCall = hot.filter((h) => !h.hot_call_dialed_at && !h.signed_up_at)
  const called = hot.filter((h) => h.hot_call_dialed_at && !h.signed_up_at)
  const won = hot.filter((h) => h.signed_up_at)

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '24px 32px', maxWidth: 1240, margin: '0 auto', color: '#0B1F3A' }}>
      <Link href="/admin" style={{ fontSize: 12, color: '#7AAAB2', textDecoration: 'none' }}>← admin</Link>
      <h1 style={{ fontSize: 22, fontWeight: 900, margin: '8px 0 6px' }}>Hot leads</h1>
      <p style={{ fontSize: 13, color: '#4A6670', margin: '0 0 18px', maxWidth: 720, lineHeight: 1.5 }}>
        Prospects who visited their personalized /free-lead landing <strong>2+ times</strong> — the only outbound dial list per the 2026-06-10 pivot. Tap the URL to open their landing in a new tab. Hit <em>Mark called</em> after dialing.
      </p>

      <div style={{ display: 'flex', gap: 24, fontSize: 12, color: '#4A6670', marginBottom: 18 }}>
        <div><strong style={{ color: '#C84B26', fontSize: 22 }}>{toCall.length}</strong> to call</div>
        <div><strong style={{ fontSize: 22 }}>{called.length}</strong> called</div>
        <div><strong style={{ color: '#16803F', fontSize: 22 }}>{won.length}</strong> signed up</div>
      </div>

      {/* TO-CALL */}
      <h2 style={sectionH2}>To call</h2>
      {toCall.length === 0 ? (
        <p style={empty}>None right now. Keep the email sequence firing.</p>
      ) : (
        <div style={tableWrap}>
          {toCall.map((r) => (
            <HotLeadsRow key={r.biz_id} row={r} siteUrl={SITE_URL} />
          ))}
        </div>
      )}

      {/* CALLED */}
      {called.length > 0 && (
        <>
          <h2 style={sectionH2}>Called (awaiting signup)</h2>
          <div style={tableWrap}>
            {called.map((r) => (
              <HotLeadsRow key={r.biz_id} row={r} siteUrl={SITE_URL} muted />
            ))}
          </div>
        </>
      )}

      {/* WON */}
      {won.length > 0 && (
        <>
          <h2 style={sectionH2}>Signed up</h2>
          <div style={tableWrap}>
            {won.map((r) => (
              <HotLeadsRow key={r.biz_id} row={r} siteUrl={SITE_URL} won />
            ))}
          </div>
        </>
      )}
    </main>
  )
}

const sectionH2: React.CSSProperties = {
  fontSize: 14, fontWeight: 900, color: '#C84B26',
  letterSpacing: '0.10em', textTransform: 'uppercase',
  margin: '26px 0 10px',
}
const empty: React.CSSProperties = {
  fontSize: 13, color: '#7AAAB2', fontStyle: 'italic',
  padding: '16px 20px', background: '#FFFFFF',
  border: '1px dashed rgba(11,31,58,0.18)', borderRadius: 10,
}
const tableWrap: React.CSSProperties = {
  display: 'grid', gap: 10,
}
