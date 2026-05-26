# Skill: ig-fb-engager

Browser-automation engagement bot for Instagram and Facebook. Runs locally on
Peter's laptop using your home IP (residential = invisible to Meta's bot
detectors at safe volumes).

**What it does:**
- **Instagram**: discovers HVAC/plumbing/electrical ICP via hashtags + competitor
  follower lists, then follows them at human-like cadence (~30-110s between actions).
- **Facebook**: navigates HVAC contractor groups and likes recent posts inside them
  (FB no longer supports mass personal-profile follows, so engagement is the play).

**What it does NOT do:**
- Mass-follow 2,000/day. That's the ban-bait pattern Meta kills. Hard caps in code:
  IG 120/day, FB 60/day. Raise only after 2+ weeks of clean runs.
- Run on Vercel. Playwright doesn't fit in serverless. Local only.

## Files

| Path | What |
|---|---|
| `scripts/social-engage.ts` | CLI entry — edit HASHTAGS/COMPETITORS/FB_GROUPS arrays at the top |
| `src/lib/socialEngager/index.ts` | Main orchestrator (`runEngagement`) |
| `src/lib/socialEngager/instagram.ts` | IG follow action + action-block detection |
| `src/lib/socialEngager/facebook.ts` | FB group post like action |
| `src/lib/socialEngager/targets.ts` | Hashtag + competitor follower scraping |
| `src/lib/socialEngager/auth.ts` | Session cookie management (saved to `.auth/`) |
| `src/lib/socialEngager/db.ts` | Supabase logging + dedup + daily rate-limit |
| `supabase-migrations/021_social_engagements.sql` | Table + today-view |
| `.auth/` (gitignored) | Saved Meta sessions — **never commit** |

## First-time setup

```powershell
# 1. Apply the migration in Supabase SQL editor
# (paste supabase-migrations/021_social_engagements.sql and run)

# 2. Initial login — opens a real browser, you log in by hand, bot saves the session
npm run engage:login:ig
npm run engage:login:fb

# 3. Dry-run to verify everything works (5 actions, headed, no actual clicks)
npm run engage:dry
```

## Daily usage

```powershell
# Headless run, uses saved session, caps at 120 IG actions
npm run engage:ig

# Same for FB
npm run engage:fb

# Both in sequence
npm run engage:both

# Custom cap
npx tsx scripts/social-engage.ts --platform=instagram --max=80
```

## Scheduling (Windows Task Scheduler)

One run per platform per day. Pick a different hour each day if possible — same
clock-time daily reads as a bot to Meta's behavioral models.

- IG run: ~9-11am CT (morning coffee window)
- FB run: ~6-8pm CT (evening browsing window)

Suggested Task Scheduler action:
```
Program/script: cmd.exe
Arguments: /c cd /d C:\Users\peter\ringoco && npm run engage:ig >> .auth\ig.log 2>&1
```

## Safety caps (in code)

| Setting | Value | Why |
|---|---|---|
| IG cap/day | 120 | Below the ~200-follow action-block threshold |
| FB cap/day | 60 | Below FB's like-throttle |
| Delay min | 30s | Anything under 20s looks scripted |
| Delay max | 110s | Keeps total runtime reasonable while staying human |
| Dedup | yes | Never follows the same handle twice |
| Block detection | yes | Aborts run on "Action Blocked" / captcha / login wall |

## Retargeting ICP

Edit `scripts/social-engage.ts`:

- `HASHTAGS` — IG hashtags whose recent posters become targets
- `COMPETITORS` — IG handles whose follower lists you mine
- `FB_GROUPS` — direct URLs to FB groups (most have `/groups/{slug}` form)

For HVAC ICP at scale, add local/regional groups: "Minneapolis HVAC contractors",
"DFW Plumbers", etc. Local groups convert 5-10x better than national ones.

## Triggers

User says: "follow contractors on IG", "run engagement bot", "engage on social",
"grow IG following", "find HVAC leads on social".
