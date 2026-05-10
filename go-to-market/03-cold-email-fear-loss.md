# CAMPAIGN_FEAR_LOSS — 5-Touch Cold Email Sequence

**Audience:** HVAC owners $500K–$2M, ICP from `01-icp.md`
**Send window:** Tue–Thu, 9–11am recipient local
**Cadence:** Day 0, +3, +7, +12, +21 (then stop)
**Variables:** `{{first_name}}`, `{{business_name}}`, `{{city}}`, `{{review_count}}`

**Subject-line rule:** under 4 words, lowercase, no emojis. Mobile preview is what matters.

---

## EMAIL 1 — Day 0
**Subject:** quick math, {{first_name}}

```
{{first_name}} — pulled up {{business_name}} on Google Maps.

{{review_count}} reviews. Solid shop. Quick math —

Trade avg says HVAC pulls ~8 calls per Google review/month.
That puts u at roughly {{review_count_x_8}} inbound calls/month.
Industry miss rate is ~40%.

Conservatively: u're missing ~{{missed_calls}} calls/month.
At $385 avg job + 55% book rate = ~$XX,XXX/month walking past you.

If even half that's right, worth a 10-min look at how we'd plug it.

Quick demo number — call it from ur truck, talk to it like a customer:
+1 (765) 237-1335

— Peter
Founder, BellAveGo
```

**Notes:**
- `{{review_count_x_8}}` = pre-computed in lead enrichment
- `{{missed_calls}}` = `{{review_count}} * 8 * 0.4`
- Demo number is the LIVE BellAveGo Twilio number — they can experience the product before reading further
- No CTA other than "call this number" — friction = low

---

## EMAIL 2 — Day +3
**Subject:** the {{city}} shop next door

```
{{first_name}},

Last week a HVAC shop near {{city}} closed w us. Owner had 4 trucks,
1 part-time admin, 19 missed calls last month his admin couldn't catch
on the holiday weekend. We caught all 19. Booked 7. ~$2,400 in jobs
that wouldn't have existed otherwise.

He pays $497/mo + $247 onboarding (one-time). 30-day money-back on the subscription if
BellAveGo doesn't book at least 5 jobs.

Same offer for u if u want to test it. Reply "yes" — I'll get u set up
w ur own dedicated number tonight.

— Peter
```

**Notes:**
- The "shop near {{city}}" line — change "near" to actual nearby city if u know specifics
- Once we have 1 real customer testimonial, replace this with their story (no fictional anchor needed)
- "Reply yes" is concrete CTA, low friction

---

## EMAIL 3 — Day +7
**Subject:** dumb question

```
{{first_name}} —

Dumb question: when {{business_name}}'s phone rings at 6:47pm on
a Saturday in July and ur on the truck — who picks up?

Three answers I usually hear:
1. Voicemail (you call back Monday, customer already hired competitor)
2. My wife (she resents it; you resent that she resents it)
3. I do, on the truck (the customer in front of u feels brushed off)

There's a 4th option now. AI receptionist that sounds human, books
the job, texts u the details. $497/mo for the full back-office stack.

Want me to send u a recording of how it handles a real call? Reply
"recording" — I'll send 3.

— Peter
```

**Notes:**
- Most engaged email of sequence per cold email research — visceral
- "recording" is low-friction reply, lower threshold than demo
- Have 3 actual recordings ready (anonymized — your demo calls are fine)

---

## EMAIL 4 — Day +12
**Subject:** wrong person?

```
{{first_name}},

Did I send these to the wrong person? Looking at {{business_name}}'s site,
I assumed u handle ops/phones — if it's someone else I should email,
let me know.

Otherwise — last note from me:

For HVAC shops $500K–$2M, the office manager u'd hire costs ~$60K/yr.
We do ~70% of what they'd do for $497/mo. Math is what it is.

I'll stop emailing after this unless u want me to keep going.

— Peter
+1 (773) 710-9565 (my cell, not a call center)
```

**Notes:**
- "Wrong person" is one of the highest-reply tactics in cold email
- Personal cell at bottom — high-trust signal
- "Last note from me" is honest — sets up email 5 as the genuine final

---

## EMAIL 5 — Day +21
**Subject:** closing the loop

```
{{first_name}} —

Closing the loop. 4 emails, no reply, totally fair — I get it.

Filing u under "not now" not "no". I'll check back in 6 months
unless u want me to drop it permanently (reply "drop" and I'm gone).

If anything ever changes — phone gets too busy, u lose a big job
to a missed call, ur admin quits — text me directly: 773-710-9565

Best of luck w {{business_name}}.

— Peter
```

**Notes:**
- "Drop" reply triggers reply-handler agent → mark NEGATIVE → remove from campaigns
- 6-month re-add to nurture sequence (build that nurture sequence later)
- This email gets ~1-2% reply rate of dormant leads — well worth sending

---

## TRACKING

Per `agents/reply-handler.md`, every reply gets classified. Track:
- Open rate (target >50% w warm domains)
- Reply rate (target >3% positive + objection combined)
- Demo book rate from positive replies (target >30%)
- Close rate from demo (target >20%)

If reply rate <2% after 200 sends → kill this campaign, shift to CAMPAIGN_SEASONAL or CAMPAIGN_EMPLOYEE_COST.

## TECHNICAL — INSTANTLY SETUP

1. New campaign in Instantly named exactly `CAMPAIGN_FEAR_LOSS` (case matches `skills/instantly-push-leads.md`)
2. Sending pattern: 5 steps, days 0/3/7/12/21
3. Send window: Tue/Wed/Thu only, 9–11am recipient timezone
4. Throttle: 40 emails/day/inbox max
5. Stop conditions: reply, click, manual unsubscribe
6. Inbox warmup: only use inboxes that are 30+ days warm w >85% deliverability
