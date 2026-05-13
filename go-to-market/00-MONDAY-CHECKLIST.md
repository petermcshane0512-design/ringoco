# Monday May 11 2026 — EXECUTION CHECKLIST

**Goal:** $1M ARR by May 12 2027. **Bottleneck:** 0 paying customers, 0 demos booked.
**Today's job:** stop coding, start selling.

---

## TIME-BLOCKED DAY (8 hours)

### 7:00–8:00am — TARGET LIST
- [ ] Read `01-icp.md` and `10-lead-pull-config.md`
- [ ] Run `agents/lead-sourcing.md` for cities in batch A (DFW + Tampa, HVAC only)
- [ ] Verify 100+ enriched leads land in Instantly campaign `CAMPAIGN_FEAR_LOSS`
- [ ] If skill fails → manually pull 50 from Google Maps, paste into Sheet (don't get stuck)

### 8:00–10:00am — SITE COPY UPDATE (deploy by 10am)
- [ ] Read `09-site-copy-edits.md`
- [ ] Edit `src/app/page.tsx` lines 437–444 + add bundle section
- [ ] Edit `src/app/pricing/page.tsx` (or wherever pricing renders) → add $797 "Office Manager" tier
- [ ] `git add . ; git commit -m "ship Office Manager positioning" ; git push origin main`
- [ ] Verify www.bellavego.com renders new hero
- [ ] **DO NOT touch invoicing UI today, dont fix metered billing today, dont add tests today.** ship, move on.

### 10:00–12:00 — INSTANTLY CAMPAIGN LIVE
- [ ] Open Instantly. Create campaign matching ID `CAMPAIGN_FEAR_LOSS`
- [ ] Paste 5 emails from `03-cold-email-fear-loss.md`
- [ ] Set send schedule: Tue–Thu, 9am–11am local recipient time, 40/day/inbox
- [ ] Verify SPF/DKIM/DMARC green on all sending domains
- [ ] Toggle ON. **First batch should send Tuesday morning.**

### 12:00–1:00 — LUNCH (do not skip, do not work)

### 1:00–3:00 — MANUAL OUTREACH (this is where money is made)
- [ ] Pull 20 named HVAC owners from your list (highest review counts first)
- [ ] **Cold-call all 20** using `06-cold-call-script.md`
- [ ] Track in tracking sheet: connects / left voicemail / interested / booked
- [ ] Goal: book 1 demo today. **One.**

### 3:00–5:00 — DEMO PREP + REPLY HANDLING
- [ ] Read `08-discovery-demo-script.md` once through, out loud
- [ ] Verify your demo Twilio number is live, ringing your phone, BellAveGo answers cleanly
- [ ] Set up Cal.com or similar w 30-min slots Tue–Fri 9–4
- [ ] Configure reply-handler webhook on Instantly → Vercel endpoint
- [ ] Check first replies if any have come in

### 5:00–6:00 — SHUT DOWN
- [ ] Update `11-tracking-sheet.md` with today's numbers
- [ ] Tomorrow's first call list (top 20)
- [ ] Close laptop. **Do not code tonight.**

---

## NORTH STAR METRICS (track daily)

| Metric | Today | This Week | This Month | YTD |
|---|---|---|---|---|
| Leads pulled | | | | |
| Cold emails sent | | | | |
| Cold calls made | | | | |
| Replies (positive) | | | | |
| Demos booked | | | | |
| Demos completed | | | | |
| **Customers closed** | | | | |
| **MRR** | | | | |

**12-month math (target $1M ARR):**
- 168 customers @ $797/mo avg
- Close rate 20% from demo → 840 demos needed
- Demo book rate 5% from cold reply → 16,800 unique contacts
- **= 50/day cold outreach, 3 demos/day, 1 close every 3 days.**

If Week 1 isn't on this pace, adjust *outreach volume*, not *features*.

---

## RULES THAT KILL PROGRESS — DO NOT BREAK

1. **No new code Mon-Fri this week** unless customer #1 explicitly asks for it during demo.
2. **No "let me improve the prompt first."** Current prompt is good enough. Sell the product u have.
3. **No "I should rebuild multi-tenancy first."** Onboard customer #1 by hand. Multi-tenancy at customer #5.
4. **No social media, no Twitter, no YC application drafts.** None of those have closed a contractor.
5. **If u catch urself in VS Code without a customer ask driving it → close laptop, pick up phone.**

---

## WHAT GOOD LOOKS LIKE — END OF FRIDAY

- 500+ leads in Instantly, sequence sending
- 50+ cold calls made personally
- 2-5 demos booked
- 1 customer closed (cash collected) OR a clear "we'll start Monday w 30-day pilot"

If u hit 0 closes by Friday → Saturday morning we re-evaluate offer/ICP. Not features.
