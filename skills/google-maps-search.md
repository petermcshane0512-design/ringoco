# Skill: Google Maps Lead Search

Search Google Maps for home service contractors in target metros.

## API
Google Maps Places API — Text Search endpoint.

```
GET https://maps.googleapis.com/maps/api/place/textsearch/json
  ?query={trade}+contractor+{city}+{state}
  &type=establishment
  &key={GOOGLE_MAPS_API_KEY}
```

## Target Trades
HVAC, plumbing, electrical, roofing, pest control, appliance repair, landscaping

## Target Markets (Priority Order)
1. Dallas-Fort Worth TX, Houston TX, Austin TX
2. Tampa FL, Orlando FL, Miami FL
3. Atlanta GA, Charlotte NC, Nashville TN

## ICP Filter (apply after each search)
KEEP if:
- 1–10 employees (infer from review count, website simplicity)
- No website or basic single-page site
- Personal phone = business phone (same number listed everywhere)
- No mention of "office hours" or "call our office"

SKIP if:
- Website has live chat or "book online" button (already has coverage)
- Listed on Jobber, ServiceTitan, or Housecall Pro integration pages
- 50+ Google reviews with consistent response patterns (has admin staff)

## Output Format (per lead)
```json
{
  "business_name": "",
  "owner_name": "",
  "phone": "",
  "website": "",
  "city": "",
  "state": "",
  "trade": "",
  "google_place_id": "",
  "review_count": 0,
  "rating": 0.0
}
```

## Rate Limits
- 1 request/second max
- 20 results per page, paginate with next_page_token
- Target: 50–100 leads per city per trade run
