# SITE COPY EDITS â€” Ship Today

**Goal:** Reposition bellavego.com from "AI Receptionist" to "Office Manager" by EOD.
**Files to edit:** `src/app/page.tsx` (hero + bundle section), pricing block.
**Time budget:** 90 min. Then `git push origin main`.

---

## EDIT 1 â€” Hero Headline (page.tsx lines 437â€“444)

**Current:**
```tsx
<div className="hero-eyebrow">AI Receptionist Â· 24/7</div>
<h1 className="hero-h1">
  Stop losing jobs<br />
  <span className="accent">to missed calls.</span>
</h1>
<p className="hero-sub">
  BellAveGo answers when you can&apos;t, books the job, and texts your customer â€” automatically. Built for contractors who&apos;d rather be on the job site than at a desk.
</p>
```

**Replace with:**
```tsx
<div className="hero-eyebrow">Office Manager Â· For Home Service Pros</div>
<h1 className="hero-h1">
  Replace the $60K/yr office manager<br />
  <span className="accent">you can&apos;t afford to hire.</span>
</h1>
<p className="hero-sub">
  BellAveGo answers your calls, hunts down quotes, collects past-due invoices, and replies to reviews â€” all running in the background while you&apos;re on the truck. $797/month + $500 onboarding. 30-day money-back guarantee on subscription.
</p>
```

**Why each change:**
- Eyebrow: anchors the new category. "Office Manager" not "Receptionist."
- H1: replaces a feature ("missed calls") with an outcome ("replace a hire"). Bigger ROI frame.
- Subhead: lists the 4 modules so user knows it's not just call answering. Includes price + risk reversal upfront.

---

## EDIT 2 â€” Add 4-Module Bundle Section (after hero, before pricing)

Insert this section between hero and existing content. Find a clean place â€” likely after `</section>` closing the hero, before the next section opens.

```tsx
<section style={{ padding: '80px 24px', background: '#fff', borderTop: '1px solid #DCE9E2' }}>
  <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: '#0AA89F', textTransform: 'uppercase', marginBottom: 12 }}>
      What you get
    </div>
    <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 44px)', fontWeight: 900, color: '#0B1F3A', lineHeight: 1.1, marginBottom: 16 }}>
      Five AIs. One office manager.
    </h2>
    <p style={{ fontSize: 17, color: '#4A6670', maxWidth: 640, margin: '0 auto 56px', lineHeight: 1.6 }}>
      Most contractors lose money in four places: missed calls, unfollowed quotes, past-due invoices, and bad reviews. We built an AI for each.
    </p>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, textAlign: 'left' }}>
      <div style={{ padding: 24, border: '1px solid #DCE9E2', borderRadius: 12, background: '#F2F9F5' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>ðŸ“ž</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>AI Receptionist</h3>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55 }}>Answers 24/7. Books the job. Texts the customer. Routes emergencies to your cell.</p>
      </div>
      <div style={{ padding: 24, border: '1px solid #DCE9E2', borderRadius: 12, background: '#F2F9F5' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>ðŸ’°</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>AI Quote Hunter</h3>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55 }}>Follows up on every quote you send. Day 2, day 7, day 14. Closes the ones you'd forget.</p>
      </div>
      <div style={{ padding: 24, border: '1px solid #DCE9E2', borderRadius: 12, background: '#F2F9F5' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>ðŸ§¾</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>AI Collections</h3>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55 }}>Chases past-due invoices nightly. Offers payment plans. Sends Stripe links. Recovers what you'd write off.</p>
      </div>
      <div style={{ padding: 24, border: '1px solid #DCE9E2', borderRadius: 12, background: '#F2F9F5' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>â­</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0B1F3A', marginBottom: 6 }}>AI Reviews</h3>
        <p style={{ fontSize: 14, color: '#4A6670', lineHeight: 1.55 }}>Drafts a personalized reply to every Google/Yelp review. You approve in one tap.</p>
      </div>
    </div>
  </div>
</section>
```

