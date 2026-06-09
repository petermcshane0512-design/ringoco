import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { batchdataPropertySearch } from '@/lib/skipTrace'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/personalize-sample-leads
 *
 * Nightly 2:30am CT. Runs after personalize-queued-leads (Sonnet opener).
 *
 * For every outreach_leads row with status='queued' AND
 * sample_lead_snippet IS NULL AND email + city + state NOT NULL:
 * fetches 1 real Batch Data lead in the recipient's city and writes a
 * snippet shown inside the cold email body.
 *
 * Pipeline:
 *   1. Group queued recipients by (city, state)
 *   2. For each city: resolve 1 representative zip via zip_centroids
 *   3. Hit Batch Data Property Search ONCE per city ($4 returns up to 25)
 *      — trade-specific filters (HVAC = 1985-2005 build owner-occupied;
 *        roofing = pre-2005; plumbing = any age; electrical = pre-1990;
 *        handyman = recent buyers 1970-2005)
 *   4. Round-robin distribute 1 unique result per recipient
 *   5. If a city returns 0 results → fallback to nearest big-metro zip
 *      via zips_within_miles RPC w/ 50mi radius
 *   6. Write snippet to outreach_leads.sample_lead_snippet
 *
 * Snippet shape (phone redacted — phone reveal is the conversion hook):
 *   "Sarah at 4421 Maple Crest, Plano TX — recently sold, home built 1998,
 *    HVAC ~28yr, est. job $3,200–$4,800"
 *
 * Cost reality:
 *   - $4 per metro (25 results × $0.05 + dedup)
 *   - 50 metros/day at 450/day send = $200/day at full volume
 *   - approved 2026-06-09 per Peter for cold-email lift trial
 *
 * Hormozi $100M Offers: "free gift before the ask." The sample lead IS
 * the gift. Reply rate lifts 2-4x vs generic (CXL personalization data).
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Recipient = {
  id: string
  email: string
  city: string
  state: string
  trade: string | null
}

type TradeFilter = {
  yearBuiltMin?: number
  yearBuiltMax?: number
  recentSaleWithinDays?: number
  ownerOccupiedOnly: boolean
  estJobRange: string
  signalLabel: (yearBuilt: number | null, lastSale: string | null) => string
}

function tradeFilterFor(trade: string | null): TradeFilter {
  const t = (trade || 'hvac').toLowerCase()
  if (t.includes('handy') || t.includes('general')) {
    return {
      recentSaleWithinDays: 120,
      yearBuiltMin: 1970,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      estJobRange: '$400–$2,200',
      signalLabel: (_, sale) => sale ? 'recent buyer (deferred-maintenance window)' : 'long-term owner-occupant',
    }
  }
  if (t.includes('plumb')) {
    return {
      ownerOccupiedOnly: true,
      estJobRange: '$800–$3,400',
      signalLabel: (y) => y ? `plumbing system ${new Date().getFullYear() - y}yr old` : 'owner-occupied (water-heater age window)',
    }
  }
  if (t.includes('elect')) {
    return {
      yearBuiltMax: 1990,
      ownerOccupiedOnly: true,
      estJobRange: '$1,400–$6,800',
      signalLabel: (y) => y ? `pre-1990 build (panel likely original, ${y})` : 'pre-1990 build (panel upgrade window)',
    }
  }
  if (t.includes('roof')) {
    return {
      yearBuiltMin: 1985,
      yearBuiltMax: 2005,
      ownerOccupiedOnly: true,
      estJobRange: '$8,400–$22,500',
      signalLabel: (y) => y ? `roof ~${new Date().getFullYear() - y}yr (built ${y})` : 'aging asphalt roof',
    }
  }
  // HVAC default
  return {
    yearBuiltMin: 1985,
    yearBuiltMax: 2005,
    ownerOccupiedOnly: true,
    estJobRange: '$3,200–$8,400',
    signalLabel: (y) => y ? `HVAC ~${new Date().getFullYear() - y}yr (built ${y})` : 'aging HVAC home',
  }
}

function firstNameOnly(full: string | null): string {
  if (!full) return 'A homeowner'
  const parts = full.trim().split(/\s+/)
  return parts[0] || 'A homeowner'
}

function shortStreet(street: string | null): string {
  if (!street) return 'a verified address'
  return street.length > 40 ? street.slice(0, 40) + '…' : street
}

function buildSnippet(args: {
  ownerName: string | null
  street: string | null
  city: string | null
  state: string | null
  yearBuilt: number | null
  lastSaleDate: string | null
  filter: TradeFilter
}): string {
  const owner = firstNameOnly(args.ownerName)
  const addr = shortStreet(args.street)
  const cityState = [args.city, args.state].filter(Boolean).join(' ')
  const signal = args.filter.signalLabel(args.yearBuilt, args.lastSaleDate)
  return `${owner} at ${addr}, ${cityState} — ${signal}, est. job ${args.filter.estJobRange}`
}

