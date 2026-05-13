# Skill: Homeowner Lookup (new-homeowner lead source)

Find recently-moved-in homeowners in a Concierge customer's service area. New homeowners are the highest-converting home-services lead: budget, urgency, no existing vendor relationships.

## Provider abstraction (env-gated)

| Provider | Env var | Status | Notes |
|---|---|---|---|
| **BatchData** | `BATCHDATA_API_KEY` | ✅ Implemented | $99/mo entry. REST API. Recommended for v1. |
| BatchLeads | `BATCHLEADS_API_KEY` | Stub | $99/mo, similar API shape. Implement when needed. |
| PropStream | `PROPSTREAM_API_KEY` | Stub | $99/mo. Web-app primary — public REST API is reseller-only. |

Set ANY of the env vars and `isHomeownerLookupEnabled()` returns true; the agent starts using whichever provider key is set (BatchData wins if multiple).

## Implementation
`src/lib/marketing/homeowner-lookup.ts`. Two functions:
- `fetchRecentHomeowners({ zips, state?, sinceDays?, limit? })` — returns leads from configured provider
- `storeHomeownerLeads({ supabase, userId, leads, trade })` — inserts into `lead_lists` with auto-generated `service_hypothesis` per trade

## Reference

BatchData Property Search API:
```
POST https://api.batchdata.com/api/v1/property/search
Authorization: Bearer {BATCHDATA_API_KEY}
Body: {
  searchCriteria: {
    propertyAddress: { zip: ['30301', '30302'], state: 'GA' },
    ownership: { saleDateMin: '2026-03-12' }
  },
  options: { limit: 50, includeContacts: true }
}
```

## Downstream
Agent calls `fetchRecentHomeowners` weekly → `storeHomeownerLeads` → leads land in `lead_lists` with `source='new_homeowner'`. Same downstream campaign machinery as permit/weather leads.
