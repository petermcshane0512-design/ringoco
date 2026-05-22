# Per-tenant Vapi assistant architecture

**Status:** Designed, not yet implemented. Stub script lives at
`scripts/provision-tenant.mjs`.

**Decided:** 2026-05-22 after a multi-hour debugging session where the
shared-assistant + per-call override path proved unreliable on Vapi's
side. Documented here so the eventual implementer doesn't repeat
that loop.

---

## Why this pattern (not the shared-assistant + override pattern)

The "obvious" architecture is one shared Vapi assistant with per-call
`assistantOverrides` injected via the `/api/vapi/assistant-request`
webhook. We tried this. The webhook fires, our route returns the
correct override payload (verified by curl: 200 OK, full payload,
~500ms response time), but Vapi consistently fails to apply the
response — every recent call's `assistantOverrides` field comes back
empty in Vapi's `/call` API, and the actual conversation uses the
assistant's base config.

We tried:

- Removing the type-string gate (so any payload shape returns an override)
- Returning `{assistantId, assistantOverrides}` together
- Returning `{assistant: {...transient config...}}` (Vapi-format)
- Unbinding `assistantId` on the phone number (forces webhook usage)
- PATCHing `serverUrlSecret` on both the assistant and the phone number
- Loosening the signature verification on our route

None of it convinced Vapi to apply the override. The webhook
infrastructure is broken at the Vapi platform layer in some way we
couldn't determine without deeper Vapi-side support access.

**Pivot:** stop trying to share an assistant. Create one Vapi
assistant per contractor at signup time. Bake the personalized
prompt directly into that assistant's config. Bind the contractor's
Twilio number to that specific assistant. No webhook overrides needed
during a call.

---

## The architecture

```
Signup → Stripe checkout completes → Stripe webhook fires
   ↓
Stripe webhook (src/app/api/stripe/webhook/route.ts)
   ↓
Calls provisionTenant(userId)
   ↓
provisionTenant:
   1. Load profile row from Supabase by user_id
   2. Render personalized system prompt via renderSystemPrompt(tenant)
   3. POST /assistant on Vapi API with:
        - name           → `BellAveGo · {business_name}`
        - firstMessage   → "Hi, this is {ai_name} with {business_name}. {owner_first_name} is out on a job — how can I help?"
        - model.messages → [{role:'system', content: rendered prompt}]
        - tools          → [take_message, check_availability, book_appointment]
        - voice          → { provider:'cartesia', voiceId: profile.ai_voice_id || default }
        - server.url     → /api/vapi/end-of-call-report  (for take_message + end-of-call events)
   4. POST /phone-number on Vapi API:
        - number          → contractor's E.164 Twilio number (already purchased)
        - assistantId     → the new assistant's id
        - serverUrl       → /api/vapi/end-of-call-report  (legacy, not strictly required)
   5. UPDATE profiles SET vapi_assistant_id = <new id> WHERE user_id = ?

When an inbound call lands:
   - Twilio routes to Vapi
   - Vapi sees phone_number.assistantId = X (bound) → uses assistant X directly
   - Assistant X already has the contractor's personalized prompt baked in
   - No webhook needed; no per-call override
   - take_message tool fires at end of call → routes to our end-of-call-report
   - End-of-call-report processes the tool call, sends emails/SMS as today
```

---

## Prompt updates

When a contractor edits their custom_prompt_notes, ai_tone, ai_language,
ai_voice_id, business_name, owner_first_name, services, or service_area
on `/dashboard/settings`:

1. `/api/profile` (POST) saves the new values to Supabase
2. After save, fire `repatchVapiAssistant(userId)`:
   - Load fresh profile
   - Render new system prompt + first message
   - PATCH `/assistant/{vapi_assistant_id}` on Vapi with the new model.messages + firstMessage + voice
3. Next call uses the new config — no deploy needed

Should be async / background to keep the settings save snappy. ~500ms
on the Vapi PATCH side.

---

## Lifecycle

