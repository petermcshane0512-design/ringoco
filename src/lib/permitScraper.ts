import { createClient } from '@supabase/supabase-js'

/**
 * Shared Socrata permit scraper. Each city's cron supplies a config object
 * matching the city's field names; the helper handles fetch, classify,
 * lat/lng → ZIP, score, dedup, batch upsert.
 *
 * Why shared: every Sun Belt city scraper is structurally identical
 * (Chicago, Austin, Dallas, NYC, Seattle, SF all use Socrata). Per-city
 * routes were diverging fast — one source of truth instead.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export type PermitConfig = {
  cityLabel: string         // shown in lead's street_address suffix
  socrataUrl: string        // base resource URL (no query params)
  // Field names vary per city. Pull what's available.
  fields: {
    issueDate: string       // ISO date
    workDescription: string // free text
    permitType?: string     // optional category
    cost?: string           // reported_cost / value / job_cost
    streetNumber?: string
    streetName?: string
    streetDirection?: string
    fullAddress?: string    // some APIs return one combined field
    // Geo: prefer a direct ZIP field. Fall back to lat/lng → nearest-centroid
    // lookup if zip field absent. Austin/Dallas have ZIP directly; Chicago/
    // NYC have lat/lng only.
    zip?: string
    latitude?: string
    longitude?: string
    contractorPhone?: string // captured into source_details when available
  }
  // SoQL $where date filter column name (defaults to fields.issueDate)
  dateColumn?: string
}

type RawPermit = Record<string, string | number | null | undefined>

const TRADE_RE = {
  hvac:       /\b(hvac|mechanical|a\/?c|air condition|furnace|heat pump|cooling|boiler)\b/i,
  plumbing:   /\b(plumb|water heater|gas line|sewer|drain|toilet|bath)\b/i,
  electrical: /\b(electric|panel|service upgrade|ev charger|solar|wiring|lighting)\b/i,
  roofing:    /\b(roof|shingle|reroof|skylight|gutter)\b/i,
  handyman:   /\b(porch|deck|fence|garage|handyman|general|repair|renovat|remodel)\b/i,
  newConstr:  /\b(new construction|sfr|single family|multi-family|residential new)\b/i,
}

function classifyTrades(blob: string): string[] {
  const trades = new Set<string>()
  if (TRADE_RE.hvac.test(blob)) trades.add('hvac')
  if (TRADE_RE.plumbing.test(blob)) trades.add('plumbing')
  if (TRADE_RE.electrical.test(blob)) trades.add('electrical')
  if (TRADE_RE.roofing.test(blob)) trades.add('roofing')
  if (TRADE_RE.handyman.test(blob)) trades.add('handyman')
  if (TRADE_RE.newConstr.test(blob)) {
    trades.add('hvac')
    trades.add('plumbing')
    trades.add('electrical')
  }
  return [...trades]
}

async function nearestZip(lat: number, lng: number): Promise<string | null> {
  const { data: candidates } = await supabase
    .from('zip_centroids')
    .select('zip, lat, lng')
    .gte('lat', lat - 0.5)
    .lte('lat', lat + 0.5)
    .gte('lng', lng - 0.5)
    .lte('lng', lng + 0.5)
  if (!candidates || candidates.length === 0) return null
  let bestZip: string | null = null
  let bestDist = Infinity
  for (const c of candidates as Array<{ zip: string; lat: number; lng: number }>) {
    const d = Math.hypot(c.lat - lat, c.lng - lng)
    if (d < bestDist) {
      bestDist = d
      bestZip = c.zip
    }
  }
  return bestZip
}

function scorePermit(cost: number, issueDateIso: string | null, tradeCount: number): number {
  let s = 50
  if (cost > 50000) s += 20
  else if (cost > 10000) s += 12
  else if (cost > 1000) s += 6
  if (issueDateIso) {
    const ageDays = (Date.now() - new Date(issueDateIso).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays < 30) s += 15
    else if (ageDays < 90) s += 8
  }
  if (tradeCount >= 3) s += 5
  return Math.min(100, s)
}

function buildAddress(p: RawPermit, cfg: PermitConfig): string {
  if (cfg.fields.fullAddress && p[cfg.fields.fullAddress]) {
    return String(p[cfg.fields.fullAddress]).trim()
  }
  const parts = [
    cfg.fields.streetNumber ? p[cfg.fields.streetNumber] : '',
    cfg.fields.streetDirection ? p[cfg.fields.streetDirection] : '',
    cfg.fields.streetName ? p[cfg.fields.streetName] : '',
  ].filter(Boolean)
  return parts.join(' ').trim() || `${cfg.cityLabel} permit`
}

export type ScrapeResult = {
  ok: boolean
  city: string
  permits_fetched: number
  permits_classified: number
  skipped_no_trade: number
  skipped_no_geo: number
  leads_inserted_or_dedup: number
  error?: string
}

export async function scrapeCityPermits(cfg: PermitConfig, opts: { lookbackDays?: number; limit?: number } = {}): Promise<ScrapeResult> {
  const lookbackDays = opts.lookbackDays ?? 14
  const limit = Math.min(2000, opts.limit ?? 500)
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateCol = cfg.dateColumn ?? cfg.fields.issueDate

  const fetchUrl = `${cfg.socrataUrl}?$where=${encodeURIComponent(`${dateCol} >= '${since}'`)}&$limit=${limit}&$order=${dateCol} DESC`

  let raw: RawPermit[] = []
  try {
    const r = await fetch(fetchUrl)
    if (!r.ok) return { ok: false, city: cfg.cityLabel, permits_fetched: 0, permits_classified: 0, skipped_no_trade: 0, skipped_no_geo: 0, leads_inserted_or_dedup: 0, error: `HTTP ${r.status}` }
    raw = await r.json()
  } catch (e) {
    return { ok: false, city: cfg.cityLabel, permits_fetched: 0, permits_classified: 0, skipped_no_trade: 0, skipped_no_geo: 0, leads_inserted_or_dedup: 0, error: (e as Error).message }
  }

  let classified = 0, inserted = 0, skippedNoTrade = 0, skippedNoGeo = 0
  const leadRows: Array<Record<string, unknown>> = []

  for (const p of raw) {
    const work = String(p[cfg.fields.workDescription] || '')
    const type = cfg.fields.permitType ? String(p[cfg.fields.permitType] || '') : ''
    const trades = classifyTrades(`${type} ${work}`)
    if (trades.length === 0) { skippedNoTrade++; continue }

    // Geo resolution: prefer direct ZIP, fall back to lat/lng → nearest centroid.
    let zip: string | null = null
    if (cfg.fields.zip && p[cfg.fields.zip]) {
      const z = String(p[cfg.fields.zip]).slice(0, 5)
      if (/^\d{5}$/.test(z)) zip = z
    }
    if (!zip && cfg.fields.latitude && cfg.fields.longitude) {
      const lat = Number(p[cfg.fields.latitude])
      const lng = Number(p[cfg.fields.longitude])
      if (isFinite(lat) && isFinite(lng)) {
        zip = await nearestZip(lat, lng)
      }
    }
    if (!zip) { skippedNoGeo++; continue }

    const cost = cfg.fields.cost ? Number(p[cfg.fields.cost] || 0) : 0
    const issue = p[cfg.fields.issueDate] ? String(p[cfg.fields.issueDate]) : null
    const contractorPhone = cfg.fields.contractorPhone ? String(p[cfg.fields.contractorPhone] || '').trim() : ''

    classified++
    leadRows.push({
      street_address: `${buildAddress(p, cfg)} · ${cfg.cityLabel}`,
      zip,
      source: 'permit',
      source_event_date: issue || new Date().toISOString(),
      source_details: {
        city: cfg.cityLabel,
        permit_type: type || null,
        work_description: work.slice(0, 240),
        reported_cost: cost || null,
        issue_date: issue,
        contractor_phone: contractorPhone || undefined,
      },
      lead_score: scorePermit(cost, issue, trades.length),
      trade_match: trades,
    })

    if (leadRows.length >= 100) {
      const batch = leadRows.splice(0)
      const { error } = await supabase.from('leads').upsert(batch, { onConflict: 'street_address,source', ignoreDuplicates: true })
      if (!error) inserted += batch.length
    }
  }

  if (leadRows.length > 0) {
    const batch = [...leadRows]
    const { error } = await supabase.from('leads').upsert(batch, { onConflict: 'street_address,source', ignoreDuplicates: true })
    if (!error) inserted += batch.length
  }

  return {
    ok: true, city: cfg.cityLabel,
    permits_fetched: raw.length,
    permits_classified: classified,
    skipped_no_trade: skippedNoTrade,
    skipped_no_geo: skippedNoGeo,
    leads_inserted_or_dedup: inserted,
  }
}
