import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/scrape-permits-phoenix
 *
 * Pulls building permits from the City of Phoenix open-data portal,
 * filters to the 5 trades we serve (HVAC, plumbing, electrical,
 * roofing, handyman), and writes them as leads into the `leads` table.
 *
 * Source: Phoenix Open Data — Building Permits dataset
 *   https://www.phoenixopendata.com/dataset/building-permits
 *   (Socrata API: data.phoenixopendata.com/resource/{id}.json)
 *
 * Runs daily 5am UTC (= 10pm Phoenix the day before, when overnight
 * permit batches finish posting). Idempotent — dedups by
 * (street_address, source) UNIQUE constraint on leads.
 *
 * Cost: $0 (free public API, no rate limits at our volume).
 *
 * Phase 2 baseline ingestion. Vegas / Houston / Tampa / Dallas
 * scrapers added in follow-up commits, same shape.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Phoenix CKAN endpoint. Resource ID below is the active "Building Permit
// Data" dataset (verified via package_search on 2026-06-04). If the city
// rotates IDs, re-discover via:
//   https://www.phoenixopendata.com/api/3/action/package_search?q=building+permit
const PHOENIX_PERMITS_URL =
  'https://www.phoenixopendata.com/api/3/action/datastore_search?resource_id=1c61b4b2-1968-4c4b-8ff8-eb44f573e47a&limit=500'

type RawPermit = {
  PermitNumber?: string
  PermitType?: string
  WorkClass?: string
  Description?: string
  PermitIssueDate?: string
  Address?: string
  ZIP?: string
  EstimatedJobCost?: string | number
  TotalSqFt?: string | number
}

// Map a Phoenix permit row to one or more BellAveGo trades.
// Many permits serve multiple trades (e.g. new SFR construction =
// HVAC + plumbing + electrical + roofing all in one).
function classifyTrades(p: RawPermit): string[] {
  const blob = `${p.PermitType || ''} ${p.WorkClass || ''} ${p.Description || ''}`.toLowerCase()
  const trades = new Set<string>()
  if (/\b(hvac|mechanical|a\/?c|air condition|furnace|heat pump|cooling)\b/.test(blob)) trades.add('hvac')
  if (/\b(plumb|water heater|gas line|sewer|drain|kitchen|bath|toilet)\b/.test(blob)) trades.add('plumbing')
  if (/\b(electric|panel|service upgrade|ev charger|solar|wiring)\b/.test(blob)) trades.add('electrical')
  if (/\b(roof|shingle|reroof|skylight)\b/.test(blob)) trades.add('roofing')
  if (/\b(handyman|general|repair|remodel|renovation)\b/.test(blob)) trades.add('handyman')
  // New residential construction = all 5 trades
  if (/\b(new (sfr|construction|residence|home)|single family)\b/.test(blob)) {
    trades.add('hvac')
    trades.add('plumbing')
    trades.add('electrical')
    trades.add('roofing')
    trades.add('handyman')
  }
  return [...trades]
}

// Naive lead-score: bigger jobs + recent permits score higher. Refined
// by Haiku scoring cron in a follow-up.
function naiveScore(p: RawPermit): number {
  let s = 50
  const cost = Number(p.EstimatedJobCost) || 0
  if (cost > 50000) s += 25
  else if (cost > 20000) s += 15
  else if (cost > 5000) s += 8
  // Issued in last 24h gets a freshness bump
  const issued = p.PermitIssueDate ? new Date(p.PermitIssueDate) : null
  if (issued) {
    const hoursSince = (Date.now() - issued.getTime()) / 3_600_000
    if (hoursSince < 24) s += 15
    else if (hoursSince < 72) s += 8
  }
  return Math.max(0, Math.min(100, s))
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let raw: { result?: { records?: RawPermit[] } } | null = null
  try {
    const r = await fetch(PHOENIX_PERMITS_URL, { headers: { Accept: 'application/json' } })
    if (!r.ok) return NextResponse.json({ error: `Phoenix HTTP ${r.status}` }, { status: 502 })
    raw = await r.json()
  } catch (e) {
    return NextResponse.json({ error: `Phoenix fetch err: ${(e as Error).message}` }, { status: 502 })
  }

  const records = raw?.result?.records ?? []
  const candidates: Array<{
    street_address: string
    zip: string
    source: 'permit'
    source_event_date: string | null
    source_details: Record<string, unknown>
    lead_score: number
    trade_match: string[]
  }> = []

  for (const p of records) {
    const trades = classifyTrades(p)
    if (trades.length === 0) continue
    if (!p.Address) continue
    const zip = (p.ZIP || '').replace(/\D/g, '').slice(0, 5)
    if (!zip) continue
    candidates.push({
      street_address: p.Address,
      zip,
      source: 'permit',
      source_event_date: p.PermitIssueDate || null,
      source_details: {
        permit_number: p.PermitNumber,
        permit_type: p.PermitType,
        work_class: p.WorkClass,
        description: p.Description,
        estimated_cost: p.EstimatedJobCost,
        sqft: p.TotalSqFt,
        city: 'Phoenix',
        state: 'AZ',
      },
      lead_score: naiveScore(p),
      trade_match: trades,
    })
  }

  // Bulk upsert — `unique (street_address, source)` constraint on the leads
  // table guarantees no duplicates if the same permit reappears tomorrow.
  let inserted = 0
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100).map((c) => ({
      street_address: c.street_address,
      zip: c.zip,
      city: 'Phoenix',
      state: 'AZ',
      source: c.source,
      source_event_date: c.source_event_date,
      source_details: c.source_details,
      lead_score: c.lead_score,
      trade_match: c.trade_match,
    }))
    const { error } = await supabase.from('leads').upsert(batch, {
      onConflict: 'street_address,source',
      ignoreDuplicates: true,
    })
    if (!error) inserted += batch.length
  }

  return NextResponse.json({
    ok: true,
    source: 'phoenix_permits',
    records_seen: records.length,
    candidates_kept: candidates.length,
    inserted_or_dedup: inserted,
    checked_at: new Date().toISOString(),
  })
}
