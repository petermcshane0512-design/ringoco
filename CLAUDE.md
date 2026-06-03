@AGENTS.md

---

# OPERATING SYSTEM — BellAveGo

## AGENT & SKILL LIBRARY

Reusable skills and agent workflows live in:
- `skills/` — atomic, single-purpose tools (one API, one job)
- `agents/` — multi-step workflows that compose skills

Available skills: `google-maps-search`, `apollo-enrich`, `instantly-push-leads`, `instantly-analytics`, `supabase-query`, `stripe-usage-report`

**REMOVED 2026-06-03:** `ig-fb-engager` skill + `scripts/social-engage.ts` permanently deleted. The Playwright-based IG/FB auto-engagement triggered Meta's automation detection and got `bellavegollc` Business Manager restricted on 2026-05-25. NEVER rebuild any automation that touches Facebook or Instagram via browser automation, API, or any other channel. All future Meta presence is paid ads only (Ads Manager UI).

Available agents: `lead-sourcing`, `campaign-monitor`, `reply-handler`, `email-researcher`, `business-diagnostic`

When running an agent, load its `.md` file and the skills it references. Do not rebuild logic already defined there.

---

Every decision made in this codebase operates from two frameworks: **The Algorithm** and **The Idiot Index**. No exceptions. Run them in order. Always.

---

## AGENT DELEGATION MODEL

Before spawning any agent, assign it the right model:

| Model | Use When |
|---|---|
| **Opus** | Maximum reasoning required: architecture decisions, business strategy, applying the Algorithm, first-principles analysis, complex debugging across multiple systems, anything that requires judgment over trade-offs |
| **Sonnet** | Everyday work: writing features, refactoring, code review, standard debugging, most coding tasks |
| **Haiku** | Small non-reasoning tasks: formatting, renaming, simple lookups, grep/search delegation, single-file edits with clear specs |

Default: if uncertain, go one level up. Never use Haiku for anything that requires understanding context.

---

## FRAMEWORK 1: THE ALGORITHM

*Source: Walter Isaacson, Elon Musk (2023). Verbatim from "The Algorithm" chapter. Applied at Tesla, SpaceX, and every Musk venture.*

### The 5 Steps — IN THIS ORDER. Always.

**STEP 1 — Question every requirement.**
> "Each should come with the name of the person who made it. You should never accept that a requirement came from a department, such as from 'the legal department' or 'the safety department.' You need to know the name of the real person who made that requirement. Then you should question it, no matter how smart that person is. Requirements from smart people are the most dangerous, because people are less likely to question them. Always do so, even if the requirement came from me. Then make the requirements less dumb."

**STEP 2 — Delete any part or process you can.**
> "You may have to add them back later. In fact, if you do not end up adding back at least 10% of them, then you didn't delete enough."

**STEP 3 — Simplify and optimize.**
> "This should come after step two. A common mistake is to simplify and optimize a part or a process that should not exist."

**STEP 4 — Accelerate cycle time.**
> "Every process can be speeded up. But only do this after you have followed the first three steps. In the Tesla factory, I mistakenly spent a lot of time accelerating processes that I later realized should have been deleted."

**STEP 5 — Automate.**
> "That comes last. The big mistake in Nevada and at Fremont was that I began by trying to automate every step. We should have waited until all the requirements had been questioned, parts and processes deleted, and the bugs were shaken out."

### The Hard Rules

- **The order is mandatory.** The most common error of a smart engineer is to optimize something that should not exist. Do not jump to step 3 or 5.
- **"The best part is no part. The best process is no process. It weighs nothing. Costs nothing. Can't go wrong."**
- If you aren't adding back ~10% of what you deleted, you didn't cut deep enough.
- Requirements from smart people are the most dangerous — they go unchallenged.

### The Corollaries

- All technical managers must have hands-on experience in what they manage.
- Comradery is dangerous — it makes it hard to challenge each other's work.
- It's OK to be wrong. Never be confident and wrong.
- A maniacal sense of urgency is the operating principle.
- The only rules are the ones dictated by the laws of physics. Everything else is a recommendation.

---

## FRAMEWORK 2: THE IDIOT INDEX

*Source: Walter Isaacson, Elon Musk (2023). Developed on the flight back from Russia after the failed ICBM purchase — the insight that founded SpaceX.*

### Definition (verbatim, Isaacson)
> "Musk developed what he called an 'idiot index,' which calculated how much more costly a finished product was than the cost of its basic materials. If a product had a high idiot index — for example, one that cost $1,000 when the aluminum that composed it cost only $100 — it was likely to have a design that was too complex or a manufacturing process that was too inefficient. As Musk put it, 'If the ratio is high, you're an idiot.'"

