# Skill: NOAA Weather Trigger

Pull severe-weather alerts for a Concierge customer's service area. Severe storms = HVAC/roofing/plumber leads in the next 48 hours.

## API
NOAA National Weather Service — `api.weather.gov` (free, no key).

```
GET https://api.weather.gov/alerts/active?area={STATE_CODE}
Headers: User-Agent: BellAveGo (peter@bellavego.com)
```

NWS requires a contact `User-Agent` header. Requests without one are rejected.

## Relevant event types (filter the noise)
- Severe Thunderstorm Warning, Tornado Warning
- Flash Flood / Flood Warning
- Winter Storm / Ice Storm Warning
- High Wind, Excessive Heat, Extreme Cold
- Hurricane Warning/Watch, Tropical Storm Warning

Skip Advisories, Watches (except Hurricane Watch), and Statements — too noisy.

## Severity filter
KEEP only `Severe` and `Extreme`. Drop `Moderate` and `Minor`.

## Geographic scoping
Alerts include `properties.geocode.SAME` — array of county FIPS codes (e.g. `'013121'` = Fulton County GA).
Customer's `concierge_settings.service_area_zips` → translate ZIP → county FIPS via HUD crosswalk for precision.
MVP: state-level scoping. Refine to county-level when precision matters.

## Implementation
`src/lib/marketing/weather-trigger.ts`. Function: `pollAndStoreAlertsForCustomer({ supabase, userId, stateCode, serviceCountyFips? })`.

## Storage
Idempotent upsert to `weather_triggers` keyed by `(user_id, noaa_alert_id)`.

## Downstream trigger
When a new severe alert lands, `marketing-ops-agent` queues a reactivation drip to all past customers in the affected ZIPs ("Storm just hit — our crew can be there same-day if you need a tarp / heat / drain unclog").