| Event | Action |
|---|---|
| Contractor signs up + completes onboarding | `provisionTenant(userId)` — creates assistant + binds number |
| Contractor edits settings | `repatchVapiAssistant(userId)` — PATCH prompt + voice |
| Contractor cancels | `releaseTenantResources(userId)` — `DELETE /assistant/{id}`, release Twilio number, mark `profiles.vapi_assistant_id = null` |
| Sales prompt template changes globally | Either: (a) sweep all active assistants with a re-PATCH cron, or (b) accept stale until next settings-save event |

For (a), a nightly cron that re-PATCHes every active assistant takes
~2-3 minutes per 100 contractors and runs at zero cost.

---

## Cost analysis (Idiot Index check)

Vapi pricing:
- Creating + storing assistants is **free** (no per-assistant fee)
- Only billed for actual usage (voice minutes, model tokens, transcription)
- Imported phone numbers cost ~$0 on Vapi (Twilio bills the number rental)
- API rate limits: 60 req/sec on the management API — plenty for any
  realistic provisioning volume

**Estimated incremental cost per contractor: $0.** All the per-call
costs (Twilio voice minutes, Cartesia, Deepgram, Claude tokens) are
identical whether we use one shared assistant or one assistant per
contractor.

Scale check: at 1,000 contractors we'd have 1,000 assistant resources
in Vapi. Vapi's docs don't list a hard cap. If we hit one, mitigation
is to migrate to Vapi's `squad` feature (one squad with per-member
assistant overrides) or shard across Vapi orgs. Not a near-term concern.

---

## What stays from the current architecture

- **`renderSystemPrompt(tenant)`** in `src/lib/vapi.ts` is the canonical
  prompt template. Used at provision time (POST /assistant) and at
  update time (PATCH /assistant).
- **`renderSalesAgentPrompt()`** still powers the public demo line —
  it's already baked into the shared demo assistant.
- **`/api/vapi/end-of-call-report`** receives tool calls + end-of-call
  events from EVERY assistant. Routes to the right tenant via the
  `user_id` we set in `assistant.metadata`. No change needed here.
- **`/api/calendar/book`** and **`/api/calendar/availability`** are
  tool endpoints, hit by Vapi during calls. Unchanged.

## What goes away

- **`/api/vapi/assistant-request`** is no longer in the request path.
  See "What we keep around but unused" below.
- The shared assistant `cccc9db9-...` continues to serve the demo line
  only. It's not deleted, just not used for new tenants.
- Per-call override logic is dead code.

## What we keep around but unused

`/api/vapi/assistant-request/route.ts` stays in the codebase with a
prominent TODO comment at the top explaining it's parked pending
per-tenant architecture. Reasons not to delete:

1. If Vapi fixes their override path later, this is half the work to
   resume the shared-assistant pattern (which is simpler architecturally).
2. The route's tenant-lookup logic (Supabase query, fallback patterns)
   is useful reference even if the route itself isn't called.
3. Removing it would leave a dangling phone-number `serverUrl` config
   that points at a 404. Cheaper to leave the endpoint returning {ok:true}.

---

## Migration path for the existing demo line

The demo line `(651) 467-7829` already works under the
**shared-assistant + bake-prompt** pattern (see `scripts/bake-sales-prompt-into-assistant.mjs`).
We do NOT migrate it to per-tenant — it's a singleton anyway. No
contractor owns the demo number.

When the first paying contractor signs up:
- They get a brand-new Twilio number (already happens via `provisionNumberForUser`)
- They get a brand-new Vapi assistant (NEW step — what `provisionTenant` adds)
- The two are bound at creation
- The demo line is untouched

---

## Open questions for the implementer

- **Where does `provisionTenant` fire from?** Most likely candidates:
  Stripe webhook (current entry point for `provisionNumberForUser`) or
  `/api/onboarding/complete-step` (when the contractor finishes the
  onboarding form and we know the business_name + services). Lean
  toward the latter so the prompt has real data — otherwise we'd
  provision with placeholder values then PATCH later.
- **What if Vapi assistant creation fails?** Same failure-handling
  pattern as the Twilio number purchase — record in
  `provisioning_failures` table, retry via the existing half-hourly
  cron. Surface a banner to the contractor while pending.
- **Should we also create a separate Vapi assistant for the AFTER-HOURS
  / overflow scenario?** Probably not — same assistant config with
  hour-based logic in the prompt is simpler than two assistant
  resources per contractor.