### Formula

**Idiot Index = Finished cost ÷ Raw material cost**

- Low (close to 1): efficient, near the physics floor
- High (10x+): over-engineered, over-priced, or inefficient — opportunity
- In SaaS: finished cost = what you charge or spend. Raw cost = minimum API/infra cost to deliver that function.

### How to Use It

1. **Make-vs-buy decisions** — high index on a supplier part means build it in-house
2. **Pricing decisions** — high customer ROI relative to your price = you're undercharging
3. **Feature decisions** — high dev cost vs. value delivered = delete it
4. **Disruption hunting** — an entire industry with a high idiot index and weak differentiation is ripe to attack

### The Pairing Rule

The Idiot Index **finds** the targets. The Algorithm **fixes** them. Always run them together:
- Index identifies the waste
- Algorithm, in order, eliminates it without creating new waste

---

## BELLAVEGO — ALGORITHM APPLIED (First-Principles Analysis, May 2026)

*Run by Opus agent. Treat as living document — update when decisions change.*

### The Product in Ten Words
"An AI that answers your missed calls and books the job."

### Idiot Index: Current State

| Item | Finished Cost | Raw Cost | Index | Verdict |
|---|---|---|---|---|
| Per-customer delivery (calls, SMS, AI) | usage-based bundle | ~$0.09/call raw | ~5x at mid-tier | Healthy margin, scales with usage |
| Consulting reports (AI-generated) | included in plan | ~$0.01/report in API tokens | ~1000x | Keep — zero marginal cost, high retention value |
| Custom voice orchestration (if built) | Months of dev time | $0.07/min via Vapi | ~50x | **Use Vapi/Retell if rebuilding voice layer** |
| Pricing vs. customer ROI | ~$89/mo avg | Contractor recovers $350–$1,200/missed job | ~50x in customer's favor | **Raise prices over time as retention proves** |
| Invoicing UI (if custom-built) | Days of dev | One Stripe API call | ~20x | **Delete — use Stripe Payment Links** |
| Clerk auth for end-user homeowners | Complexity + cost | Zero — homeowners never log in | Infinite | **Delete** |

**Atomic cost per call (verified May 2026):**
- Twilio inbound: $0.0085/min × 5min avg = $0.043
- Twilio STT: ~$0.020/call
- Twilio SMS (2 outbound): $0.016
- Claude Sonnet API: ~$0.015/call
- **Total: ~$0.094/call | ~$0.019/minute**

### What the Algorithm Says to DELETE (Step 2)

These were questioned and cut. Do not rebuild them without an explicit paying customer request:

1. **Consulting reports as manual deliverables** — AI-generates them automatically from Supabase data (call_logs → jobs → invoices). No Peter time. Monthly revenue intelligence report is a core product feature and moat — do not delete the feature, delete the manual labor.
2. **Custom invoicing UI** — Replaced by a single "Send payment link" button (~40 lines of code, one Stripe API call, one Twilio SMS). No invoice editor, no templates, no history UI.
3. **Every calendar integration except Google Calendar** — Add others only when a paying customer asks by name.
4. **Clerk for end-user homeowners** — Homeowners get a text link. They never log in.
5. **Admin analytics tab** — Contractors look once. Delete.
6. **Multi-language, voicemail transcription, sentiment analysis, call recording UI** — Delete. Not in the 5-call demo.

**KEPT (previously marked for deletion — reversed May 2026):**
- **YES/NO contractor SMS approval** — Kept. Contractors need control over what gets booked. Auto-book is a trust problem with new customers.
- **Consulting reports** — Kept as AI-generated feature. It IS the moat. Competitors won't bother.

### What SIMPLIFIES (Step 3)

- One intake prompt. One model. One voice. No A/B testing personas before customers exist.
- ≤6 questions per call: name, address, phone, problem, urgency, preferred window.
- One structured-output Claude call returning a JSON booking object. One round trip.
- Pipeline: Twilio → Vapi → webhook → Supabase insert → Twilio SMS confirmation. Five hops max.
- Multi-tenancy = one `customer_id` column on every table + one Twilio number per customer. Not a platform.

### What ACCELERATES (Step 4)

- Target: 90 seconds from ring to booking-confirmed text. Measure it. Fix if broken.
- Deploy frequency: every hour while iterating with first 3 customers.
- Do not preemptively optimize Vercel cold-start unless measured P95 > 800ms.

### What AUTOMATES (Step 5 — only after 1-4 are clean)

