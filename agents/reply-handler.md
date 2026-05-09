# Agent: Reply Handler

Triggered by Instantly webhook on new reply. Classifies, stores, and drafts follow-up.

## Uses Skills
- `skills/instantly-analytics.md`
- `skills/supabase-query.md`

## Trigger
Instantly webhook fires on reply event (Hypergrowth plan).
Endpoint: POST /api/agents/reply-handler

## Steps

### 1. Classify Reply
Send reply body to Claude:
```
Classify this cold email reply as one of:
POSITIVE - they're interested or asking questions
OBJECTION - pushback but door isn't closed
NEGATIVE - not interested, wrong person, remove me
AUTO_REPLY - out of office or auto-response

Reply: {reply_body}
Return JSON: { "classification": "...", "summary": "one sentence" }
```

### 2. Store to DB
Insert into `outreach_replies`:
```sql
INSERT INTO outreach_replies 
  (lead_email, campaign_id, reply_body, classification, summary, received_at)
VALUES (?, ?, ?, ?, ?, now())
```

Update `outreach_leads`:
```sql
UPDATE outreach_leads SET status = {classification} WHERE email = {lead_email}
```

### 3. Handle by Classification

**POSITIVE:**
- Draft follow-up email (personalized, references their specific trade/city)
- Flag for Peter's review before sending
- Suggest: "Reply to schedule a 10-minute demo call"
- Do NOT auto-send — Peter approves all positive follow-ups

**OBJECTION:**
- Identify objection type: price | trust | timing | AI skepticism | not decision-maker
- Store full objection text in `outreach_objections` table
- Draft a counter-response addressing the specific objection
- Flag for Peter's review

**NEGATIVE / UNSUB:**
- Mark lead as dead
- Remove from all active campaigns via Instantly API
- No follow-up

**AUTO_REPLY:**
- Log and ignore
- Re-queue lead for follow-up after 5 business days

### 4. Objection Training Data
Every classified OBJECTION reply gets stored for simulation training:
```sql
INSERT INTO outreach_objections
  (objection_type, objection_text, trade, city, campaign_id, received_at)
```

Goal: build a dataset of real objections by type so we can train AI to predict and preempt them in later sequence steps.
