import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/admin/wash-and-arm — one-shot campaign sanitizer + activator
 * (2026-06-12, built for the GO order).
 *
 * WHY: the HVAC Q3 campaign sat paused at a 7.1% bounce rate because
 * auto-load-instantly imported UNVERIFIED scraped emails
 * (verify_leads_on_import was false and the Hunter cron is disabled —
 * no HUNTER_API_KEY in prod). Reactivating without washing would burn
 * the cold domains (see project_email_domain_isolation).
 *
 * WHAT IT DOES, in order:
 *   1. Lists every lead in the campaign via Instantly /leads/list.
 *   2. Runs each through Instantly's own /email-verification.
 *   3. DELETEs hard-invalid leads from the campaign + marks their
 *      outreach_leads row status='invalid_email'. Pending/risky/unknown
 *      results are KEPT (deleting on 'pending' would empty the campaign).
 *   4. With ?activate=1, POSTs /campaigns/{id}/activate at the end.
 *
 * Auth: requireAdmin (x-admin-secret or admin Clerk session).
 */

const CAMPAIGN_ID = process.env.INSTANTLY_CAMPAIGN_HVAC_Q3 || '8ac14ff5-8cd4-4ac4-8549-88dddbef8067'
const INSTANTLY_BASE = 'https://api.instantly.ai/api/v2'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function iHeaders() {
  return { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`, 'Content-Type': 'application/json' }
}

const INVALID_STATUSES = new Set(['invalid'])

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!process.env.INSTANTLY_API_KEY) {
    return NextResponse.json({ ok: false, error: 'INSTANTLY_API_KEY not set' }, { status: 503 })
  }
  const activate = req.nextUrl.searchParams.get('activate') === '1'

  // 1. all campaign leads
  const leads: Array<{ id: string; email: string }> = []
  let cursor: string | undefined
  for (let page = 0; page < 12; page++) {
    const r = await fetch(`${INSTANTLY_BASE}/leads/list`, {
      method: 'POST', headers: iHeaders(),
      body: JSON.stringify({ campaign: CAMPAIGN_ID, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }),
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: `leads/list HTTP ${r.status}` }, { status: 502 })
    const j = await r.json() as { items?: Array<{ id: string; email?: string }>; next_starting_after?: string }
    for (const it of j.items ?? []) if (it.email) leads.push({ id: it.id, email: it.email.toLowerCase() })
    cursor = j.next_starting_after
    if (!cursor) break
  }

  // 2+3. verify each; evict hard-invalids
  let verified = 0, invalid = 0, pendingOrRisky = 0, evicted = 0
  const errors: string[] = []
  for (const l of leads) {
    try {
      const vr = await fetch(`${INSTANTLY_BASE}/email-verification`, {
        method: 'POST', headers: iHeaders(),
        body: JSON.stringify({ email: l.email }),
      })
      if (!vr.ok) { errors.push(`verify ${l.email}: HTTP ${vr.status}`); continue }
      const vj = await vr.json() as { verification_status?: string; status?: string }
      const status = (vj.verification_status ?? vj.status ?? 'unknown').toLowerCase()
      if (status === 'verified' || status === 'valid' || status === 'accept_all') {
        verified++
      } else if (INVALID_STATUSES.has(status)) {
        invalid++
        const dr = await fetch(`${INSTANTLY_BASE}/leads/${l.id}`, { method: 'DELETE', headers: iHeaders() })
        if (dr.ok) {
          evicted++
          await supabase.from('outreach_leads')
            .update({ status: 'invalid_email', hunter_status: `instantly_${status}` })
            .eq('email', l.email)
        } else {
          errors.push(`delete ${l.email}: HTTP ${dr.status}`)
        }
      } else {
        pendingOrRisky++
      }
    } catch (e) {
      errors.push(`${l.email}: ${(e as Error).message}`)
    }
  }

  // 4. activate
  let activated: boolean | null = null
  if (activate) {
    const ar = await fetch(`${INSTANTLY_BASE}/campaigns/${CAMPAIGN_ID}/activate`, { method: 'POST', headers: iHeaders() })
    activated = ar.ok
    if (!ar.ok) errors.push(`activate: HTTP ${ar.status} ${(await ar.text().catch(() => '')).slice(0, 150)}`)
  }

  return NextResponse.json({
    ok: true,
    campaign_leads: leads.length,
    verified,
    invalid,
    evicted,
    pending_or_risky_kept: pendingOrRisky,
    activated,
    errors: errors.slice(0, 10),
  })
}