- New contractor onboarding: Twilio number purchase, business profile, A2P 10DLC, calendar OAuth. **Only after manually onboarding 10 customers.**
- Billing via Stripe Subscriptions. **Only after 10 customers.**
- Churn alerts. **Only after 10 customers.**
- Do NOT automate AI quality monitoring, prompt auto-tuning, or self-healing call flows. These are procrastination disguised as engineering.

### Unquestioned Requirements — Interrogate These

Every one of these has been embedded as an assumption. Challenge them before acting on them:

1. **"Home services contractors are the right ICP."** Have you compared willingness-to-pay vs. med spas, dentists, law firms, salons?
2. **"They want an AI receptionist."** They want more booked jobs. AI is a delivery mechanism, not their requirement.
3. **"$97/month is the right price."** Test $197 and $297 with the next 3 prospects first.
4. **"Quarterly reports differentiate us."** They make BellAveGo look like a consulting firm. Delete the framing.
5. **"24/7 uptime is the requirement."** The real requirement: answer when the contractor can't. Simpler constraint.
6. **"I should be coding right now."** At 0 ARR, your bottleneck is distribution, not engineering. 70% sales, 30% code.
7. **"Invoicing is a pillar."** Stripe built invoicing. Why rebuild it?
8. **"I need full multi-tenant architecture before customer #2."** You need `customer_id` + one Twilio number. That's it.
9. **"My competitors are Rosie and Goodcall."** Real competitor: voicemail and the contractor's wife.
10. **"$1M ARR by 2028."** Is this first-principles or a round number? Real target: 10 paying customers by end of Q3 2026 at $197+/mo. Prove the model first.

### Correct Build Sequence (The Algorithm Applied to the Roadmap)

| Phase | What | When |
|---|---|---|
| **Phase 0 — Unblock** | Multi-tenant Twilio (gate to first sale). Metered Stripe billing. usage_events table in Supabase. | Now |
| **Phase 1 — Sell** | 10 paying contractors via manual outreach. Usage-based pricing live. Business diagnostic on signup. | Weeks 1-8 |
| **Phase 2 — Automate Outreach** | Instantly pipeline running. Lead sourcing agent daily. Campaign monitor weekly. | Weeks 4-12 |
| **Phase 3 — Accelerate** | AI-generated consulting reports live. Revenue intelligence dashboard. Onboarding < 10 min. | Months 3-6 |
| **Phase 4 — Automate Ops** | Self-serve onboarding, churn alerts, auto-renewal. | Months 6-12 |
| **Phase 5 — Scale** | 342 customers at ~$97 avg = $400K ARR. 800 customers = $1M ARR. | Year 2 |

**Pricing model (v8, May 23 2026 — defined in `src/lib/pricing.ts`):**
- **Starter: $147/mo** (slug `receptionist`) → **60 calls/mo cap**, $0 setup, 6 AI consulting reports/yr. Cap is the upgrade pump to Pro.
- **Pro: $297/mo** (slug `officemgr`) → **300 calls/mo cap**, $0 setup, 12 reports/yr + Quote Hunter / Collections / Reviews / Reputation / Smart Insights
- **Elite: $597/mo** (slug `concierge`) → unlimited calls, $0 setup, 24 bi-weekly consulting reports + custom integrations (Jobber/Housecall Pro/ServiceTitan) + 4-hour priority SLA + direct founder access for first 90 days. **Waitlist-only until 3 Pro customers exist.**
- **Multi-Location: $2,497/loc + $25K setup** — enterprise, founder-led sale (unchanged)
- **Annual plans**: ~17% off (Starter $1,460/yr · Pro $2,970/yr · Elite $5,970/yr)
- **Tier slugs UNCHANGED**: `receptionist`, `officemgr`, `concierge`. Only display labels + prices changed. Zero data migration needed.
- **Stripe price IDs**: v8 (`price_1TaJOc...` family) hardcoded in `PRICE_IDS_V2`. v7 ($397/$797/$1,997) preserved in `PRICE_IDS_V1` + `PRICE_TO_TIER` for grandfathered subscribers. v6 ($179/$497/$997) also still in `PRICE_TO_TIER`. Old self-serve page preserved at `/pricing-legacy`.
- **Feature flag**: `PRICING_VERSION` env var ('v1_legacy' | 'v2_new', default v2_new). Flip to v1_legacy in Vercel to roll back. See `docs/pricing-rollback.md` for the full procedure.
- Consulting reports cadence in `src/lib/reportCadence.ts`: Starter 6/yr, Pro 12/yr, Elite 24/yr bi-weekly (cadence still keyed off slug)

