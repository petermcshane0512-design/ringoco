# Skill: Competitor Watcher (+ GBP read)

Daily snapshot of each competitor the customer is tracking on Google Maps. Surfaces deltas (new reviews, rating drift, sentiment themes) in the weekly strategy report.

Doubles as the customer's own GBP inspector — same API, different Place ID.

## API
Google Places API v1 (New Places API).

```
GET https://places.googleapis.com/v1/places/{PLACE_ID}
Headers:
  X-Goog-Api-Key: GOOGLE_MAPS_API_KEY
  X-Goog-FieldMask: id,displayName,rating,userRatingCount,reviews
```

Returns up to 5 most recent reviews. For older review history we'd need to crawl, which the New Places API does not support.

## Theme extraction
Lightweight regex pass on review text → themes like `pricing`, `timeliness`, `quality`, `demeanor`, `cleanliness`, `communication`. Not NLP — just enough for the agent to flag patterns ("3 of competitor's last 5 reviews mention slow response").

## Implementation
`src/lib/marketing/competitor-watcher.ts`. Functions:
- `watchCompetitorsForCustomer({ supabase, userId, competitorPlaceIds })` — daily run
- `inspectOwnGbp({ supabase, userId, googlePlaceId })` — read-only inspection

## Storage
`competitor_intel`, one row per (user_id, competitor_place_id, snapshot_date). Unique index prevents dupes.

## Pricing
Google Places API Essentials: ~$0.005–$0.017 per request. $200/mo free credit covers most usage. 5 competitors × 10 customers × 30 days = 1,500 req/mo — well within free tier.

## Downstream
- Weekly strategy report: "Competitor X had 4 new 5-star reviews this week, mostly mentioning 'fast response' — consider matching their response-time messaging in your ads."
- AI Account Manager alerts: rating drop on a competitor = an opportunity moment.