async function resolveCityZip(city: string, state: string): Promise<string | null> {
  const { data } = await supabase
    .from('zip_centroids')
    .select('zip')
    .eq('state', state)
    .ilike('city', city)
    .limit(1)
    .maybeSingle()
  return data?.zip || null
}

async function nearbyFallbackZip(zip: string): Promise<string | null> {
  const { data: nearby } = await supabase.rpc('zips_within_miles', {
    primary_zip: zip,
    radius_mi: 50,
  })
  if (Array.isArray(nearby) && nearby.length > 0) {
    const first = nearby.find((z: { zip?: string }) => z?.zip && z.zip !== zip)
    return first?.zip || null
  }
  return null
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!process.env.BATCHDATA_API_KEY) {
    return NextResponse.json({ ok: false, error: 'BATCHDATA_API_KEY missing' }, { status: 500 })
  }

  const url = new URL(req.url)
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '250', 10))
  const dryRun = url.searchParams.get('dry') === '1'

  const { data: recipientsRaw, error } = await supabase
    .from('outreach_leads')
    .select('id, email, city, state, trade')
    .eq('status', 'queued')
    .not('email', 'is', null)
    .not('city', 'is', null)
    .not('state', 'is', null)
    .is('sample_lead_snippet', null)
    .limit(limit)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const recipients = (recipientsRaw || []) as Recipient[]
  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, generated: 0, message: 'no recipients need sample-lead' })
  }

  // Group by (city|state|trade) so we hit BatchData ONCE per group and
  // round-robin candidates to recipients within. Same metro × different
  // trades = different filters = different searches (intentional).
  const groups = new Map<string, Recipient[]>()
  for (const r of recipients) {
    const tradeKey = (r.trade || 'hvac').toLowerCase().split(' ')[0]
    const k = `${r.state}|${r.city.toLowerCase().trim()}|${tradeKey}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }

  let generated = 0
  let groupsHit = 0
  let groupsEmpty = 0
  let spentCents = 0

  for (const [key, members] of groups) {
    const [state, cityLower, tradeKey] = key.split('|')
    const sampleCity = members[0].city
    const filter = tradeFilterFor(tradeKey)

    // Resolve representative zip for the city.
    let zip = await resolveCityZip(sampleCity, state)
    if (!zip) {
      // No zip on record — try fallback via state-level zip
      const { data: fallbackRow } = await supabase
        .from('zip_centroids')
        .select('zip')
        .eq('state', state)
        .limit(1)
        .maybeSingle()
      zip = fallbackRow?.zip || null
    }
    if (!zip) {
      console.warn(`[sample-lead] no zip for ${cityLower}, ${state} — skipping ${members.length} recipients`)
      groupsEmpty++
      continue
    }

    // Hit BatchData for this zip.
    let search = await batchdataPropertySearch({
      zip,
      yearBuiltMin: filter.yearBuiltMin,
      yearBuiltMax: filter.yearBuiltMax,
      recentSaleWithinDays: filter.recentSaleWithinDays,
      ownerOccupiedOnly: filter.ownerOccupiedOnly,
      resultsLimit: 25,
    })
    spentCents += search.cost_cents

    if (!search.ok || search.properties.length === 0) {
      // Fallback: try nearby zip
      const nearZip = await nearbyFallbackZip(zip)
      if (nearZip) {
        search = await batchdataPropertySearch({
          zip: nearZip,
          yearBuiltMin: filter.yearBuiltMin,
          yearBuiltMax: filter.yearBuiltMax,
          recentSaleWithinDays: filter.recentSaleWithinDays,
          ownerOccupiedOnly: filter.ownerOccupiedOnly,
          resultsLimit: 25,
        })
        spentCents += search.cost_cents
      }
    }

    if (!search.ok || search.properties.length === 0) {
      console.warn(`[sample-lead] no results for ${cityLower}, ${state} — skipping ${members.length} recipients`)
      groupsEmpty++
      continue
    }

    groupsHit++
    const candidates = search.properties.filter((p) => p.street_address)

    // Round-robin distribute. If we have fewer candidates than recipients,
    // cycle through. (Acceptable — different recipients in same city won't
    // talk to each other, and the snippet still reads as personalized.)
    for (let i = 0; i < members.length; i++) {
      const c = candidates[i % candidates.length]
      const snippet = buildSnippet({
        ownerName: c.owner_name,
        street: c.street_address,
        city: c.city || sampleCity,
        state: c.state || state.toUpperCase(),
        yearBuilt: c.year_built,
        lastSaleDate: c.last_sale_date,
        filter,
      })
      if (dryRun) {
        generated++
        continue
      }
      const { error: upErr } = await supabase
        .from('outreach_leads')
        .update({
          sample_lead_snippet: snippet,
          sample_lead_generated_at: new Date().toISOString(),
        })
        .eq('id', members[i].id)
      if (!upErr) generated++
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    groups_total: groups.size,
    groups_hit: groupsHit,
    groups_empty: groupsEmpty,
    spent_cents: spentCents,
    spent_dollars: (spentCents / 100).toFixed(2),
    recipients_seen: recipients.length,
    dry: dryRun,
    checked_at: new Date().toISOString(),
  })
}
