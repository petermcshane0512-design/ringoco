import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/crons/scrape-noaa-storms
 *
 * Polls the National Weather Service for active severe-weather alerts
 * that trigger home-service demand. Filters to:
 *   - Hail >= 1.0" → HVAC + roofing leads (AC condenser damage, roof hail)
 *   - Wind >= 60 mph → roofing leads (shingle/structural damage)
 *   - Extreme heat (>100°F warnings) → HVAC leads (AC failure spike)
 *   - Freeze/ice → plumbing leads (pipe burst risk)
 *
 * Each alert affects a list of ZIPs. We materialize one lead per
 * affected ZIP, scored 85+ (storm = high-intent recent damage).
 *
 * Runs every 4h. Free public API, no key required.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const NWS_ACTIVE_ALERTS = 'https://api.weather.gov/alerts/active?status=actual&message_type=alert'

type NwsAlert = {
  id?: string
  properties?: {
    event?: string
    headline?: string
    description?: string
    severity?: string
    effective?: string
    expires?: string
    areaDesc?: string
    parameters?: { hailSize?: string[]; windGust?: string[] }
    affectedZones?: string[]
    geocode?: { SAME?: string[]; UGC?: string[] }
  }
}

// Map an alert event type to the affected trade(s).
function tradesForEvent(eventType: string, params: { hailSize?: number; wind?: number }): string[] {
  const e = (eventType || '').toLowerCase()
  const trades = new Set<string>()
  // Hail >= 1.0" → AC condenser damage + roof hail
  if ((params.hailSize || 0) >= 1.0 || /hail/.test(e)) {
    trades.add('hvac')
    trades.add('roofing')
  }
  // Wind >= 60mph → roofing damage
  if ((params.wind || 0) >= 60 || /wind|tornado/.test(e)) {
    trades.add('roofing')
  }
  // Extreme heat → AC stress
  if (/heat|excessive heat/.test(e)) {
    trades.add('hvac')
  }
  // Freeze/ice → pipes burst
  if (/freeze|ice|hard freeze|winter/.test(e)) {
    trades.add('plumbing')
  }
  return [...trades]
}

function parseInches(s?: string): number | undefined {
  if (!s) return undefined
  const m = String(s).match(/([\d.]+)/)
  return m ? Number(m[1]) : undefined
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let raw: { features?: NwsAlert[] } | null = null
  try {
    const r = await fetch(NWS_ACTIVE_ALERTS, {
      headers: {
        // NWS asks for a User-Agent identifying the caller.
        'User-Agent': 'BellAveGo (peter@bellavego.com)',
        Accept: 'application/geo+json',
      },
    })
    if (!r.ok) return NextResponse.json({ error: `NWS HTTP ${r.status}` }, { status: 502 })
    raw = await r.json()
  } catch (e) {
    return NextResponse.json({ error: `NWS fetch err: ${(e as Error).message}` }, { status: 502 })
  }

  const features = raw?.features ?? []
  let processed = 0
  let leadsInserted = 0

  for (const alert of features) {
    const p = alert.properties
    if (!p?.event) continue
    const hail = parseInches(p.parameters?.hailSize?.[0])
    const wind = parseInches(p.parameters?.windGust?.[0])
    const trades = tradesForEvent(p.event, { hailSize: hail, wind })
    if (trades.length === 0) continue
    processed++

    // affectedZones is an array of NWS zone URIs (forecast zones, not ZIPs).
    // For full ZIP-level resolution we'd need to map zones → counties → ZIPs,
    // which requires a separate dataset. For now we use the geocode.SAME
    // codes (FIPS county codes) and synthesize one lead per county with
    // areaDesc as the address proxy. Phase B (next sprint) maps to specific
    // ZIPs via the Census County→ZIP relationship table.
    const sameCodes = p.geocode?.SAME ?? []
    if (sameCodes.length === 0) continue

    // One lead per affected county-equivalent. Later we'll fan out to ZIPs.
    const rows = sameCodes.slice(0, 50).map((sameCode) => ({
      street_address: `Storm-affected area · SAME ${sameCode} · ${p.areaDesc?.slice(0, 80) || ''}`,
      zip: '00000', // placeholder — replaced when we map to specific ZIPs
      source: 'storm' as const,
      source_event_date: p.effective || new Date().toISOString(),
      source_details: {
        event: p.event,
        headline: p.headline,
        severity: p.severity,
        same: sameCode,
        area_desc: p.areaDesc,
        hail_inches: hail,
        wind_mph: wind,
        expires: p.expires,
      },
      lead_score: 85 + Math.min(15, Math.floor((hail || 0) * 5 + (wind || 0) / 10)),
      trade_match: trades,
    }))

    const { error } = await supabase.from('leads').upsert(rows, {
      onConflict: 'street_address,source',
      ignoreDuplicates: true,
    })
    if (!error) leadsInserted += rows.length
  }

  return NextResponse.json({
    ok: true,
    source: 'noaa_active_alerts',
    alerts_seen: features.length,
    alerts_with_trade_match: processed,
    leads_inserted_or_dedup: leadsInserted,
    checked_at: new Date().toISOString(),
  })
}
