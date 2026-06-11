/**
 * Homeowner lookup skill — finds NEW homeowners (recent property transfers)
 * in an Elite-tier customer's service area. New homeowners are the highest-converting
 * lead source for home services: they just made the biggest purchase of their life,
 * have budget, are urgently shopping for contractors, and have zero existing
 * vendor relationships.
 *
 * Provider abstraction so we can swap between BatchData / BatchLeads / PropStream
 * without rewriting the agent integration. Gated by env vars — code ships ready,
 * activates when Peter subscribes to one of these data feeds.
 *
 * Pricing reality (May 2026):
 *   - BatchData:    $99/mo entry, clean REST API, recommended for v1
 *   - BatchLeads:   $99/mo, similar
 *   - PropStream:   $99/mo flat, web-app primary (no public REST API — reseller-only)
 *
 * Recommend BatchData for MVP. Set BATCHDATA_API_KEY in Vercel and this turns on.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canSpendBatchData, logBatchDataSpend } from '@/lib/batchdataSpend'
import { batchdataKey } from '@/lib/skipTrace'

export type HomeownerLead = {
  ownerName: string | null
  ownerPhone: string | null
  ownerEmail: string | null
  address: string
  zip: string | null
  saleDate: string
  estimatedValueCents: number | null
  raw: Record<string, unknown>
}

export type LookupResult = {
  provider: string | null
  leads: HomeownerLead[]
  reason?: string
}

export function isHomeownerLookupEnabled(): boolean {
  return !!(process.env.BATCHDATA_API_KEY || process.env.PROPSTREAM_API_KEY || process.env.BATCHLEADS_API_KEY)
}

/**
 * Fetch recent-move-in homeowners in the customer's service ZIPs.
 * Returns up to `limit` leads from whichever provider is configured.
 */
export async function fetchRecentHomeowners(args: {
  zips: string[]
  state?: string
  sinceDays?: number
  limit?: number
}): Promise<LookupResult> {
  const sinceDays = args.sinceDays ?? 60
  const limit = Math.min(args.limit ?? 50, 200)

  if (process.env.BATCHDATA_API_KEY) {
    return fetchFromBatchData({ ...args, sinceDays, limit })
  }
  if (process.env.BATCHLEADS_API_KEY) {
    return fetchFromBatchLeads({ ...args, sinceDays, limit })
  }
  if (process.env.PROPSTREAM_API_KEY) {
    // PropStream API access is reseller-only; if you have credentials, fill in below.
    return { provider: 'propstream', leads: [], reason: 'PropStream API adapter not yet implemented — requires reseller credentials' }
  }
  return { provider: null, leads: [], reason: 'No homeowner data provider configured. Set BATCHDATA_API_KEY (or another) in Vercel env to activate.' }
}

async function fetchFromBatchData(args: {
  zips: string[]
  state?: string
  sinceDays: number
  limit: number
}): Promise<LookupResult> {
  const sinceDate = new Date(Date.now() - args.sinceDays * 24 * 3600_000).toISOString().split('T')[0]
  // BatchData Property Search API. Adjust fieldset to whatever your subscription unlocks.
  // Ref: https://docs.batchdata.com/reference/property-search
  // 2026-06-11 — spend cap armed (was an ungated raw fetch).
  const gate = await canSpendBatchData(args.limit * 5)
  if (!gate.ok) {
    return { provider: 'batchdata', leads: [], reason: `daily spend cap hit (${gate.spentTodayCents}/${gate.capCents}c)` }
  }
  try {
    const res = await fetch('https://api.batchdata.com/api/v1/property/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${batchdataKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        searchCriteria: {
          propertyAddress: { zip: args.zips, state: args.state },
          ownership: { saleDateMin: sinceDate },
        },
        options: { limit: args.limit, includeContacts: true },
      }),
    })
    if (!res.ok) {
      return { provider: 'batchdata', leads: [], reason: `BatchData ${res.status}: ${(await res.text()).slice(0, 200)}` }
    }
    const data = (await res.json()) as {
      results?: {
        properties?: Array<Record<string, unknown>>
      }
    }
    const properties = data.results?.properties ?? []
    await logBatchDataSpend({
      costCents: properties.length * 5,
      caller: 'fetchRecentHomeowners',
      context: { zips: args.zips, returned: properties.length },
      resultOk: true,
    })
    return {
      provider: 'batchdata',
      leads: properties.map(p => normalizeBatchDataProperty(p)),
    }
  } catch (e) {
    return { provider: 'batchdata', leads: [], reason: e instanceof Error ? e.message : String(e) }
  }
}

