/**
 * County / city building-permit scanner. Free open-data portals only.
 *
 * Each metro has a different Socrata API and column schema. Adapters below normalize
 * to a common PermitRecord shape. Writes to permit_events table, idempotent on
 * (user_id, source, permit_id).
 *
 * Why permits matter: a new HVAC/plumbing/electrical/roofing permit in the customer's
 * service area is signal. Residential install = they hired someone (competitor intel +
 * "did the install go well?" follow-up opportunity 6 months later). New construction =
 * future maintenance contract.
 *
 * Adapters live in this file for now (one per metro). Add new metros by writing a new
 * adapter + adding to METRO_ADAPTERS. No abstraction layer until 5+ metros are real.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type Metro = 'nyc' | 'chicago' | 'la' | 'atlanta' | 'houston' | 'phoenix'

export type PermitRecord = {
  source: Metro
  permitId: string
  permitType: 'hvac' | 'plumbing' | 'electrical' | 'roofing' | 'general' | 'other'
  propertyAddress: string
  propertyZip?: string
  permitValueCents?: number
  issuedAt: string  // ISO date
  raw: Record<string, unknown>
}

// Free Socrata endpoints. App tokens are optional but raise rate limits — add if hit.
const NYC_DOB_PERMITS = 'https://data.cityofnewyork.us/resource/ipu4-2q9a.json'
const CHICAGO_PERMITS = 'https://data.cityofchicago.org/resource/ydr8-5enu.json'
const LA_PERMITS = 'https://data.lacity.org/resource/yv23-pmwf.json'

// CKAN-style endpoints for cities without Socrata. Same JSON shape via datastore_search.
const HOUSTON_PERMITS_CKAN = 'https://data.houstontx.gov/api/3/action/datastore_search'
const HOUSTON_RESOURCE_ID = 'residential-building-permits'  // TODO: replace with actual UUID once a Houston customer onboards — current value is the dataset slug, exact resource_id may differ
const PHOENIX_PERMITS_CKAN = 'https://www.phoenixopendata.com/api/3/action/datastore_search'
const PHOENIX_RESOURCE_ID = '1c61b4b2-1968-4c4b-8ff8-eb44f573e47a'  // Phoenix, AZ Building Permit Data

// ArcGIS FeatureServer for Atlanta (city uses ArcGIS Hub, not Socrata/CKAN).
const ATLANTA_PERMITS_ARCGIS = 'https://services1.arcgis.com/Ug6cqRSRMcRdvnHc/arcgis/rest/services/Building_Permits/FeatureServer/0/query'

function classifyPermitType(text: string): PermitRecord['permitType'] {
  const t = text.toLowerCase()
  if (/hvac|mechanical|heating|cooling|a\/c|air condition/.test(t)) return 'hvac'
  if (/plumb/.test(t)) return 'plumbing'
  if (/electric/.test(t)) return 'electrical'
  if (/roof/.test(t)) return 'roofing'
  if (/new building|alteration|renovation|general/.test(t)) return 'general'
  return 'other'
}

async function fetchNyc(sinceIso: string): Promise<PermitRecord[]> {
  const url = `${NYC_DOB_PERMITS}?$where=issuance_date > '${sinceIso}'&$limit=500&$order=issuance_date DESC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`NYC permits fetch failed: ${res.status}`)
  const rows = (await res.json()) as Array<Record<string, string>>
  return rows.map(r => ({
    source: 'nyc' as const,
    permitId: r.job_filing_number ?? r.permit_si_no ?? `${r.bin}-${r.issuance_date}`,
    permitType: classifyPermitType(`${r.work_type ?? ''} ${r.permit_subtype ?? ''}`),
    propertyAddress: [r.house_no, r.street_name, r.borough].filter(Boolean).join(' '),
    propertyZip: r.zip_code,
    permitValueCents: r.estimated_job_costs ? Math.round(parseFloat(r.estimated_job_costs) * 100) : undefined,
    issuedAt: r.issuance_date ?? new Date().toISOString(),
    raw: r,
  }))
}

async function fetchChicago(sinceIso: string): Promise<PermitRecord[]> {
  const url = `${CHICAGO_PERMITS}?$where=issue_date > '${sinceIso}'&$limit=500&$order=issue_date DESC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Chicago permits fetch failed: ${res.status}`)
  const rows = (await res.json()) as Array<Record<string, string>>
  return rows.map(r => ({
    source: 'chicago' as const,
    permitId: r.permit_ ?? r.id ?? `${r.address}-${r.issue_date}`,
    permitType: classifyPermitType(`${r.permit_type ?? ''} ${r.work_description ?? ''}`),
    propertyAddress: r.street_name ? `${r.street_number ?? ''} ${r.street_direction ?? ''} ${r.street_name} ${r.suffix ?? ''}`.trim() : (r.address ?? ''),
    propertyZip: undefined,
    permitValueCents: r.reported_cost ? Math.round(parseFloat(r.reported_cost) * 100) : undefined,
    issuedAt: r.issue_date ?? new Date().toISOString(),
    raw: r,
  }))
}

async function fetchLa(sinceIso: string): Promise<PermitRecord[]> {
  const url = `${LA_PERMITS}?$where=issue_date > '${sinceIso}'&$limit=500&$order=issue_date DESC`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`LA permits fetch failed: ${res.status}`)
  const rows = (await res.json()) as Array<Record<string, string>>
  return rows.map(r => ({
    source: 'la' as const,
    permitId: r.pcis_permit_ ?? r.permit_ ?? `${r.address_start}-${r.issue_date}`,
    permitType: classifyPermitType(`${r.permit_type ?? ''} ${r.permit_sub_type ?? ''} ${r.work_description ?? ''}`),
    propertyAddress: `${r.address_start ?? ''} ${r.street_direction ?? ''} ${r.street_name ?? ''} ${r.street_suffix ?? ''}`.trim(),
    propertyZip: r.zip_code,
    permitValueCents: r.valuation ? Math.round(parseFloat(r.valuation) * 100) : undefined,
    issuedAt: r.issue_date ?? new Date().toISOString(),
    raw: r,
  }))
}

async function fetchAtlanta(sinceIso: string): Promise<PermitRecord[]> {
  // ArcGIS query: where=ISSUEDATE > 'YYYY-MM-DD', outFields=*, f=json
  // Field names below are best-guess from common Atlanta DPCD schemas. Will need a
  // pass when an Elite-tier customer in Atlanta activates and we see live data.
  const sinceDate = sinceIso.split('T')[0]
  const url = `${ATLANTA_PERMITS_ARCGIS}?where=${encodeURIComponent(`ISSUEDATE > DATE '${sinceDate}'`)}&outFields=*&resultRecordCount=500&orderByFields=${encodeURIComponent('ISSUEDATE DESC')}&f=json`
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    console.warn(`[permit-scanner] Atlanta fetch network error: ${e instanceof Error ? e.message : e}`)
    return []
  }
  if (!res.ok) {
    console.warn(`[permit-scanner] Atlanta ${res.status} — may need schema retune`)
    return []
  }
  const json = (await res.json()) as { features?: Array<{ attributes: Record<string, unknown> }> }
  return (json.features ?? []).map(f => {
    const a = f.attributes
    const get = (k: string) => (a[k] ?? a[k.toLowerCase()] ?? a[k.toUpperCase()]) as string | undefined
    const issued = get('ISSUEDATE') ?? get('ISSUE_DATE') ?? get('issue_date') ?? new Date().toISOString()
    const issuedDate = typeof issued === 'number' ? new Date(issued as number).toISOString() : String(issued)
    return {
      source: 'atlanta' as const,
      permitId: String(get('PERMITNUMBER') ?? get('PERMIT_NUMBER') ?? get('OBJECTID') ?? `${get('ADDRESS') ?? 'x'}-${issuedDate}`),
      permitType: classifyPermitType(`${get('PERMITTYPE') ?? get('PERMIT_TYPE') ?? ''} ${get('PERMITSUBTYPE') ?? ''} ${get('DESCRIPTION') ?? ''}`),
      propertyAddress: String(get('ADDRESS') ?? get('LOCATION') ?? ''),
      propertyZip: get('ZIP') ?? get('ZIPCODE'),
      permitValueCents: get('VALUE') || get('JOBVALUE') ? Math.round(parseFloat(String(get('VALUE') ?? get('JOBVALUE'))) * 100) : undefined,
      issuedAt: issuedDate,
      raw: a,
    }
  })
}

async function fetchHouston(sinceIso: string): Promise<PermitRecord[]> {
  // CKAN datastore_search. Houston exposes residential permits as monthly aggregates rather
  // than per-record, which limits per-property lead-gen. We still pull what's available.
  const sinceDate = sinceIso.split('T')[0]
  const url = `${HOUSTON_PERMITS_CKAN}?resource_id=${HOUSTON_RESOURCE_ID}&limit=500&q=${encodeURIComponent(sinceDate)}`
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    console.warn(`[permit-scanner] Houston fetch network error: ${e instanceof Error ? e.message : e}`)
    return []
  }
  if (!res.ok) {
    console.warn(`[permit-scanner] Houston ${res.status} — likely needs resource_id update`)
    return []
  }
  const json = (await res.json()) as { result?: { records?: Array<Record<string, unknown>> } }
  const records = json.result?.records ?? []
  return records.map(r => {
    const get = (k: string) => (r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]) as string | undefined
    const issued = get('issue_date') ?? get('IssuedDate') ?? new Date().toISOString()
    return {
      source: 'houston' as const,
      permitId: String(get('permit_number') ?? get('PermitNumber') ?? `${get('address') ?? 'x'}-${issued}`),
      permitType: classifyPermitType(`${get('permit_type') ?? ''} ${get('work_description') ?? get('description') ?? ''}`),
      propertyAddress: String(get('address') ?? get('Address') ?? ''),
      propertyZip: get('zip') ?? get('zip_code'),
      permitValueCents: get('value') ? Math.round(parseFloat(String(get('value'))) * 100) : undefined,
      issuedAt: String(issued),
      raw: r,
    }
  })
}

async function fetchPhoenix(sinceIso: string): Promise<PermitRecord[]> {
  // CKAN datastore_search against Phoenix's known resource ID.
  const sinceDate = sinceIso.split('T')[0]
  const url = `${PHOENIX_PERMITS_CKAN}?resource_id=${PHOENIX_RESOURCE_ID}&limit=500&q=${encodeURIComponent(sinceDate)}`
  let res
  try {
    res = await fetch(url)
  } catch (e) {
    console.warn(`[permit-scanner] Phoenix fetch network error: ${e instanceof Error ? e.message : e}`)
    return []
  }
  if (!res.ok) {
    console.warn(`[permit-scanner] Phoenix ${res.status} — may need resource_id refresh`)
    return []
  }
  const json = (await res.json()) as { result?: { records?: Array<Record<string, unknown>> } }
  const records = json.result?.records ?? []
  return records.map(r => {
    const get = (k: string) => (r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()]) as string | undefined
    const issued = get('PermitIssuedDate') ?? get('issue_date') ?? get('permit_issued_date') ?? new Date().toISOString()
    return {
      source: 'phoenix' as const,
      permitId: String(get('PermitNumber') ?? get('permit_number') ?? `${get('SiteAddress') ?? get('address') ?? 'x'}-${issued}`),
      permitType: classifyPermitType(`${get('PermitType') ?? get('permit_type') ?? ''} ${get('WorkClass') ?? ''} ${get('Description') ?? ''}`),
      propertyAddress: String(get('SiteAddress') ?? get('address') ?? ''),
      propertyZip: get('SiteZip') ?? get('zip'),
      permitValueCents: get('JobValuation') ? Math.round(parseFloat(String(get('JobValuation'))) * 100) : undefined,
      issuedAt: String(issued),
      raw: r,
    }
  })
}

const METRO_ADAPTERS: Record<Metro, (sinceIso: string) => Promise<PermitRecord[]>> = {
  nyc: fetchNyc,
  chicago: fetchChicago,
  la: fetchLa,
  atlanta: fetchAtlanta,
  houston: fetchHouston,
  phoenix: fetchPhoenix,
}

export type ScanResult = { stored: number; skipped: number; metro: Metro; total: number }

export async function scanPermitsForCustomer(args: {
  supabase: SupabaseClient
  userId: string
  metro: Metro
  zipFilter?: string[]
  sinceDays?: number
}): Promise<ScanResult> {
  const since = new Date(Date.now() - (args.sinceDays ?? 7) * 24 * 3600_000).toISOString().split('T')[0]
  const adapter = METRO_ADAPTERS[args.metro]
  if (!adapter) throw new Error(`No adapter for metro: ${args.metro}`)

  const allRecords = await adapter(since)
  const scoped = args.zipFilter?.length
    ? allRecords.filter(r => r.propertyZip && args.zipFilter!.includes(r.propertyZip))
    : allRecords
  const relevant = scoped.filter(r => r.permitType !== 'other')

  let stored = 0
  let skipped = 0
  for (const p of relevant) {
    const { error } = await args.supabase.from('permit_events').upsert(
      {
        user_id: args.userId,
        permit_id: p.permitId,
        source: p.source,
        permit_type: p.permitType,
        property_address: p.propertyAddress,
        property_zip: p.propertyZip,
        permit_value_cents: p.permitValueCents,
        issued_at: p.issuedAt.split('T')[0],
        payload: p.raw,
      },
      { onConflict: 'user_id,source,permit_id', ignoreDuplicates: true },
    )
    if (error) {
      console.error('[permit-scanner] upsert error:', error.message)
      skipped++
    } else {
      stored++
    }
  }
  return { stored, skipped, metro: args.metro, total: relevant.length }
}
