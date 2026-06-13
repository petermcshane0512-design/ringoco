import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/admin/lead-supply — answers "how many scraped contractors do we
 * have that we HAVEN'T emailed yet?" (2026-06-13). The Instantly campaign
 * holds 521 but outreach_leads may hold thousands. This breaks the table down
 * by: total, has-email, never-pushed, status, and not-pushed-WITH-email (the
 * true loadable backlog). Read-only, admin-gated.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function count(build: (q: ReturnType<typeof baseQ>) => unknown): Promise<number> {
  const q = baseQ()
  const { count: c } = (await (build(q) as ReturnType<typeof baseQ>)) as { count: number | null }
  return c ?? 0
}
function baseQ() {
  return supabase.from('outreach_leads').select('*', { count: 'exact', head: true })
}

export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  const [
    total, withEmail, neverPushed, neverPushedWithEmail, pushed, invalidEmail,
    pendingStatus,
  ] = await Promise.all([
    count((q) => q),
    count((q) => q.not('email', 'is', null).neq('email', '')),
    count((q) => q.is('pushed_at', null)),
    count((q) => q.is('pushed_at', null).not('email', 'is', null).neq('email', '')),
    count((q) => q.not('pushed_at', 'is', null)),
    count((q) => q.eq('status', 'invalid_email')),
    count((q) => q.is('pushed_at', null).neq('status', 'invalid_email').not('email', 'is', null).neq('email', '')),
  ])

  // status breakdown (top values) — pull distinct-ish via a grouped fetch
  const { data: statusRows } = await supabase
    .from('outreach_leads')
    .select('status')
    .limit(10000)
  const statusCounts: Record<string, number> = {}
  for (const r of (statusRows ?? []) as Array<{ status: string | null }>) {
    const k = r.status ?? 'null'
    statusCounts[k] = (statusCounts[k] ?? 0) + 1
  }

  // state/metro breakdown of the loadable backlog (never-pushed, has email)
  const { data: backlogRows } = await supabase
    .from('outreach_leads')
    .select('state, city, trade')
    .is('pushed_at', null)
    .neq('status', 'invalid_email')
    .not('email', 'is', null)
    .neq('email', '')
    .limit(10000)
  const byState: Record<string, number> = {}
  const byTrade: Record<string, number> = {}
  for (const r of (backlogRows ?? []) as Array<{ state: string | null; trade: string | null }>) {
    const s = r.state ?? '??'; byState[s] = (byState[s] ?? 0) + 1
    const t = r.trade ?? '??'; byTrade[t] = (byTrade[t] ?? 0) + 1
  }

  return NextResponse.json({
    total,
    has_email: withEmail,
    pushed,
    never_pushed: neverPushed,
    never_pushed_with_email: neverPushedWithEmail,
    invalid_email: invalidEmail,
    LOADABLE_BACKLOG: pendingStatus,   // not pushed, not invalid, has email
    status_counts: statusCounts,
    backlog_by_state: Object.fromEntries(Object.entries(byState).sort((a, b) => b[1] - a[1])),
    backlog_by_trade: Object.fromEntries(Object.entries(byTrade).sort((a, b) => b[1] - a[1])),
  })
}
