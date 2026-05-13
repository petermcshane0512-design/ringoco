@AGENTS.md

---

# OPERATING SYSTEM — BellAveGo

## AGENT & SKILL LIBRARY

Reusable skills and agent workflows live in:
- `skills/` — atomic, single-purpose tools (one API, one job)
- `agents/` — multi-step workflows that compose skills

Available skills: `google-maps-search`, `apollo-enrich`, `instantly-push-leads`, `instantly-analytics`, `supabase-query`, `stripe-usage-report`

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

**Pricing model (v7, May 12 2026 — defined in `src/lib/pricing.ts`):**
- **Receptionist: $397/mo** → 250 calls/month, $250 setup, 6 AI consulting reports/yr
- **Office Manager: $797/mo** → unlimited calls, $500 setup, 12 reports/yr + Quote Hunter / Collections / Reviews / Reputation / Smart Insights
- **Concierge: $1,997/mo** → unlimited calls, $1,000 setup, 52 weekly strategy reports + 4 quarterly deep-dives, full AI Marketing Operations agent (ad creatives, lead sourcing, SEO, GBP watching, competitor intel, account manager)
- **Multi-Location: $2,497/loc + $25K setup** — enterprise, founder-led sale
- **Stripe price IDs**: `src/lib/pricing.ts` currently still holds the v6 IDs (the $179/$497/$997 ones). Public /pricing copy shows v7 amounts; CTAs route to `mailto:` until new Stripe prices are created in Dashboard and pasted into PRICE_IDS. Old self-serve flow preserved at `/pricing-legacy` for rollback.
- Consulting reports cadence in `src/lib/reportCadence.ts`: Receptionist 6/yr, OfficeMgr 12/yr, Concierge 4/yr quarterly (weekly handled by marketing-ops-weekly cron)

### Five Things That Matter (Everything Else is Noise)

1. Multi-tenant Twilio — ✅ shipped May 2026, auto-provisioned on Stripe checkout via `provisionNumberForUser`
2. Stripe billing live — ✅ shipped, three-tier subscription + auto-suspend on payment failure
3. AI-generated revenue intelligence report — this IS the moat, not the call answering
4. AI Marketing Operations agent (Concierge tier) — Phase 1 of build, see tasks #1–#12
5. 70% of time selling, not coding, until 10 paying customers exist

---

## CRITICAL ARCHITECTURE WARNINGS

- **`src/app/api/twilio/voice/route.ts` is LIVE answering real calls** — never modify without explicit instruction and a tested fallback. Look-up by `twilio_number` column on `profiles` (multi-tenant since May 2026).
- **RLS is disabled on `profiles`, `jobs`, `customers`, and most tables** — intentional. Isolation is enforced by `auth()` + `.eq('user_id', userId)` in **server routes only**. Client pages MUST NOT use the anon Supabase key for tenant-scoped reads — they leak across tenants. Use server API routes (see `/api/jobs/list`, `/api/customers/list` pattern).
- **Profile saves go through `/api/profile`** using Supabase service role key, not user JWT
- **All Stripe price IDs + tier-gate sets centralized in `src/lib/pricing.ts`** — DO NOT inline `new Set(['officemgr', ...])` in route files. Import `OFFICE_MGR_TIERS`, `RECEPTIONIST_TIERS`, `REVIEW_TIERS`, `PRICE_IDS`, `PRICE_TO_TIER` from there.
- **Image files with spaces in filenames** (e.g. `workflow 0.png`) may not render in Next.js — rename to `workflow-0.png` style or URL-encode references

---

## WHAT PETER WANTS

- PowerShell only — never bash
- Short direct responses — no fluff, no summaries of what just happened
- "Now what" = give the next concrete step with the actual command
- Run git commands without being asked: `git add [files]; git commit -m "..."; git push origin main`
- Read the full file before editing — never assume content
- Code inline — never "download this file"
