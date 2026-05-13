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

export type Metro = 'nyc' | 'chicago' | 'la' | 'atlanta' | 'houston'

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

const METRO_ADAPTERS: Record<Metro, (sinceIso: string) => Promise<PermitRecord[]>> = {
  nyc: fetchNyc,
  chicago: fetchChicago,
  la: fetchLa,
  atlanta: async () => { console.warn('[permit-scanner] atlanta adapter not yet implemented'); return [] },
  houston: async () => { console.warn('[permit-scanner] houston adapter not yet implemented'); return [] },
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
