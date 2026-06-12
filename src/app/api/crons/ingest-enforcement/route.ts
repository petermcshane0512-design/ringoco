import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyCronAuth, recordCronStart, recordCronFinish } from '@/lib/cronRuns'
import {
  matchTrades, tierFor, scoreForTier, urgencyLabel, buildPitch, whyTags,
  building311Types, tradeRules, type TriggerType,
} from '@/lib/enforcementTriggers'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/ingest-enforcement — 2026-06-11 per Peter ("the jackpot").
 *
 * ENFORCEMENT-TIER lead sources, Chicago (template city — adding a metro
 * is config, not code):
 *
 *   22u3-xenr  Building Violations    → trigger violation / failed_inspection
 *   6br9-quuz  Ordinance Violations   → trigger hearings_case (fines, dockets,
 *              (Dept. of Admin Hearings)  respondent NAMES — free)
 *   v6vf-nfxy  311 Service Requests   → trigger 311 (building-related types)
 *
 * These homeowners are not "maybe interested" — the city has ORDERED the
 * repair. Cross-referenced by address: one address with both a violation
 * and a hearings case merges into ONE lead at the higher urgency tier
 * with full history. Same weekly cadence, same skip-trace, same dedupe
 * (street_address+source UNIQUE) as every other lead source. Lat/lng
 * written so the dashboard map pins without geocode backfill.
 *
 * Query params: ?days=60 lookback, ?limit=1000 per source.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const D = 'data.cityofchicago.org'

type Trigger = {
  trigger_type: TriggerType
  date: string | null
  desc: string
  fine: number | null
  respondents: string | null
  raw_id: string | null
}

type AddrBundle = {
  street_address: string
  lat: number | null
  lng: number | null
  zip: string | null
  triggers: Trigger[]
  tradeKeys: Set<string>
  engineTrades: Set<string>
}

function normAddr(s: string): string {
  return (s || '').toUpperCase().replace(/\s+/g, ' ').trim()
}

async function soda(resource: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const r = await fetch(`https://${D}/resource/${resource}.json?${qs}`)
  if (!r.ok) throw new Error(`${resource} HTTP ${r.status}`)
  return await r.json()
}

async function nearestZip(lat: number, lng: number, cache: Map<string, string | null>): Promise<string | null> {
  const key = `${lat.toFixed(2)}|${lng.toFixed(2)}`
  if (cache.has(key)) return cache.get(key) ?? null
  const { data } = await supabase
    .from('zip_centroids')
    .select('zip, lat, lng')
    .gte('lat', lat - 0.3).lte('lat', lat + 0.3)
    .gte('lng', lng - 0.3).lte('lng', lng + 0.3)
  let best: string | null = null
  let bestD = Infinity
  for (const c of (data ?? []) as Array<{ zip: string; lat: number; lng: number }>) {
    const d = Math.hypot(c.lat - lat, c.lng - lng)
    if (d < bestD) { bestD = d; best = c.zip }
  }
  cache.set(key, best)
  return best
}

