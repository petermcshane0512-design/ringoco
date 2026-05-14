# Vapi setup — flip the receptionist from Polly to Cartesia

One-time setup. After this, every new BellAveGo number auto-routes through Vapi.

## 1. Rotate the API key

You pasted your Vapi key in chat earlier — it's burned. Revoke it now:
- Vapi dashboard → **API Keys** → revoke the old one
- Generate a fresh one

## 2. Paste env vars

In **Vercel → Project → Settings → Environment Variables** (Production + Preview + Development):

```
VAPI_API_KEY=<the new key from step 1>
VAPI_WEBHOOK_SECRET=<any long random string — generate one with `openssl rand -hex 32`>
NEXT_PUBLIC_APP_URL=https://www.bellavego.com   (if not already set)
```

Also paste these into your local `.env.local` at the project root so the setup
scripts work locally:

```
VAPI_API_KEY=...
VAPI_WEBHOOK_SECRET=...
```

## 3. Create the BellAveGo Receptionist assistant in Vapi

```powershell
node scripts/vapi-create-assistant.mjs
```

The script prints an **Assistant ID**. Copy it.

Paste it into Vercel as:

```
VAPI_ASSISTANT_ID=<the id printed above>
```

Add it to `.env.local` too. **Redeploy** (or it'll pick up on the next deploy).

## 4. (One-time) Add the `vapi_phone_number_id` column to `profiles`

Run this in Supabase SQL Editor:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vapi_phone_number_id text;
```

## 5. Import any existing Twilio numbers into Vapi

```powershell
node scripts/vapi-import-numbers.mjs
```

This reads every `profiles.twilio_number` and registers it with Vapi. Going
forward, `provisionNumberForUser` does this automatically for new signups.

## 6. Smoke test

Call your test BellAveGo number from your phone. You should hear:

- **Cartesia voice** answering — warm, female, low latency
- Sub-1-second pauses between your turn and the AI's
- Barge-in works (interrupt the AI mid-sentence — it stops)
- Tell it: "Hi, I'm John. (555) 123-4567. My AC isn't cooling. 123 Main, Atlanta. Wednesday afternoon."
- Within 2 seconds of finishing, you should receive an SMS confirmation
- The owner phone (`FALLBACK_OWNER_PHONE` env or the tenant's `owner_phone`)
  should receive the 🔔 New job request SMS with YES/NO

## What this changes architecturally

```
Before:  PSTN → Twilio → /api/twilio/voice → Polly TTS + Haiku LLM → loop
After:   PSTN → Twilio → Vapi (Cartesia + Sonnet 4.6 + Deepgram) → tool-call → our /api/vapi/end-of-call-report → SMS flows (unchanged)
```

- `/api/twilio/voice` is now dormant for imported numbers but stays as a
  fallback if Vapi import fails (so calls still answer, just on the old voice).
- `/api/twilio/sms` is **unchanged** — contractor YES/NO replies still hit it.
- All multi-tenant logic, A2P registration, tier caps, smart insights stay.

## Rolling back

If something goes sideways:

```powershell
# Set the env var in Vercel to disable Vapi imports for new numbers
VAPI_ASSISTANT_ID=        # empty

# For existing imported numbers, delete the Vapi phone number record via dashboard.
# Twilio's voiceUrl reverts to whatever it was set to before import; if blank,
# manually set it back to https://www.bellavego.com/api/twilio/voice.
```

The legacy Polly+Haiku flow is fully preserved in `src/app/api/twilio/voice/route.ts`.

## Cost monitoring

Estimated per-call cost on the new stack (~5min average call):

| Component | Per-min | Per 5-min call |
|---|---|---|
| Vapi platform | $0.05 | $0.25 |
| Cartesia Sonic TTS | $0.07 | $0.35 |
| Deepgram Nova-3 STT | $0.0043 | $0.022 |
| Claude Sonnet 4.6 | ~$0.02 | ~$0.10 |
| Twilio SIP minutes | $0.014 | $0.07 |
| **Total** | **~$0.16** | **~$0.80** |

At Receptionist tier ($397/mo, 250-call cap), max voice cost = $200, gross
margin = ~50%. At Concierge ($1,997/mo, ~500 calls avg), voice cost = $400,
gross margin = 80%. Math holds.

## Voice tweaking

Swap the Cartesia voice without code changes:

```
VAPI_VOICE_ID=<any cartesia voice id>
```

Browse voices: https://play.cartesia.ai/voices

The default (`156fb8d2-335b-4950-9cb3-a2d33befec77` — "Helpful Woman") is the
closest analog to Polly Joanna. For a male voice, try
`421b3369-f63f-4b03-8980-37a44df1d4e8` ("Newsman").
