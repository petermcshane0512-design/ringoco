# Pricing rollback — v8 → v7

If v2 pricing (Starter $147 / Pro $297 / Elite $597, May 23 2026) tanks
conversion and you want to revert to v1 (Mission Control $397 / Operator
$797 / Concierge $1,997, May 12 2026), this is the procedure.

**Estimated time**: 5 minutes. No customer impact.

---

## What rollback affects vs. doesn't

| Surface | Behavior on rollback |
|---|---|
| `/api/stripe/checkout` price IDs | Auto-flips to v1 IDs (PRICE_IDS_V1) via `PRICING_VERSION` env |
| `RECEPTIONIST_CALL_CAP` | Auto-flips back to 250 (v1) instead of unlimited (v2) |
| Pricing page (`/pricing`) labels + displayed prices | **Manual edit required** — page hardcodes display strings |
| Homepage (`/`) tier cards labels + prices | **Manual edit required** — same reason |
| Dashboard tier labels (Settings, Setup, Reports, layout) | **Manual edit required** |
| Emma's sales prompt (voice quotes prices) | **Re-bake required** — see step 4 |
| Stripe webhook resolving customer plan | No action needed — `PRICE_TO_TIER` already maps BOTH v1 and v2 price IDs to the correct tier slug, so legacy customers (and v2 customers from before rollback) all keep working |
| Existing customers | **Zero impact** — they stay on whatever Stripe price + tier slug they originally paid through |

---

## Rollback steps

### Step 1 — Flip the env var (~30 sec)

In Vercel Dashboard → bellavego project → Settings → Environment Variables:

- Add or edit `PRICING_VERSION` with value `v1_legacy`
- Apply to production + preview + development
- Save

### Step 2 — Trigger a redeploy (~90 sec for Vercel)

Vercel Dashboard → Deployments → latest → three dots → **Redeploy** (use existing build cache for speed)

Or push any commit to `main` — auto-deploys.

After deploy goes READY:
- `/api/stripe/checkout` now uses v1 price IDs ($397/$797/$1,997)
- `RECEPTIONIST_CALL_CAP` is back to 250 for Mission Control
- Anyone signing up now lands on v1 pricing

### Step 3 — Revert display strings (`/pricing` + `/` + dashboard pages)

Easiest path: `git revert` the commit that introduced v2 (find via `git log --oneline | grep -i 'v8\|pricing'`).

```bash
git revert <commit-sha> -m 1
git push origin main
```

That reverts label edits in:
- `src/app/pricing/page.tsx` (PLANS array + disclaimers)
- `src/app/page.tsx` (homepage tier cards + footer caption)
- `src/app/layout.tsx` (meta description + JSON-LD offers)
- `src/app/dashboard/page.tsx` (TIER_BANNER_COPY + tier labels)
- `src/app/dashboard/settings/page.tsx` (TIER_LABELS)
- `src/app/dashboard/setup/page.tsx` (tierMeta function)
- `src/app/dashboard/reports/page.tsx` (cadence labels)
- `src/app/dashboard/office-manager/page.tsx` (Pro → Operator labels)
- `src/app/waitlist/page.tsx` (Elite → Concierge label + blurb)
- `src/components/{ConsultingShowcase,DashboardPreview,RoiCalculator}.tsx`
- `src/lib/supportKnowledge.ts` (cadence + cap answers)
- `src/lib/email.ts` (welcome email pricing line)
- `src/lib/marketing/strategy-report.ts` (quarterly prompt price ref)
- `CLAUDE.md` (project memory)

### Step 4 — Re-bake Emma's prompt to Vapi

The voice receptionist quotes prices verbatim from `renderSalesAgentPrompt()`
in `src/lib/vapi.ts`. After Step 3 reverts that function's content to v1
prices, push the new prompt to the live Vapi assistant:

```bash
VAPI_API_KEY=<key> node scripts/bake-sales-prompt-into-assistant.mjs
```

This PATCHes the Vapi assistant `cccc9db9-7a6b-4211-b6b1-a68de8e21458`
(env: `VAPI_ASSISTANT_ID`) with the reverted prompt. Verifies in <30s.

Test by calling `(651) 467-7829` and asking "what's your pricing" — Emma
should quote $397 / $797 / $1,997 again.

### Step 5 — Verify

1. Visit `/pricing` — should show Mission Control / Operator / Concierge with old prices.
2. Visit `/` (homepage) — same.
3. Sign up at the demo Clerk account → land in checkout → confirm v1 price.
4. Call demo line → Emma quotes v1 pricing.

---

## What v1 Stripe price IDs we revert to

`PRICE_IDS_V1` in `src/lib/pricing.ts` (preserved verbatim from v7 launch):

| Tier | Monthly | Annual | Setup |
|---|---|---|---|
| receptionist (Mission Control) | `price_1TWTwsGrkP7VQmUjYdnvv7ZU` | `price_1TWTwsGrkP7VQmUjVH673Rny` | `price_1TWTwtGrkP7VQmUjYXR4nQnX` |
| officemgr (Operator) | `price_1TWTwtGrkP7VQmUjKJ4Ka4MC` | `price_1TWTwtGrkP7VQmUjLD42uJFA` | `price_1TWTwuGrkP7VQmUjQ5ZzQzq2` |
| concierge (Concierge) | `price_1TWTwuGrkP7VQmUj6lxFwVvd` | `price_1TWTwvGrkP7VQmUjdrMbU1KF` | `price_1TWTwvGrkP7VQmUjwWZrApfx` |

These are LIVE in Stripe (the v8 launch did NOT archive them — see commit
introducing v2 for the rationale). Setup-fee price IDs are retained but
not used in checkout (setup fees are $0 in both v1 and v2 currently).

---

## Customers who paid at v8 prices ($147/$297) before rollback

They keep their Stripe subscription at the v8 price they signed up for.
Their `plan_tier` slug stays the same (`receptionist`/`officemgr`/`concierge`),
so all tier-gated features work normally. They just see whatever the
post-rollback display label says (e.g. "Mission Control") in their
dashboard, even though they're actually billed $147/mo as Starter.

If that creates confusion, the fix is `displayInfoForPriceId()` in
`src/lib/pricing.ts` — it resolves a Stripe price ID to the correct
historical display label (returns "Starter" for v8 price IDs even when
rolled back to v1 marketing). Dashboard plan-display surfaces could be
upgraded to use this if mixed-cohort confusion becomes a real issue.

---

## Forward-rollback (back to v2 after rolling back)

Reverse of step 1: set `PRICING_VERSION=v2_new` (or unset — defaults to v2).
Revert step 3 with `git revert` of the rollback commit. Re-run bake script.

The asymmetry: v2 prices ($147/$297/$597) are LIVE in Stripe permanently.
You can flip the env var any number of times in either direction without
needing to recreate Stripe products.

---

## Open: Vapi assistant config preservation

If you ever PATCH the Vapi assistant manually (e.g., editing prompts in
the Vapi dashboard), the next run of `scripts/bake-sales-prompt-into-assistant.mjs`
will OVERWRITE your manual edits. Bake script always wins. Don't keep
edits in Vapi dashboard that you also want in code.

---

## Files touched in the v8 launch (for reference)

See `git log --oneline -- src/lib/pricing.ts src/app/pricing/page.tsx`
to find the v8 launch commit. Reverting just those files is the
narrowest possible rollback (env-flag-only). Reverting all files in the
commit + the env flag is the FULL rollback.
