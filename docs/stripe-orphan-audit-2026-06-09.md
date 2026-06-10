# Stripe orphan-price audit — 2026-06-09

Task 3 of the offer-rebuild plan. Goals:
1. Archive orphaned $147 Starter and $597 Elite prices via API.
2. Verify no live customer route or link can reach a checkout using them.
3. Confirm FIRST400 applies to $497 in test mode.

## Reachability audit (DONE locally)

Verified in `src/lib/pricing.ts:357-359`:

```ts
export function isValidTier(t: string): t is Tier {
  return t === 'officemgr'
}
```

`/api/stripe/checkout/route.ts:98` falls back to `'officemgr'` if `body.tier` doesn't pass `isValidTier`. This means:

- ✅ A request like `{ tier: 'receptionist' }` is coerced to `'officemgr'` → the $147 Starter price is **unreachable** from the public checkout
- ✅ Similarly `{ tier: 'concierge' }` is coerced → $597 Elite is **unreachable**
- ✅ Direct construction of a checkout-session w/ orphan price IDs would need an admin path; grep shows none exist outside of legacy webhook lookup (`PRICE_TO_TIER` reverse map, which is read-only)

**Conclusion: $147 and $597 cannot be reached from new signups.** They exist only to keep grandfathered subscribers from breaking on renewal.

## Stripe API archive (BLOCKED on Peter)

`STRIPE_SECRET_KEY` is not in local `.env.local` (per session-memory record: "Peter created Stripe products via dashboard, never stored key locally"). The archive script must be run from a Stripe-keyed environment.

Script created: `scripts/stripe-archive-orphan-prices.ts`. To run:

```bash
vercel env pull .env.local           # pulls STRIPE_SECRET_KEY from Vercel project
npx tsx scripts/stripe-archive-orphan-prices.ts
```

The script will:
1. Set `price.active = false` on the 4 orphan price IDs (Starter monthly + annual, Elite monthly + annual). Does NOT delete — Stripe forbids deletion of prices that have ever been used in a subscription, and we want grandfathered receptionist/concierge renewals to keep clearing.
2. Look up the FIRST400 promotion_code, check it's still active, and print the first-month math (should be $497 - $400 = $97).

Until Peter runs the script, the Stripe Dashboard will still list these as Active. **No customer impact** — they're already unreachable in code — but the dashboard is noisy.

## FIRST400 verification (BLOCKED on same)

Same blocker. Script handles this verification; needs key.

## Orphan price IDs (for reference)

| Tier | Interval | Price ID | Amount |
|---|---|---|---|
| receptionist (Starter) | monthly | `price_1TaJOcGrkP7VQmUj8qSiEx2b` | $147 |
| receptionist (Starter) | annual | `price_1TaJOcGrkP7VQmUj4AMGChWp` | $1,460 |
| concierge (Elite) | monthly | `price_1TaJOdGrkP7VQmUjrLltX596` | $597 |
| concierge (Elite) | annual | `price_1TaJOdGrkP7VQmUja2CDmocA` | $5,970 |

Active V2 keepers:

| Tier | Interval | Price ID | Amount |
|---|---|---|---|
| officemgr (Pro) | monthly | `price_1TgUZFGrkP7VQmUjw9c5gEXv` | $497 |
| officemgr (Pro) | annual | `price_1TgUanGrkP7VQmUjujaifNI0` | $4,997 |

Active V1 (grandfathered, do NOT archive):

| Tier | Interval | Price ID | Amount |
|---|---|---|---|
| receptionist | monthly | `price_1TWTwsGrkP7VQmUjYdnvv7ZU` | $397 |
| officemgr | monthly | `price_1TWTwtGrkP7VQmUjKJ4Ka4MC` | $797 |
| concierge | monthly | `price_1TWTwuGrkP7VQmUj6lxFwVvd` | $1,997 |

These remain because real subscribers are renewing on them. Archiving would break their billing.
