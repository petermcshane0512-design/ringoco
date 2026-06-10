# Pricing rebuild report — 2026-06-09

P1–P5 of the pricing-fix brief. Five commits, all local, ready to push.

## Commits

| # | SHA | Subject |
|---|---|---|
| P1 | `09753e9` | Cap guarantee — kill unbounded 'until you book' liability |
| P2 | `84aa7ff` | Unambiguous billing copy + Stripe coupon config audit |
| P3 | `59fb67e` | Delete annual toggle — one plan one price |
| P4 | `2968eba` | Pricing bullets rewrite + reply-tracking audit + CTA sweep |
| P5 | (no diff) | Nav cleanup + /founder verdict — both already correct |

## Files changed

| File | P1 | P2 | P3 | P4 | P5 |
|---|---|---|---|---|---|
| `src/lib/offer.ts` | ✓ | | | | |
| `src/app/page.tsx` | ✓ | ✓ | | | |
| `src/app/pricing/page.tsx` | ✓ | ✓ | ✓ | ✓ | |
| `scripts/stripe-archive-orphan-prices.ts` | | | ✓ | | |
| `docs/stripe-coupon-config-2026-06-09.md` (new) | | ✓ | | | |
| `docs/pricing-rebuild-report-2026-06-09.md` (new) | | | | | ✓ |

## Stripe coupon configuration — Task 2 audit

Live verification BLOCKED on `STRIPE_SECRET_KEY` (not in local `.env.local`). Code expects FIRST400 to be:

| Field | Value |
|---|---|
| `coupon.amount_off` | **$400.00** (40000 cents) |
| `coupon.currency` | usd |
| `coupon.duration` | **once** — applies to first invoice only |
| `promotion_code.code` | FIRST400 |
| `promotion_code.active` | true |

Resulting math: `$497 - $400 = $97` first month. Month 2 onward bills the full $497 (because duration: once).

**Peter must run `scripts/stripe-archive-orphan-prices.ts` to verify against the live Stripe environment.** Script also archives the now-orphaned Pro annual price (`price_1TgUanGrkP7VQmUjujaifNI0`) per P3.

If the live coupon is NOT `duration: once`, copy needs to change to match billing — see `docs/stripe-coupon-config-2026-06-09.md` for the 3 options.

## Reply-tracking verdict — Task 4

`src/app/api/webhooks/instantly/reply/route.ts` EXISTS and is functional. BUT it tracks **cold-email replies from prospect contractors** (the cold-outreach funnel that targets HVAC/plumbing/electrical shop owners), not **homeowner replies to the outreach a customer sent**.

Customer-side homeowner-reply tracking does NOT exist. We don't route outreach through our system per the script-attached pivot ("preloaded scripts they send their leads however they want"). No inbound webhook listens for homeowner replies. No notification path back to the customer.

**Therefore the bullet "Phone notification the second a homeowner replies" was FALSE and was deleted.** Not just hidden — removed entirely from the pricing card bullet list.

## /founder verdict — Task 5

`src/app/founder/page.tsx` — 251 lines of REAL CURRENT content. Magazine layout, floated portrait of Peter, story about a handyman buddy struggling to find work, pivot to BellAveGo as lead-gen. Zero receptionist mentions. Rewritten 2026-06-09 in the leads-only pivot.

**KEEP the /founder nav link. No 301 needed.**

Minor in-scope-but-not-fixed issue: `src/app/founder/page.tsx:211` still has the phrase "our AI sends as you" which contradicts the script-attached pivot. Out of scope for this brief (pricing + offer config only). Flag for next sweep.

## Dashboard nav — Task 5

Both `/pricing` and homepage `Nav` already gate the Dashboard link behind `isSignedIn`. The link does NOT appear in the public marketing nav. ✅ Already correct, no changes needed.

`src/app/pricing/page.tsx:113-118`:
```tsx
{isSignedIn ? (
  <Link href="/dashboard" style={navCTABig}>Dashboard →</Link>
) : (
  <>
    <Link href="/sign-in" style={navLinkBig}>Sign in</Link>
    <Link href="/start?promo=FIRST400" style={navCTABig}>Get my first month — $97 →</Link>
  </>
)}
```

## Copy instances I could NOT confidently replace

Flag rather than guess:

### 1. `src/app/founder/page.tsx:211` — "our AI sends as you"
Stale post script-attached pivot. Out of brief scope (founder page not in pricing scope). Should be: "our AI writes scripts you can send" or similar.

### 2. `src/lib/hotReplyDraft.ts:60, 104` — "$297/mo flat" (multiple)
Stale admin reply helper template (used by sales-side hot-reply auto-drafts). Customer never sees this directly but it ships into outbound responses Peter sends to prospects. Should be updated to $497 + leads-only product. Out of brief scope. Internal/admin only.

### 3. `src/app/api/stripe/checkout/route.ts:116` — "$297 from month 2"
Code comment only. Does NOT affect billing because price IDs drive the actual charge. Flagged in `docs/stripe-coupon-config-2026-06-09.md`. Cosmetic cleanup.

### 4. `src/lib/seo/trades.ts` + cities — 300 receptionist SEO templates
Dead per T4 redirects (entire route family now 301s to /). Templates remain in `src/lib/seo/` but unused. Could be deleted in a future cleanup. Out of brief scope.

### 5. `src/app/affiliate/kit/[code]/page.tsx` — "30-day money-back" multiple times
Says money-back, doesn't make unbounded promises. Accurate statement, just not the new "1-Job Guarantee" branding. Out of brief scope (affiliate is not pricing + offer config).

### 6. `src/app/dashboard/cancel/page.tsx:105` — "30-day money-back guarantee" UI label
Internal dashboard label after a customer clicks cancel. Accurate, not in pricing scope.

### 7. `src/app/terms/page.tsx:64` — "30-day money-back guarantee" (legal binding)
Legal terms doc. Accurately describes the standard 30-day refund. Does NOT promise unbounded free months. Brief said "any email templates" — terms is not a template. Out of scope.

## Open follow-ups (you decide)

1. Run `vercel env pull .env.local && npx tsx scripts/stripe-archive-orphan-prices.ts` — verifies coupon, archives $147 + $597 + Pro annual prices
2. Push commits to production (current state: 5 commits ahead of origin/main, NOT pushed)
3. Decide whether to sweep stale copy in items 1-7 above next pass
4. Build real homeowner-reply tracking (would unlock the 'Phone notification' bullet legitimately)

## Visual diff summary

### Before
- Annual toggle w/ "SAVE $968" badge
- 8 bullets including "Phone notification when homeowner replies" (false) + "No setup, no phone numbers, no integration" + the guarantee bullet w/ unbounded language
- 🔥 emoji on the Founding-100 pill
- "Try $97 first month → Monthly" CTA
- "then $497/mo if it books you a job" subline
- Header: 30-day money-back + free month 2 until you book a job (unbounded)

### After
- One price card, no toggle
- 6 bullets per brief exact list
- Founding-100 price — $497/mo locked for life (no emoji, em-dash)
- "Get my first month — $97" CTA
- "$497/mo starting month 2. Didn't book a job in your first 30 days? Full refund and month 2 free." subline
- Header: The 1-Job Guarantee covers your first 30 days (capped)
