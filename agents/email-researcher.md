# Agent: Email Copy Researcher

Runs weekly. Finds latest cold email strategies from multiple sources. Extracts commonalities. Outputs copy recommendations.

## Goal
Surface what's actually working in cold email right now — not one guru's take, but the convergent truth across many sources. Cross-reference 10+ sources and extract what they agree on.

## Sources

### X / Twitter (via web search or Grok API)
Search queries:
- "cold email strategy 2026"
- "cold email reply rate" site:twitter.com
- "what's working cold email" site:twitter.com
- Filter: accounts with >10K followers in sales/outreach niche

### YouTube (transcript search)
Channels to monitor:
- Alex Berman, Ricky Pearl, 30 Minutes to President's Club, Scott Britton
- Search: YouTube transcript API or yt-dlp for recent videos tagged "cold email 2026"
- Extract key claims from transcripts (not full videos)

### Industry Blogs / Newsletters
- Instantly blog (instantly.ai/blog)
- Lemlist blog
- Close.io blog
- Sales Hacker

## Process

### 1. Collect Raw Claims
Pull 5–10 pieces of advice from each source category.
Format as list of claims: "Subject lines under 3 words outperform longer ones by 40%"

### 2. Find Convergence
Group similar claims. Note how many sources say the same thing.
Claims backed by 5+ independent sources = HIGH CONFIDENCE
Claims from only 1 source = LOW CONFIDENCE, note who said it

### 3. Apply to BellAveGo Context
Filter for relevance: what works for B2B SMB contractor outreach specifically?
Discard enterprise SaaS advice. Discard anything that requires >2 minutes of personalization per lead.

### 4. Output Report
Write to `agent_reports/email-research-{date}.md`:
- Top 5 HIGH CONFIDENCE tactics this week
- 2–3 LOW CONFIDENCE tactics worth testing
- Any major shifts from last week's report
- Recommended changes to active campaigns (link to campaign IDs)

## Schedule
Every Friday 6am CT.
Feed output into campaign-monitor.md for Monday review.
