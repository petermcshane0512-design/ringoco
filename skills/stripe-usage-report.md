# Skill: Stripe — Report Metered Usage

Report per-call usage to Stripe for usage-based billing.

## Context
BellAveGo uses Stripe metered billing. Each contractor has:
- A flat subscription item (base fee)
- A metered subscription item (per-call-bundle usage)

Both IDs are stored in `profiles.stripe_subscription_id` and `profiles.stripe_metered_item_id`.

## Report Usage After Each Call
```typescript
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

await stripe.subscriptionItems.createUsageRecord(
  profile.stripe_metered_item_id,
  {
    quantity: Math.ceil(call_duration_seconds / 60), // report in minutes
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment',
  }
)
```

Call this at the end of the Twilio voice route when `conversations.delete(callSid)` runs.

## Pricing Tiers (bundles — display to customer, not raw per-minute)
| Display | Internal unit | Stripe price ID |
|---|---|---|
| 200 calls/mo — $49 | 200 units | price_starter |
| 600 calls/mo — $89 | 600 units | price_growth |
| 1,500 calls/mo — $149 | 1500 units | price_scale |
| Overage | $0.25/call over limit | price_overage |

## What to Track in Supabase
After reporting to Stripe, insert into `usage_events`:
```sql
INSERT INTO usage_events 
  (profile_id, call_sid, duration_seconds, stripe_reported, created_at)
VALUES (?, ?, ?, true, now())
```

## Never
- Never double-report the same `call_sid` — check `stripe_reported = false` before inserting
- Never report before call ends — only on `BOOKING_COMPLETE` or call hangup
