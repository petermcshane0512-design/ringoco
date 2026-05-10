# DISCOVERY + DEMO SCRIPT — 30 Minutes

**Goal:** close OR disqualify. Not "follow up next week."
**Default cadence:** 5 min discovery → 15 min demo → 5 min ROI → 5 min close.
**Hard rule:** ask for the sale before u hang up. Every. Single. Time.

---

## PRE-CALL CHECKLIST (5 min before)

- [ ] Pull their Google Maps profile in browser. Note review count, rating, recent reviews.
- [ ] Pull their website. Note: services listed, hours, "book online" presence, photos of trucks.
- [ ] Run `agents/business-diagnostic.md` if not already run — have their estimated missed-revenue # ready
- [ ] Have demo Twilio number ready to ring on speakerphone
- [ ] Have Stripe payment link for $497/mo open in tab — ready to paste
- [ ] Cal.com/calendar open w post-call follow-up slot if needed

---

## OPENING (1 min)

> "Hey {{first_name}}, Peter from BellAveGo. Thanks for the time. Quick agenda: I'll spend 5 min asking about ur shop so the demo's relevant, then 15 min showing u how this'd work for {{business_name}} specifically, then 10 min on numbers and any questions u've got. By the end we'll either know it's a yes, a no, or what'd need to change to make it a yes. Sound good?"

**Why:** Sets up the close at minute 30. Removes "let me think about it" surprise.

---

## DISCOVERY — 4 Questions (5 min)

Ask exactly these. In this order. Take notes. Don't interrupt.

### Q1 — Volume
> "How many calls is {{business_name}} taking on a busy week — rough number?"

[Listen. They'll guess low. That's fine.]

### Q2 — Coverage
> "Walk me thru what happens when ur phone rings at 7pm on a Saturday in July."

[Listen for: voicemail, wife, admin, answering service. Note specifics.]

### Q3 — Pain
> "If u could wave a wand and fix ONE thing about how phones/quotes/follow-ups work at ur shop — what'd it be?"

[This is the gold. Whatever they say IS the pitch u customize. Write it down word-for-word.]

### Q4 — Decision
> "If we showed u something today that solved that — who's involved in deciding to try it? Just u, or anyone else?"

[If they say "just me" → u can close today. If they say "my wife / my partner / my GM" → schedule round 2 with that person on call.]

---

## DEMO — 15 min

**Don't share screen for first 5 min.** Pick up phone, dial demo number on speakerphone. Make them experience it before they see it.

### Step 1 — Live call demo (3 min)
> "I'm gonna call our demo number from my phone. Pretend u're a customer whose AC just died. Talk to it. I won't say anything."

[Let it run a full call. They'll book a fake job. Hang up.]

> "Notice anything?"

[Let them react. They'll usually say "wow that sounded real." Capture that exact reaction — quote it back during close.]

### Step 2 — Dashboard walkthrough (5 min)

Share screen. Show:
- Live call log w transcript (the call they just made appears)
- Job booked in calendar
- SMS confirmation that went to "customer"
- Customer record auto-created

> "Everything u just heard — captured, transcribed, booked, customer notified. Zero clicks from u."

### Step 3 — Quote Hunter walkthrough (3 min)

> "Here's where it gets interesting. Watch this."

Show:
- Mock quote sent in Jobber
- Day 2 follow-up SMS draft
- Day 7 follow-up
- Conversion when "customer" replies "yes"

> "U send 100 quotes a month. Most contractors follow up on maybe 25 of them. We do all 100. Industry data says that's worth $8K-16K/mo in recovered revenue."

### Step 4 — Collections + Reviews (2 min, fast)

Show quickly. Don't dwell. These are bonus features, not the main pitch.

### Step 5 — The Intelligence Report (2 min)

> "End of every month u get this PDF. Top 5 missed-call patterns. Best/worst margin job types. Customers most likely to churn. Most contractors don't have any of this — u'd be the only HVAC shop in {{city}} with it."

[This is the moat reveal. Save it for here.]

---

## ROI — 5 min

**Pull up their numbers from the diagnostic. Show specific math, not generic.**

> "Based on {{review_count}} reviews and HVAC averages —
>  • Estimated calls/month: ~{{X}}
>  • Estimated missed: ~{{Y}}
>  • At $385 avg job + 55% book rate: $XX,XXX/month walking past u
>
> If we catch even half of that — call it $XX,XXX/month —
> on a $497 cost, that's a {{ratio}}x return. Month one."

Pause. Let the number sit.

> "Numbers wrong? Pressure-test 'em — what'd u change?"

[Listen. They'll either confirm or correct. If they correct, redo math live. Either way they're now bought-in to the methodology.]

---

## CLOSE — 5 min

### Step 1 — Trial close
> "Anything we covered that doesn't make sense for {{business_name}}?"

If "no" → move to the ask.
If they raise a concern → see `07-objection-handlers.md`. Handle it. Then trial close again.

### Step 2 — The ask (say this verbatim)
> "Cool. So here's what I'd suggest. Let's get u set up today on the AI Office Manager plan — $497/mo, $0 setup, first month free. We'll port ur main number forwarding tonight, ur AI number's live by tomorrow morning. I'll text u personally when it's ready. Card on file but no charge until day 31. And — if we don't book u at least 5 jobs in the first 90 days u wouldn't have otherwise gotten, u get a full refund and u keep all the data we collected. Sound fair?"

[Stop talking. Whoever speaks first loses.]

### Step 3 — Three possible responses

**YES:** "Awesome. I'll send u the Stripe link right now. Pay it on ur phone, I'll start setup tonight."
[Send link. Stay on call until they confirm payment received.]

**MAYBE / "let me think":** "Totally fair — but real quick: what specifically would u think about? Is it the price, the AI quality, the timing, or trust?" [Address the specific. Trial close again.]

**NO:** "Got it. What'd have to be true for it to be a yes?" [Listen. If it's "nothing — not interested" — accept it cleanly. "Cool, no worries. Mind if I check back in 6mo?"]

### Step 4 — Don't leave w/o a calendar event

Even if they don't close today:
- "When should I check back? 30 days? 60?"
- "Want me to send the demo recording so u can show ur partner?"
- "Should I email u once we onboard another HVAC shop in {{city}}?"

---

## POST-CALL — 10 min

Whether yes or no:
- [ ] Update CRM (Notion / Airtable / Supabase) w outcome
- [ ] If YES — send Stripe link, calendar invite for onboarding, welcome SMS
- [ ] If NO — note exact reason in `outreach_objections` table for pattern learning
- [ ] If MAYBE — send 1 follow-up email TODAY w demo recording + ROI sheet, no more

**Send-the-Stripe-link rule:** If they said yes, send the link **before u hang up.** Don't say "I'll send it later." Later = lost deals. Half ur deals die between "yes" and "I'll think about the contract."

---

## CALL POSTMORTEM — Weekly (Friday)

Review every demo from the week:
- What % closed?
- Where did u lose the ones that didn't close?
- What objection came up most?
- What demo segment had the strongest reaction?
- What demo segment had the weakest reaction?

Tighten the script every Friday. Cut what didn't land. Double down on what did.

After 10 demos u'll have a script that's twice as good as this one.
