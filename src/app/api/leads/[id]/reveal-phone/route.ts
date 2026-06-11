import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { skipTraceAddress } from '@/lib/skipTrace'

export const runtime = 'nodejs'

/**
 * POST /api/leads/[id]/reveal-phone
 *
 * Click-to-reveal skip-trace. Called when the customer taps "Reveal phone"
 * on a lead drop in their dashboard. Costs us ~$0.10 per call (BatchData);
 * gating it behind a tap means we only spend the cents on leads the
 * contractor actually wants to call — not all 22/month.
 *
 * Idempotent: if the lead has already been traced (whether hit or miss),
 * we return the cached result without re-charging BatchData.
 *
 * Auth: Clerk session. Caller MUST own a lead_drops row pointing at this
 * lead — otherwise a customer could reveal phones for anyone's leads.
 *
 * The `[id]` segment is the LEAD id (not the drop id).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: leadId } = await ctx.params

  // Ownership check — caller must have a drop row for this lead.
  const { data: dropRow } = await supabase
    .from('lead_drops')
    .select('id')
    .eq('user_id', userId)
    .eq('lead_id', leadId)
    .limit(1)
    .maybeSingle()
  if (!dropRow) return NextResponse.json({ error: 'lead not assigned to caller' }, { status: 403 })

  // Pull the lead row to check cache + get address.
  const { data: leadRaw, error: fetchErr } = await supabase
    .from('leads')
    .select('id, street_address, city, state, zip, owner_name, owner_phone, owner_email, skip_trace_attempted_at, skip_trace_hit')
    .eq('id', leadId)
    .maybeSingle()
  type LeadRow = {
    id: string
    street_address: string | null
    city: string | null
    state: string | null
    zip: string | null
    owner_name: string | null
    owner_phone: string | null
    owner_email: string | null
    skip_trace_attempted_at: string | null
    skip_trace_hit: boolean | null
  }
  const lead = leadRaw as LeadRow | null
  if (fetchErr || !lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }

  // Cache HITS only — a successful trace never re-bills. 2026-06-11 FIX:
  // misses used to cache forever too, so one flaky trace permanently
  // bricked the lead at "No phone on file" with no way to retry (Peter's
  // entire first drop hit this). A re-tap on a missed lead now re-traces
  // (~$0.10, centrally spend-capped).
  if (lead.skip_trace_attempted_at && lead.skip_trace_hit) {
    return NextResponse.json({
      ok: true,
      cached: true,
      hit: true,
      owner_name: lead.owner_name,
      owner_phone: lead.owner_phone,
      owner_email: lead.owner_email,
    })
  }

  if (!lead.street_address) {
    return NextResponse.json({ error: 'lead has no street address' }, { status: 422 })
  }

  // Cache miss — fire BatchData skip-trace and persist the result.
  const r = await skipTraceAddress({
    street: lead.street_address,
    city: lead.city ?? undefined,
    state: lead.state ?? undefined,
    zip: lead.zip ?? undefined,
  })

  if (!r.ok) {
    // Infra failure (key/network) — do NOT stamp the lead as attempted;
    // that would start a retry lockout for an attempt that never reached
    // BatchData. UI shows retry; lead stays eligible for self-heal.
    return NextResponse.json({ ok: false, hit: false, error: 'lookup_unavailable' })
  }

  const update: Record<string, unknown> = {
    skip_trace_attempted_at: new Date().toISOString(),
    skip_trace_hit: r.hit,
    skip_trace_cost_cents: r.cost_cents,
    updated_at: new Date().toISOString(),
  }
  if (r.hit) {
    if (r.owner_name) update.owner_name = r.owner_name
    if (r.owner_phones && r.owner_phones.length > 0) update.owner_phone = r.owner_phones[0]
    if (r.owner_emails && r.owner_emails.length > 0) update.owner_email = r.owner_emails[0]
    update.skip_trace_raw = r.raw_response
  }
  await supabase.from('leads').update(update).eq('id', lead.id)

  return NextResponse.json({
    ok: true,
    cached: false,
    hit: r.hit,
    owner_name: r.hit ? r.owner_name : null,
    owner_phone: r.hit && r.owner_phones && r.owner_phones[0] ? r.owner_phones[0] : null,
    owner_email: r.hit && r.owner_emails && r.owner_emails[0] ? r.owner_emails[0] : null,
  })
}
