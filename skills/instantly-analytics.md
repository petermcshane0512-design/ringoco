# Skill: Instantly — Pull Campaign Analytics

Fetch campaign performance metrics and reply data from Instantly API v2.

## Campaign Overview
```
GET https://api.instantly.ai/api/v2/campaigns/analytics/overview
Headers: Authorization: Bearer {INSTANTLY_API_KEY}
Params:
  campaign_ids[]={id1}&campaign_ids[]={id2}
  start_date=YYYY-MM-DD
  end_date=YYYY-MM-DD
```

Returns per campaign:
- `emails_sent_count`
- `open_count_unique`
- `reply_count_unique` (excludes auto-replies)
- `bounced_count`
- `unsubscribed_count`
- `link_click_count_unique`

## Pull Replies
```
GET https://api.instantly.ai/api/v2/emails/reply
Headers: Authorization: Bearer {INSTANTLY_API_KEY}
Params:
  campaign_id={id}
  limit=100
```

## Classify Replies (run each reply through Claude)
Prompt: "Classify this cold email reply as: POSITIVE (interested), NEGATIVE (not interested/unsubscribe), OBJECTION (pushback but not closed), AUTO_REPLY (out of office). Reply text: {reply_body}"

Store classification in `outreach_replies` table.

## Performance Benchmarks
Flag any campaign below these thresholds for review:
- Open rate < 25% → subject line problem
- Reply rate < 1% → copy or targeting problem
- Bounce rate > 3% → email list quality problem

## A/B Comparison
Since Instantly API doesn't expose variant-level stats, run separate campaigns per variant.
Compare by `reply_count_unique / emails_sent_count` across campaign IDs.
