/**
 * NOAA NWS active-alerts poller. Free, no API key required.
 *
 * Filters incoming alerts to (a) severity ∈ {Severe, Extreme}, (b) event type
 * relevant to home services (storms, freezes, floods → roofing/HVAC/plumber leads).
 * Writes each matching alert to weather_triggers, idempotent on (user_id, noaa_alert_id).
 *
 * Called by:
 *  - api/crons/marketing-ops-weekly (per Elite-tier customer)
 *  - agents/marketing-ops-agent (on-demand)
 *
 * NWS requires a contact User-Agent. Do not remove the header.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const NWS_BASE = 'https://api.weather.gov'
const NWS_UA = 'BellAveGo (peter@bellavego.com)'

export type NwsAlert = {
  id: string
  event: string
  severity: string
  effective: string
  expires: string
  headline: string
  description: string
  affectedSameCodes: string[]
  state: string
}

const RELEVANT_EVENTS = new Set<string>([
  'Severe Thunderstorm Warning',
  'Tornado Warning',
  'Flash Flood Warning',
  'Flood Warning',
  'Winter Storm Warning',
  'Ice Storm Warning',
  'High Wind Warning',
  'Excessive Heat Warning',
  'Extreme Cold Warning',
  'Hurricane Warning',
  'Hurricane Watch',
  'Tropical Storm Warning',
])

export async function fetchActiveAlertsForState(stateCode: string): Promise<NwsAlert[]> {
  const res = await fetch(`${NWS_BASE}/alerts/active?area=${stateCode}`, {
    headers: { 'User-Agent': NWS_UA, Accept: 'application/geo+json' },
  })
  if (!res.ok) throw new Error(`NWS alerts fetch failed: ${res.status}`)
  const json = (await res.json()) as { features?: Array<{ id: string; properties: Record<string, unknown> }> }
  return (json.features ?? []).map(f => {
    const p = f.properties as {
      event?: string
      severity?: string
      effective?: string
      expires?: string
      headline?: string
      description?: string
      geocode?: { SAME?: string[] }
    }
    return {
      id: f.id,
      event: p.event ?? '',
      severity: p.severity ?? '',
      effective: p.effective ?? new Date().toISOString(),
      expires: p.expires ?? new Date(Date.now() + 6 * 3600_000).toISOString(),
      headline: p.headline ?? '',
      description: p.description ?? '',
      affectedSameCodes: p.geocode?.SAME ?? [],
      state: stateCode,
    }
  })
}

export function isLeadGenRelevant(alert: NwsAlert): boolean {
  if (!RELEVANT_EVENTS.has(alert.event)) return false
  if (alert.severity !== 'Severe' && alert.severity !== 'Extreme') return false
  return true
}

export type StoreResult = { stored: number; skipped: number; alerts: NwsAlert[] }

/**
 * Pulls all severe-active alerts for the customer's state, filters relevance,
 * optionally narrows to specific county FIPS codes (more precise), upserts to
 * weather_triggers. Returns counts + the kept alerts for downstream campaigns.
 */
export async function pollAndStoreAlertsForCustomer(args: {
  supabase: SupabaseClient
  userId: string
  stateCode: string
  serviceCountyFips?: string[]
}): Promise<StoreResult> {
  const allAlerts = await fetchActiveAlertsForState(args.stateCode)
  const relevant = allAlerts.filter(isLeadGenRelevant)
  const scoped = args.serviceCountyFips?.length
    ? relevant.filter(a => a.affectedSameCodes.some(c => args.serviceCountyFips!.includes(c)))
    : relevant

  let stored = 0
  let skipped = 0
  for (const alert of scoped) {
    const { error } = await args.supabase
      .from('weather_triggers')
      .upsert(
        {
          user_id: args.userId,
          noaa_alert_id: alert.id,
          event_type: alert.event,
          severity: alert.severity.toLowerCase(),
          starts_at: alert.effective,
          ends_at: alert.expires,
          affected_zips: [],
          payload: alert,
        },
        { onConflict: 'user_id,noaa_alert_id', ignoreDuplicates: true },
      )
    if (error) {
      console.error('[weather-trigger] upsert error:', error.message)
      skipped++
    } else {
      stored++
    }
  }
  return { stored, skipped, alerts: scoped }
}
