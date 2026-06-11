import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'
import { TIER_FEATURES, isValidTier, type Tier } from '@/lib/pricing'
import { geocodeBusinessAddress } from '@/lib/geocodeBusinessAddress'
import { skipTraceAddress } from '@/lib/skipTrace'

export const runtime = 'nodejs'

/**
 * GET /api/leads/list
 *
 * Returns the current tenant's lead drops (newest first) + their tier's
 * quota usage. Powers the /dashboard/leads tab.
 *
 * Auth: Clerk session (the dashboard authenticates the user).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 2026-06-07 — officemgr (the single public tier) drops 5/week = 20/month.
// Display reads "of 20 this month" instead of the prior 15.
const TIER_CADENCE: Record<Tier, { period: 'quarterly' | 'monthly' | 'weekly'; per: number; label: string }> = {
  receptionist: { period: 'quarterly', per: 5,  label: 'this quarter' },
  officemgr:    { period: 'monthly',   per: 20, label: 'this month' },
  concierge:    { period: 'weekly',    per: 25, label: 'this week' },
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Resolve tenant by Clerk userId → profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, plan_tier, next_lead_drop_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'profile not found' }, { status: 404 })

  const tier = profile.plan_tier || 'receptionist'
  const validTier = isValidTier(tier) ? (tier as Tier) : 'receptionist'
  const cadence = TIER_CADENCE[validTier]

  // Drop period start
  const now = new Date()
  let periodStart: Date
  if (cadence.period === 'weekly') {
    periodStart = new Date(now)
    periodStart.setDate(now.getDate() - now.getDay())
    periodStart.setHours(0, 0, 0, 0)
  } else if (cadence.period === 'monthly') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  } else {
    const q = Math.floor(now.getMonth() / 3)
    periodStart = new Date(now.getFullYear(), q * 3, 1)
  }

  const { data: dropsRaw } = await supabase
    .from('lead_drops')
    .select(`
      id, drop_date, drop_period, status, notes,
      lead:leads (
        id, street_address, city, state, zip, owner_name, owner_phone, owner_email,
        home_value_est, year_built, sqft, source, lead_score, pitch_script,
        skip_trace_attempted_at, skip_trace_hit, lat, lng, source_details
      )
    `)
    .eq('user_id', userId)
    .order('drop_date', { ascending: false })
    .limit(50)

  // Exclude aging_hvac rows: synthetic zip-aggregate placeholders, never
  // deliverable as per-property leads. Customer-facing surfaces never show
  // invented data (Peter rule 2026-06-10).
  const drops = (dropsRaw || []).filter((d) => {
    if (!d.lead) return false
    const lead = d.lead as unknown as { source?: string | null }
    return lead.source !== 'aging_hvac'
  })

  // 2026-06-11 — self-healing pin backfill. Permit-scraper leads carry an
  // address but no lat/lng (city feeds are text-only), so they render in
  // the list but never pin on the dashboard map. Geocode up to 5 such
  // leads per page load ($0.005 each, one-time per lead — the write-back
  // makes the next load free) and patch the response in place so the pin
  // shows THIS render, not next week's.
  type LeadPatch = { id: string; street_address?: string | null; city?: string | null; state?: string | null; zip?: string | null; lat?: number | null; lng?: number | null }
  const needsGeo = drops
    .map((d) => d.lead as unknown as LeadPatch)
    .filter((l) => l && l.street_address && (typeof l.lat !== 'number' || typeof l.lng !== 'number'))
    .slice(0, 5)
  for (const l of needsGeo) {
    const addr = [l.street_address, l.city, l.state, l.zip].filter(Boolean).join(', ')
    if (addr.length < 8) continue
    try {
      const g = await geocodeBusinessAddress(addr)
      if (g) {
        l.lat = g.lat
        l.lng = g.lng
        await supabase.from('leads').update({ lat: g.lat, lng: g.lng }).eq('id', l.id)
      }
    } catch { /* pin is enhancement — never fail the list */ }
  }

  // 2026-06-11 — self-healing CONTACT backfill. Skip-trace gives owner
  // name + phone + email in one $0.10 call (verified live: full contact
  // data exists for these exact streets). Re-trace up to 3 phoneless
  // delivered leads per page load; misses older than 10 minutes are fair
  // game again (one flaky pass must not brick a lead forever). The write-
  // back makes hits permanent; spend is centrally capped in skipTrace.ts.
  type ContactPatch = {
    id: string; street_address?: string | null; city?: string | null; state?: string | null; zip?: string | null
    owner_name?: string | null; owner_phone?: string | null; owner_email?: string | null
    skip_trace_attempted_at?: string | null; skip_trace_hit?: boolean | null
  }
  const RETRACE_AFTER_MS = 3 * 60 * 1000
  // Surfaced to the dashboard banner — trace failures must name themselves.
  const contactBackfillNotes: string[] = []
  const eligibleContact = drops
    .map((d) => d.lead as unknown as ContactPatch)
    .filter((l) => l && l.street_address && !l.owner_phone)
    .filter((l) => !l.skip_trace_attempted_at || (Date.now() - new Date(l.skip_trace_attempted_at).getTime()) > RETRACE_AFTER_MS)
  const needContact = eligibleContact.slice(0, 3)

  // 2026-06-11 per Peter ("update ALL the active leads already sent") —
  // everything beyond the synchronous 3 is traced in the background after
  // the response flushes (Next after()). One page load → whole batch
  // filled; the next refresh renders the rest. Cap 12/load; spend stays
  // centrally capped inside skipTraceAddress.
  const deferredContact = eligibleContact.slice(3, 15)
  if (deferredContact.length > 0) {
    after(async () => {
      for (const l of deferredContact) {
        try {
          const t = await skipTraceAddress({
            street: l.street_address as string,
            city: l.city ?? undefined,
            state: l.state ?? undefined,
            zip: l.zip ?? undefined,
          })
          if (!t.ok) continue  // infra failure ≠ attempt — stay eligible
          await supabase.from('leads').update({
            skip_trace_attempted_at: new Date().toISOString(),
            skip_trace_hit: t.hit,
            ...(t.hit ? {
              ...(t.owner_phones?.[0] ? { owner_phone: t.owner_phones[0] } : {}),
              ...(t.owner_emails?.[0] ? { owner_email: t.owner_emails[0] } : {}),
              ...(t.owner_name ? { owner_name: t.owner_name } : {}),
            } : {}),
          }).eq('id', l.id)
        } catch { /* background enhancement */ }
      }
      console.log(`[leads/list] background contact backfill done: ${deferredContact.length} leads for ${userId}`)
    })
  }

  for (const l of needContact) {
    try {
      const t = await skipTraceAddress({
        street: l.street_address as string,
        city: l.city ?? undefined,
        state: l.state ?? undefined,
        zip: l.zip ?? undefined,
      })
      if (!t.ok) {
        // INFRA failure (key/network) — do NOT stamp attempted_at. A stamp
        // here started a 10-min retry lockout that rolled forward on every
        // refresh during an outage, freezing leads at "Owner unlisted"
        // indefinitely (Peter hit this during the BOM-key incident). Only a
        // REAL BatchData "no data" miss counts as an attempt.
        contactBackfillNotes.push(`trace failed: ${t.error || 'unknown'}`)
        continue
      }
      if (!t.hit) contactBackfillNotes.push(`no owner data found for ${l.street_address}`)
      const update: Record<string, unknown> = {
        skip_trace_attempted_at: new Date().toISOString(),
        skip_trace_hit: t.hit,
      }
      if (t.hit) {
        if (t.owner_phones?.[0]) { update.owner_phone = t.owner_phones[0]; l.owner_phone = t.owner_phones[0] }
        if (t.owner_emails?.[0]) { update.owner_email = t.owner_emails[0]; l.owner_email = t.owner_emails[0] }
        if (t.owner_name) { update.owner_name = t.owner_name; l.owner_name = t.owner_name }
        l.skip_trace_hit = true
      }
      l.skip_trace_attempted_at = update.skip_trace_attempted_at as string
      await supabase.from('leads').update(update).eq('id', l.id)
    } catch (e) {
      contactBackfillNotes.push(`trace threw: ${(e as Error).message}`)
    }
  }

  const usedThisPeriod = drops.filter((d) => new Date(d.drop_date) >= periodStart).length

  return NextResponse.json({
    drops,
    quota: {
      tier: validTier,
      tier_display: TIER_FEATURES[validTier].leadsCadence,
      cadence: cadence.period,
      cadence_label: cadence.label,
      per_drop: cadence.per,
      used_this_period: usedThisPeriod,
    },
    next_lead_drop_at: profile.next_lead_drop_at,
    ...(contactBackfillNotes.length > 0 ? { contact_backfill_notes: contactBackfillNotes.slice(0, 3) } : {}),
  })
}
