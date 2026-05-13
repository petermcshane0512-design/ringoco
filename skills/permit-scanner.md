# Skill: Permit Scanner

Pull recent building permits from free open-data portals. Signal for: competitor activity (someone just hired an HVAC contractor for a property in our customer's service area), new construction (future maintenance contracts), and renovation booms.

## Sources (all free, no API key)
- **NYC** (Socrata): `data.cityofnewyork.us/resource/ipu4-2q9a.json` (DOB Permit Issuance)
- **Chicago** (Socrata): `data.cityofchicago.org/resource/ydr8-5enu.json` (Building Permits)
- **LA** (Socrata): `data.lacity.org/resource/yv23-pmwf.json` (Building & Safety Permits)
- **Atlanta** (ArcGIS): `services1.arcgis.com/.../Building_Permits/FeatureServer/0/query` — best-guess field map, retune when first Atlanta customer activates
- **Houston** (CKAN): `data.houstontx.gov/api/3/action/datastore_search` — exposes monthly aggregates more than per-record (limits per-property lead gen)
- **Phoenix** (CKAN): `phoenixopendata.com/api/3/action/datastore_search` — resource_id `1c61b4b2-1968-4c4b-8ff8-eb44f573e47a`

Socrata filter pattern: `?$where=issue_date > '{YYYY-MM-DD}'`.
ArcGIS filter: `?where=ISSUEDATE > DATE '{YYYY-MM-DD}'&f=json`.
CKAN filter: text query `?q={YYYY-MM-DD}` (CKAN datastore_search is full-text, not field-specific — narrows but doesn't precisely filter).

## Permit-type classification
Regex on `work_type` / `permit_subtype` / `work_description` fields:
- `hvac|mechanical|heating|cooling|a\/c|air condition` → hvac
- `plumb` → plumbing
- `electric` → electrical
- `roof` → roofing
- `new building|alteration|renovation|general` → general
- else → other (skipped)

## Implementation
`src/lib/marketing/permit-scanner.ts`. Function: `scanPermitsForCustomer({ supabase, userId, metro, zipFilter?, sinceDays? })`.

## Storage
Idempotent upsert to `permit_events`, key `(user_id, source, permit_id)`.

## Downstream
- Weekly strategy report surfaces "12 new HVAC permits in your service area this week" as competitor intel
- For Concierge customers with `concierge_settings.permits_enabled = true`, agent decides whether to convert to a lead (e.g. renovation permit in a ZIP we serve → outbound "Saw a permit was pulled near you — if you also need [trade], here's our number")

## Rate limits
Socrata public endpoints: ~1 req/sec sustainable without app token. Add `?$$app_token=` once we hit limits.