async function fetchFromBatchLeads(args: {
  zips: string[]
  state?: string
  sinceDays: number
  limit: number
}): Promise<LookupResult> {
  // Stub — BatchLeads has similar shape but different field names. Implement when needed.
  void args
  return { provider: 'batchleads', leads: [], reason: 'BatchLeads adapter not yet implemented' }
}

function normalizeBatchDataProperty(p: Record<string, unknown>): HomeownerLead {
  const owner = (p.owner ?? {}) as Record<string, unknown>
  const address = (p.propertyAddress ?? p.address ?? {}) as Record<string, unknown>
  const sale = (p.lastSale ?? p.ownership ?? {}) as Record<string, unknown>
  const contacts = (p.contacts ?? owner.contacts ?? []) as Array<Record<string, unknown>>
  const primaryContact = contacts[0] ?? {}
  const valuation = (p.valuation ?? p.value ?? {}) as Record<string, unknown>

  return {
    ownerName: (owner.fullName ?? `${owner.firstName ?? ''} ${owner.lastName ?? ''}`.trim()) as string,
    ownerPhone: (primaryContact.phone ?? primaryContact.phoneNumber ?? null) as string | null,
    ownerEmail: (primaryContact.email ?? null) as string | null,
    address: `${address.street ?? ''} ${address.city ?? ''} ${address.state ?? ''} ${address.zip ?? ''}`.replace(/\s+/g, ' ').trim(),
    zip: (address.zip ?? null) as string | null,
    saleDate: (sale.saleDate ?? sale.lastSaleDate ?? new Date().toISOString()) as string,
    estimatedValueCents: valuation.estimatedValue ? Math.round(parseFloat(String(valuation.estimatedValue)) * 100) : null,
    raw: p,
  }
}

/**
 * Convert homeowner leads to lead_lists rows and insert. Returns counts.
 * service_hypothesis is a one-liner the AI writes (later, in the agent) per trade.
 */
export async function storeHomeownerLeads(args: {
  supabase: SupabaseClient
  userId: string
  leads: HomeownerLead[]
  trade: string  // 'HVAC' | 'plumber' | etc. — used for service_hypothesis
}): Promise<{ stored: number; skipped: number }> {
  let stored = 0
  let skipped = 0
  for (const lead of args.leads) {
    if (!lead.ownerPhone && !lead.ownerEmail) {
      skipped++  // no way to contact, skip
      continue
    }
    const hypothesis = buildServiceHypothesis(args.trade, lead.saleDate)
    const { error } = await args.supabase.from('lead_lists').insert({
      user_id: args.userId,
      lead_source: 'new_homeowner',
      customer_name: lead.ownerName,
      customer_phone: lead.ownerPhone,
      customer_email: lead.ownerEmail,
      address: lead.address,
      zip: lead.zip,
      service_hypothesis: hypothesis,
    })
    if (error) {
      console.error('[homeowner-lookup] insert error:', error.message)
      skipped++
    } else {
      stored++
    }
  }
  return { stored, skipped }
}

function buildServiceHypothesis(trade: string, saleDate: string): string {
  const days = Math.floor((Date.now() - new Date(saleDate).getTime()) / (24 * 3600_000))
  const t = trade.toLowerCase()
  if (t.includes('hvac')) return `Closed ${days}d ago — most new homeowners pre-summer/winter need an HVAC inspection within 60 days`
  if (t.includes('plumb')) return `Closed ${days}d ago — first-month plumbing surprises (water heater age, drain function) are top homeowner pain`
  if (t.includes('electric')) return `Closed ${days}d ago — new homeowners often need panel/outlet upgrades within first 90 days`
  if (t.includes('roof')) return `Closed ${days}d ago — pre-occupancy roof inspection is a common new-homeowner ask`
  return `Closed ${days}d ago — new homeowner, high likelihood of needing ${trade} services soon`
}
