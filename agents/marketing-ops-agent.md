# Agent: Marketing Ops Agent (Concierge tier)

Orchestrates the weekly AI Marketing Operations run for one Concierge customer.

## When it runs
- **Scheduled**: Monday 06:00 UTC via `api/crons/marketing-ops-weekly` (one invocation per active Concierge customer)
- **On-demand**: `runMarketingOpsForCustomer({ userId })` from `src/lib/marketing/agent.ts`

## Step order (deterministic, errors don't abort)
1. Gate: profile.is_active && plan_tier === 'concierge'
2. `weather-trigger` — poll NOAA NWS for severe alerts in customer's state (free)
3. `permit-scanner` — pull recent permits from customer's metro (free, ~5 metros supported)
4. `competitor-watcher` — daily snapshot of each tracked competitor (Google Places API)
5. `ad-creative-generator` — 6 new ad creatives mined from this week's call transcripts (Claude)
6. `local-seo-publisher` — 1 new blog post targeting "best {trade} {city}", auto-publish to WP/Webflow (Claude)
7. `reactivation-campaign` — conditional: fires only if a severe weather event landed this week, drips SMS to dormant customers
8. `strategy-report` — gather all week's data, Claude writes McKinsey-style narrative, store
9. `notify` — SMS + email customer with link to `/r/{reportId}`

## Failure handling
Each step wrapped in `safeRun(name, fn)`. One step failing surfaces as `{ ok: false, error: ... }` in the run result — does not abort the rest. The weekly report still ships even if 3 of 7 inputs failed; the narrative explicitly notes data gaps.

## Cost per run
- Weather poll: free
- Permits: free
- Competitor watcher: ~$0.05 (Google Places, 5 calls × $0.01)
- Ad creatives: ~$0.02 (Claude Sonnet 4.6)
- SEO post: ~$0.04 (Claude Sonnet 4.6, 2K tokens)
- Reactivation: variable (Twilio SMS at $0.008/msg)
- Strategy report: ~$0.05 (Claude Sonnet 4.6, 2K tokens output)
- **Total per run**: ~$0.20 in third-party costs, customer charged $1,997/mo

## Output
`AgentRunResult` includes per-step `{ ok, detail | error }`, plus `reportUrl` and `notified.sms/email` flags.
Persisted to `agent_runs.notes` for audit.