---

## EDIT 3 â€” Pricing Block

Find the existing pricing section. Replace 3 tiers with:

| Tier | Price | Setup | Tagline |
|---|---|---|---|
| Receptionist | $397/mo | $50 | "Just answer the calls." |
| **Office Manager** â­ | **$797/mo** | **$500** | "Replace the hire." |
| Concierge | $1,997/mo | $797 | "We run it for you." |

**Bullets per tier:**

**Receptionist â€” $397/mo**
- AI Receptionist (24/7 call answering)
- SMS confirmations
- Calendar booking (Google)
- Up to 500 calls/mo

**Office Manager â€” $797/mo (POPULAR)**
- Everything in Receptionist
- AI Quote Hunter
- AI Collections
- AI Reviews
- Monthly intelligence report
- Unlimited calls

**Concierge â€” $1,997/mo**
- Everything in Office Manager
- Dedicated success manager (Peter direct)
- Custom AI prompt tuning
- Priority phone/text support
- White-glove onboarding (we set up Jobber/HCP/ST integrations)
- Multi-location ready

**All plans:** Setup fee · Month-to-month · 30-day money-back on subscription · 17% off annual

**Setup fees:** $50 Receptionist · $500 Office Manager · $797 Concierge — covers number provisioning, A2P SMS registration, custom prompt tuning, CRM integration setup. Non-refundable since real work is done at signup.

---

## EDIT 4 â€” Risk Reversal Banner

Add a slim banner just below hero CTA, full-width:

```tsx
<div style={{ padding: '14px 24px', background: '#0B1F3A', color: '#fff', textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
  30-day money-back on subscription · Cancel anytime · Setup fee covers real onboarding work
</div>
```

**Why:** Removes 3 objections in 1 sentence (cost, lock-in, performance).

---

## EDIT 5 â€” Demo Number Prominence

Currently the live demo number is mentioned but buried. Add a sticky-ish CTA near hero:

```tsx
<div style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
  Or just call it right now: <a href="tel:+17652371335" style={{ color: '#5EEAD4', fontWeight: 800, textDecoration: 'none' }}>(765) 237-1335</a> â€” talk to it like you're a customer.
</div>
```

**Why:** Best conversion lever on the entire site. Most prospects who call the demo number book a sales call within 24h.

---

## EDIT 6 â€” Remove

Per CLAUDE.md cleanup, also delete:
- Any "Solo / Growth / Scale" tier copy referencing $147/$297/$597 (legacy v1)
- Any "Quarterly consulting reports" standalone callouts (now folded into Office Manager bundle as "monthly intelligence reports")
- "Multi-location" CTA â†’ keep but rename "Multi-location: contact us" â€” defer this until first 25 customers

---

## DEPLOY CHECKLIST

```powershell
# Verify dev server runs after edits
cd C:\Users\peter\ringoco
npm run dev
# Open http://localhost:3000, sanity-check:
#  - Hero shows new "Office Manager" headline
#  - 4-module bundle section renders below hero
#  - Pricing shows $397/$797/$1,997
#  - Demo phone number tap-to-call works on mobile preview
#  - No console errors

# Ship it
git add src/app/page.tsx
git status
git diff --stat
git commit -m "ship Office Manager positioning"
git push origin main

# Verify production
# Open https://www.bellavego.com in private tab â€” should show new copy within 2 min
```

---

## DO NOT TOUCH (resist the urge)

- Don't rebuild dashboard today
- Don't refactor pricing logic in Stripe
- Don't add A/B testing
- Don't touch invoicing UI (delete is fine, "improve" is not)
- Don't add a chat widget
- Don't change the logo
- Don't move colors
- Don't add testimonials yet (we don't have any â€” fake ones will tank trust)

**Time budget for site copy = 90 min. Cold calls start at 1pm regardless of whether u finished perfect copy.**

Good enough shipped > perfect unshipped.
