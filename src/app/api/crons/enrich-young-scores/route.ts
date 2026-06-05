import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreYoungOwner } from '@/lib/youngOwnerScore'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/enrich-young-scores
 *
 * Continuous young-owner enrichment pipeline. Runs nightly 2am UTC,
 * BEFORE the 9am Instantly auto-load-instantly cron picks young leads
 * for the day's send.
 *
 * For each outreach_leads row missing young_scored_at:
 *   1. Extract domain from notes "web:URL" field
 *   2. RDAP-lookup domain_registered_at (rdap.org, free, no key)
 *   3. Compute young_owner_score via shared lib
 *   4. Mark young_scored_at + persist
 *
 * Idempotent — only processes rows where young_scored_at IS NULL.
 *
 * Cost: $0. Rate: 5 req/sec polite to rdap.org. 600 leads = ~2min.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.startsWith('http') ? url : `http://${url}`)
    return u.hostname.toLowerCase().replace(/^www\./, '')
  } catch { return null }
}

function urlFromNotes(notes: string | null): string | null {
  if (!notes) return null
  const m = String(notes).match(/web:(https?:\/\/[^\s,]+|[^\s,]+\.[a-z]{2,}[^\s,]*)/i)
  return m ? m[1] : null
}

type RdapResult = { ok: boolean; registeredAt?: string; reason?: string }
async function rdapLookup(domain: string): Promise<RdapResult> {
  try {
    const r = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` }
    const j = await r.json() as { events?: Array<{ eventAction?: string; eventDate?: string }> }
    const events = Array.isArray(j.events) ? j.events : []
    const reg = events.find((e) => e.eventAction === 'registration')
    if (reg?.eventDate) return { ok: true, registeredAt: reg.eventDate }
    return { ok: false, reason: 'no registration event' }
  } catch (e) {
    return { ok: false, reason: (e as Error).message.slice(0, 60) }
  }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const limit = Math.min(1500, parseInt(url.searchParams.get('limit') ?? '500', 10))

  // Pull unscored leads. Newest first so freshly-scraped leads land in
  // tomorrow's Instantly send.
  const { data: leads, error } = await supabase
    .from('outreach_leads')
    .select('id, business_name, trade, employee_count_est, website_snippet, notes, owner_first_name, city, state, domain_registered_at')
    .is('young_scored_at', null)
    .order('pushed_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, message: 'all leads scored', processed: 0 })
  }

  let rdapHits = 0
  let rdapMisses = 0
  let scored = 0
  const tierCounts = { hot: 0, warm: 0, cold: 0 }

  for (const lead of leads) {
    // Step 1: RDAP enrichment if domain not yet looked up
    let domainRegisteredAt = lead.domain_registered_at as string | null
    if (!domainRegisteredAt) {
      const url = urlFromNotes(lead.notes)
      const domain = extractDomain(url)
      if (domain) {
        const r = await rdapLookup(domain)
        if (r.ok && r.registeredAt) {
          domainRegisteredAt = r.registeredAt
          rdapHits++
        } else {
          rdapMisses++
        }
        // Throttle 200ms = ~5 req/sec polite to rdap.org
        await new Promise((res) => setTimeout(res, 200))
      }
    }

    // Step 2: Score using shared lib
    const result = scoreYoungOwner({
      business_name: lead.business_name,
      trade: lead.trade,
      employee_count_est: lead.employee_count_est,
      website_snippet: lead.website_snippet,
      notes: lead.notes,
      owner_first_name: lead.owner_first_name,
      city: lead.city,
      state: lead.state,
      domain_registered_at: domainRegisteredAt,
    })

    if (result.score >= 60) tierCounts.hot++
    else if (result.score >= 40) tierCounts.warm++
    else tierCounts.cold++

    // Step 3: Persist
    const updates: Record<string, unknown> = {
      young_owner_score: result.score,
      young_signals: result.signals,
      young_scored_at: new Date().toISOString(),
    }
    if (domainRegisteredAt && !lead.domain_registered_at) {
      updates.domain_registered_at = domainRegisteredAt
      updates.domain_enriched_at = new Date().toISOString()
    }
    const { error: upErr } = await supabase
      .from('outreach_leads')
      .update(updates)
      .eq('id', lead.id)
    if (!upErr) scored++
    else console.warn(`[enrich-young] update err for ${lead.id}: ${upErr.message}`)
  }

  return NextResponse.json({
    ok: true,
    leads_processed: leads.length,
    scored,
    rdap_hits: rdapHits,
    rdap_misses: rdapMisses,
    tier_counts: tierCounts,
    checked_at: new Date().toISOString(),
  })
}
