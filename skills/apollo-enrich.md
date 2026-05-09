# Skill: Apollo Lead Enrichment

Enrich a contractor lead with owner name and email using Apollo.io API.

## API
Apollo People Search — match by company domain or phone.

```
POST https://api.apollo.io/api/v1/people/match
Headers: X-Api-Key: {APOLLO_API_KEY}
Body:
{
  "organization_domain": "{website_domain}",
  "first_name": "",
  "title": ["owner", "president", "founder", "CEO"]
}
```

Fallback if no domain:
```
POST https://api.apollo.io/api/v1/people/search
Body:
{
  "q_organization_name": "{business_name}",
  "person_titles": ["owner", "president"],
  "person_locations": ["{city}, {state}"]
}
```

## Enrichment Targets
Priority fields to extract:
- `first_name` — for personalization in email
- `email` — verified preferred
- `linkedin_url` — secondary contact if email bounces

## Email Validation
Only use emails with Apollo confidence score ≥ 80%.
Discard generic emails (info@, contact@, admin@) — these are not the owner.

## Alternatives (if Apollo too expensive)
- Hunter.io: `GET https://api.hunter.io/v2/domain-search?domain={domain}&api_key={key}`
- Prospeo: cheaper LinkedIn-based enrichment, $0.05/credit
- Skrapp.io: $0.04/credit at scale

## Output (append to lead record)
```json
{
  "owner_first_name": "",
  "owner_email": "",
  "email_confidence": 0,
  "linkedin_url": ""
}
```

## Cost Note
Apollo basic: ~$0.05–0.10/enriched lead. Budget: 500 leads/day = $25–50/day max.