### Five Things That Matter (Everything Else is Noise)

1. Multi-tenant Twilio — ✅ shipped May 2026, auto-provisioned on Stripe checkout via `provisionNumberForUser`
2. Stripe billing live — ✅ shipped, three-tier subscription + auto-suspend on payment failure
3. AI-generated revenue intelligence report — this IS the moat, not the call answering
4. AI Marketing Operations agent (Elite tier) — Phase 1 of build, see tasks #1–#12
5. 70% of time selling, not coding, until 10 paying customers exist

---

## CRITICAL ARCHITECTURE WARNINGS

- **`src/app/api/twilio/voice/route.ts` is LIVE answering real calls** — never modify without explicit instruction and a tested fallback. Look-up by `twilio_number` column on `profiles` (multi-tenant since May 2026).
- **RLS is disabled on `profiles`, `jobs`, `customers`, and most tables** — intentional. Isolation is enforced by `auth()` + `.eq('user_id', userId)` in **server routes only**. Client pages MUST NOT use the anon Supabase key for tenant-scoped reads — they leak across tenants. Use server API routes (see `/api/jobs/list`, `/api/customers/list` pattern).
- **Profile saves go through `/api/profile`** using Supabase service role key, not user JWT
- **All Stripe price IDs + tier-gate sets centralized in `src/lib/pricing.ts`** — DO NOT inline `new Set(['officemgr', ...])` in route files. Import `OFFICE_MGR_TIERS`, `RECEPTIONIST_TIERS`, `REVIEW_TIERS`, `PRICE_IDS`, `PRICE_TO_TIER` from there.
- **All `/api/admin/*` and `/api/agents/*` routes MUST start with `await requireAdmin()` from `src/lib/auth/requireAdmin.ts`** — never inline an `auth() + clerkClient + email allowlist` block. The helper accepts two auth modes and fails closed; a hand-rolled check is the exact footgun this exists to prevent (enrich-leads was fail-open for months because the inline check skipped when `ADMIN_API_SECRET` was unset). Pattern:
  ```ts
  import { requireAdmin } from '@/lib/auth/requireAdmin'
  export async function POST(req: NextRequest) {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    // ... handler
  }
  ```
- **Dual-auth contract for admin routes:** `requireAdmin` accepts EITHER (a) `x-admin-secret: $ADMIN_API_SECRET` header — for cron, scripts, curl, CI; compared timing-safe; fails closed if env var unset — OR (b) a Clerk session whose **verified** email is in `ADMIN_EMAIL_SET`. Header path is checked first. Every successful auth logs `[requireAdmin] authorized mode=admin_secret` or `mode=clerk_session email=…` so usage can be audited from Vercel logs.
- **Admin allowlist lives in `process.env.ADMIN_EMAILS`** (comma-separated, lowercased). Source of truth is `src/lib/auth/requireAdmin.ts`; `effectiveAuth.ts` re-exports `ADMIN_EMAIL_SET` from there for back-compat. DO NOT hardcode `['pmcshane@fordham.edu', ...]` in any new file — import or read the env var. The Clerk-session path checks against EVERY verified email on the user, not `emailAddresses[0]` (Clerk's array order isn't contractually primary-first).
- **`/api/admin/sample-report` is intentionally public** — it's a sales artifact, sent to prospects as a PDF over cold calls. Do not add `requireAdmin()` to it. The doc-comment at the top of the route documents this contract.
- **Security env vars** (all stored in Vercel → Settings → Environment Variables → Production+Preview+Development):
  - `ADMIN_API_SECRET` — 48-char hex, generated via `crypto.randomBytes(24).toString('hex')`. Rotate if leaked.
  - `ADMIN_EMAILS` — comma-separated, e.g. `pmcshane@fordham.edu,peter@bellavego.com`. Falls back to hardcoded default if unset, with a `console.warn` visible in Vercel logs.
  - `CLERK_WEBHOOK_SECRET` — `whsec_…` from Clerk dashboard → Configure → Webhooks → endpoint detail → Signing Secret. Verified via `svix` in `/api/webhooks/clerk` (already correct as of 2026-05-21, do not strip).
- **Image files with spaces in filenames** (e.g. `workflow 0.png`) may not render in Next.js — rename to `workflow-0.png` style or URL-encode references

---

## WHAT PETER WANTS

- PowerShell only — never bash
- Short direct responses — no fluff, no summaries of what just happened
- "Now what" = give the next concrete step with the actual command
- Run git commands without being asked: `git add [files]; git commit -m "..."; git push origin main`
- Read the full file before editing — never assume content
- Code inline — never "download this file"
