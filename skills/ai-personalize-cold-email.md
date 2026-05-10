# Skill: AI-personalize cold email

Generates per-recipient personalized email fragments via Claude Haiku 4.5.
Used by the cold-email pipeline before pushing leads to Instantly.

## When it's used

- During `agents/lead-sourcing.md` daily run, after Apollo + Google Places enrichment, before Instantly push.
- Optionally re-runnable for refresh on warm leads via `/api/agents/enrich-leads` with `dryRun: true`.

## Code

- **Module:** `src/lib/personalizeEmail.ts`
- **Public functions:**
  - `personalizeForLead(lead: EnrichedLead) → PersonalizedFragments` (single)
  - `personalizeBatch(leads: EnrichedLead[], concurrency = 5) → Array<{ lead, fragments }>` (batched)

## Cost

- Claude Haiku 4.5: ~$0.005/lead (≈600 input + 150 output tokens)
- 40,000 emails/mo personalization budget: **~$200/mo**

## Output schema (`PersonalizedFragments`)

```ts
{
  opening: string             // 1-2 sentences, references one specific data point
  competitorRef?: string      // optional, named local competitor angle
  roiMath: string             // 2-3 lines computing missed-call revenue at THEIR volume
  reviewHook?: string         // optional, only if a complaint review exists
  closingHook: string         // 1-line CTA pointing to demo number
}
```

## Instantly merge tags produced

- `{{ai_opening}}` ← `opening`
- `{{ai_competitor_ref}}` ← `competitorRef`
- `{{ai_roi_math}}` ← `roiMath`
- `{{ai_review_hook}}` ← `reviewHook`
- `{{ai_closing_hook}}` ← `closingHook`

These plus the static Apollo/Places fields (`{{first_name}}`, `{{business_name}}`, `{{city}}`, `{{review_count}}`, `{{top_competitor_name}}`, `{{estimated_missed_calls}}`, `{{estimated_missed_revenue}}`) cover all 5 emails in `go-to-market/03-cold-email-fear-loss.md`.

## Quality guardrails baked in

The system prompt explicitly forbids:
- Generic AI-sounding phrasing
- Words: "leverage", "synergy", "robust", "solution"
- More than one em-dash per fragment
- Total output > 400 characters across all fragments

If Claude returns malformed JSON or fails entirely, fallback static templates fire so the pipeline never blocks.

## Tone target

Match the founder's voice in `go-to-market/06-cold-call-script.md`: short sentences, contractor-native vocabulary ("shop" not "business", "truck" not "vehicle"), 20-year-old founder energy, no SaaS-bro language.

## Dependencies

- `@anthropic-ai/sdk` (already in package.json)
- `ANTHROPIC_API_KEY` env var (already set)
- No additional API keys needed (Apollo + Places live in `lib/leadEnrichment.ts`)

## Tested via

```bash
curl -X POST https://www.bellavego.com/api/agents/enrich-leads \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_API_SECRET" \
  -d '{
    "cities": [{"city": "Atlanta", "state": "GA"}],
    "trades": ["HVAC"],
    "perCityLimit": 5,
    "dryRun": true
  }'
```

`dryRun: true` returns the personalized payloads without pushing to Instantly — useful for spot-checking AI output before a campaign blast.
