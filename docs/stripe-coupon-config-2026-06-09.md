# Stripe FIRST400 coupon configuration — P2 verification

Per task brief: "Report exactly how the coupon is configured (duration, amount) so copy and billing provably agree."

## What the code expects FIRST400 to be

`src/app/api/stripe/checkout/route.ts:113-167` attaches the promotion_code to the Checkout Session via:

```ts
discounts: [{ promotion_code: promoLookup.promotionCodeId }]
```

with `allow_promotion_codes: true` as a fallback if pre-apply fails.

For the $97-first-month math to land on the $497 monthly price, the underlying coupon MUST be configured as:

| Field | Value |
|---|---|
| `coupon.amount_off` | **40000** (i.e. $400.00) |
| `coupon.currency` | **usd** |
| `coupon.duration` | **once** — applies to ONLY the first invoice |
| `coupon.duration_in_months` | (n/a when duration=once) |
| `coupon.max_redemptions` | optional, no cap is fine for our cold-email funnel |
| `promotion_code.code` | **FIRST400** (case-insensitive at the API level) |
| `promotion_code.active` | **true** |

Resulting first-invoice math:
```
$497.00 monthly price
- $400.00 FIRST400 amount_off
= $97.00 first charge
```

Month 2 onward: coupon does not re-apply (duration: once) so the subscription bills the full $497.00 automatically.

## Why this matches the new copy

Current customer-facing copy says:
- "$97 first month with code FIRST400"
- "$497/mo starting month 2"
- "Didn't book a job in your first 30 days? Full refund and month 2 free."

These statements are consistent with a `duration: once` configuration. If the coupon were configured `duration: repeating, duration_in_months: 2`, the customer would also pay $97 in month 2 — which would contradict the copy.

## Code stale comment (FYI, doesn't affect billing)

`src/app/api/stripe/checkout/route.ts:116`:
> "first-month promotion_code (Hormozi sub-$100 trip-wire — fan pays $97 first month, **$297** from month 2)."

The $297 reference is stale (we moved to $497 with v9 pricing in `src/lib/pricing.ts`). Comment only — does not affect billing because the actual price ID drives the charge. Will update in a future cleanup pass.

## Verification BLOCKED on Stripe key

`STRIPE_SECRET_KEY` is not in local `.env.local`. To verify the live coupon config, Peter must run:

```bash
vercel env pull .env.local
npx tsx scripts/stripe-archive-orphan-prices.ts
```

The script (created in T3, commit `cbc1e10`) prints:
- promotion_code `FIRST400` id + active flag
- coupon id + amount_off (in dollars) + duration
- The Pro price $497 active flag
- Math check: `monthly - off = $97` (warns if drift)

Until run, **the configuration above is what the code expects but has NOT been observed against the live Stripe environment in this audit.**

## If the live coupon turns out to be wrong

If `coupon.duration !== 'once'`, the copy needs to change to match billing (NOT the other way around — never silently change a coupon mid-flight). Options:
1. Coupon = `forever` → say "$97/mo, capped while you stay subscribed" (and accept the margin hit)
2. Coupon = `repeating, duration_in_months: N` → say "$97 for your first N months"
3. Coupon = `once` (intended) → current copy is correct

## P2 deliverable summary

- Customer-facing copy SWEPT (homepage + pricing) to "$497/mo starting month 2 · Didn't book a job in your first 30 days? Full refund and month 2 free."
- Code expected coupon configuration documented above
- Live Stripe verification BLOCKED on Peter running the script