export async function GET(req: NextRequest) {
  const startedAtMs = Date.now()
  const mode = classifyCronAuth(req, process.env.ADMIN_API_SECRET)
  const cronRunId = await recordCronStart('ingest-enforcement', mode)
  if (mode === 'unauthorized') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '60', 10)
  const limit = Math.min(5000, parseInt(url.searchParams.get('limit') ?? '1000', 10))
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const bundles = new Map<string, AddrBundle>()
  const counts = { violations: 0, hearings: 0, sr311: 0, errors: [] as string[] }

  function addTrigger(addr: string, lat: number | null, lng: number | null, zip: string | null, t: Trigger, text: string) {
    const trades = matchTrades(text)
    if (trades.engineTrades.length === 0) return false
    const key = normAddr(addr)
    if (!key || key.length < 6) return false
    let b = bundles.get(key)
    if (!b) {
      b = { street_address: addr, lat, lng, zip, triggers: [], tradeKeys: new Set(), engineTrades: new Set() }
      bundles.set(key, b)
    }
    if (lat !== null && b.lat === null) { b.lat = lat; b.lng = lng }
    if (zip && !b.zip) b.zip = zip
    b.triggers.push(t)
    trades.keys.forEach((k) => b.tradeKeys.add(k))
    trades.engineTrades.forEach((k) => b.engineTrades.add(k))
    return true
  }

  // ── 1. Building Violations (OPEN) + failed inspections ──────────────
  try {
    const rows = await soda('22u3-xenr', {
      $where: `violation_date >= '${since}' AND violation_status = 'OPEN'`,
      $order: 'violation_date DESC',
      $limit: String(limit),
    })
    for (const r of rows) {
      const addr = String(r.address || '')
      const text = `${r.violation_description || ''} ${r.violation_ordinance || ''} ${r.violation_inspector_comments || ''}`
      const failed = String(r.inspection_status || '').toUpperCase() === 'FAILED'
      const ok = addTrigger(addr,
        r.latitude ? Number(r.latitude) : null,
        r.longitude ? Number(r.longitude) : null,
        null,
        {
          trigger_type: failed ? 'failed_inspection' : 'violation',
          date: (r.violation_date as string) || null,
          desc: `${r.violation_description || ''}${r.violation_ordinance ? ` — ${r.violation_ordinance}` : ''}`.slice(0, 220),
          fine: null,
          respondents: null,
          raw_id: (r.id as string) || null,
        }, text)
      if (ok) counts.violations++
    }
  } catch (e) { counts.errors.push(`violations: ${(e as Error).message}`) }

  // ── 2. Ordinance Violations / Admin Hearings (Buildings dept) ───────
  try {
    const rows = await soda('6br9-quuz', {
      $where: `last_modified_date >= '${since}' AND issuing_department = 'Buildings'`,
      $order: 'last_modified_date DESC',
      $limit: String(limit),
    })
    for (const r of rows) {
      const addr = String(r.address || '')
      const fine = r.imposed_fine ? Number(r.imposed_fine) : null
      const ok = addTrigger(addr,
        r.latitude ? Number(r.latitude) : null,
        r.longitude ? Number(r.longitude) : null,
        null,
        {
          trigger_type: 'hearings_case',
          date: (r.hearing_date as string) || (r.violation_date as string) || null,
          desc: String(r.violation_description || '').slice(0, 220),
          fine,
          respondents: String(r.respondents || '').slice(0, 120) || null,
          raw_id: (r.docket_number as string) || null,
        }, String(r.violation_description || ''))
      if (ok) counts.hearings++
    }
  } catch (e) { counts.errors.push(`hearings: ${(e as Error).message}`) }

  // ── 3. 311 building-related requests ────────────────────────────────
  try {
    const types = building311Types().map((t) => `'${t.replace(/'/g, "''")}'`).join(',')
    const rows = await soda('v6vf-nfxy', {
      $where: `created_date >= '${since}' AND status = 'Open' AND sr_type in (${types})`,
      $order: 'created_date DESC',
      $limit: String(limit),
    })
    for (const r of rows) {
      const addr = String(r.street_address || '')
      const ok = addTrigger(addr,
        r.latitude ? Number(r.latitude) : null,
        r.longitude ? Number(r.longitude) : null,
        (r.zip_code as string) || null,
        {
          trigger_type: '311',
          date: (r.created_date as string) || null,
          desc: String(r.sr_type || '').slice(0, 220),
          fine: null,
          respondents: null,
          raw_id: (r.sr_number as string) || null,
        }, String(r.sr_type || ''))
      if (ok) counts.sr311++
    }
  } catch (e) { counts.errors.push(`311: ${(e as Error).message}`) }

  // ── Merge per address → lead rows at the HIGHEST urgency tier ───────
  const labelByKey = new Map(tradeRules().map((t) => [t.key, t.label]))
  const zipCache = new Map<string, string | null>()
  let inserted = 0
  let skippedNoZip = 0
  const rowsOut: Record<string, unknown>[] = []

  for (const b of bundles.values()) {
    // Highest urgency trigger wins the headline; full history preserved.
    b.triggers.sort((a, x) => tierFor(a.trigger_type) - tierFor(x.trigger_type))
    const top = b.triggers[0]
    const tier = tierFor(top.trigger_type)
    let zip = b.zip
    if (!zip && b.lat !== null && b.lng !== null) zip = await nearestZip(b.lat, b.lng, zipCache)
    if (!zip) { skippedNoZip++; continue }

    const tradeLabel = labelByKey.get([...b.tradeKeys][0]) ?? null
    const totalFine = b.triggers.reduce((acc, t) => acc + (t.fine ?? 0), 0) || null
    const respondents = b.triggers.map((t) => t.respondents).find(Boolean) ?? null

    rowsOut.push({
      street_address: b.street_address,
      city: 'Chicago',
      state: 'IL',
      zip,
      lat: b.lat,
      lng: b.lng,
      ...(respondents ? { owner_name: respondents.split('|')[0].trim() } : {}),
      source: 'permit',  // safest existing source value; trigger_type carries the truth
      source_event_date: top.date || new Date().toISOString(),
      source_details: {
        city: 'Chicago',
        provider: 'enforcement',
        trigger_type: top.trigger_type,
        urgency_tier: tier,
        urgency_label: urgencyLabel(top.trigger_type, { date: top.date, fine: totalFine, tradeLabel }),
        fine_total: totalFine,
        description: top.desc,
        trade_keys: [...b.tradeKeys],
        why_tags: whyTags(top.trigger_type, { fine: totalFine, date: top.date, desc: top.desc, historyCount: b.triggers.length }),
        history: b.triggers.slice(0, 8).map((t) => ({ type: t.trigger_type, date: t.date, desc: t.desc.slice(0, 120), fine: t.fine, ref: t.raw_id })),
      },
      lead_score: scoreForTier(tier),
      pitch_script: buildPitch(top.trigger_type, top.desc, { fine: totalFine, date: top.date }),
      trade_match: [...b.engineTrades],
    })
  }

  // Batched upsert; ignoreDuplicates keeps existing rows (no clobber).
  for (let i = 0; i < rowsOut.length; i += 100) {
    const batch = rowsOut.slice(i, i + 100)
    const { error } = await supabase
      .from('leads')
      .upsert(batch, { onConflict: 'street_address,source', ignoreDuplicates: true })
    if (error) counts.errors.push(`upsert: ${error.message}`)
    else inserted += batch.length
  }

  const summary = {
    fetched: counts,
    addresses_merged: bundles.size,
    skipped_no_zip: skippedNoZip,
    leads_upserted_or_dedup: inserted,
  }
  await recordCronFinish(cronRunId, counts.errors.length === 0, summary, startedAtMs)
  return NextResponse.json({ ok: true, source: 'chicago_enforcement', ...summary, checked_at: new Date().toISOString() })
}
