# BellAveGo LLC — Business Identity

Reference doc for the legal entity behind this repo. Update when any of the below changes.

## Legal entity
- **Name:** BELLAVEGO LLC
- **State of formation:** Illinois
- **File number:** 18099101
- **Formation date:** May 20, 2026
- **EIN:** [PLACEHOLDER — to be filled in]
- **Registered address:** 9232 South Bell Avenue, Chicago, IL 60643
- **Registered agent:** Peter McShane (self)
- **Tax classification:** Single-member LLC, disregarded entity (taxed as sole proprietorship by default)

## Owner
- **Name:** Peter McShane
- **Business email:** peter@bellavego.com (ImprovMX forward to bellavegollc@gmail.com)
- **Sending email:** alerts@bellavego.com (via Resend, domain verified May 21, 2026)

## Infrastructure
- **Domain registrar:** Namecheap
- **Hosting:** Vercel
- **Database:** Supabase
- **Auth:** Clerk (see CLAUDE.md for requireAdmin pattern)
- **Email:** Resend (RESEND_FROM_EMAIL=`BellAveGo <alerts@bellavego.com>`)
- **SMS / Voice:** Twilio
- **Voice AI:** Vapi + Cartesia + Deepgram
- **LLM:** Anthropic Claude
- **Calendar:** Cronofy
- **Payments:** Stripe

## Twilio A2P 10DLC
- **Brand SID:** BN1d509bf3fc25472594e3a0a056db4040
- **Brand type:** Sole Proprietor (upgrade to Standard Brand once EIN added to Twilio)
- **Messaging Service SID:** MG0ac497d592d0800a7e25db9cf395b44a
- **Campaign:** BellAveGo Customer Care (submitted to TCR May 21, 2026)

## Recurring obligations
- **Illinois Annual Report:** due before May 31, 2027 (~$75)
- **TCPA opt-in default:** `review_request_enabled = false` per `sql/2026-05-21-review-request-opt-in.sql`
- **Public legal pages:** https://www.bellavego.com/privacy and https://www.bellavego.com/terms
