# Concierge AI Marketing Ops — Deployment Checklist

Day 1 build complete. This walks through every step needed to actually ship.

## What was built (12 of 12 Day-1 tasks)

| # | What | Files |
|---|---|---|
| 1 | **P0 fix: multi-tenant data leak** on dashboard/customers + jobs | `src/app/api/jobs/{list,create,update-status}/route.ts`, `src/app/api/customers/list/route.ts`, updated `src/app/dashboard/{customers,jobs}/page.tsx` |
| 2 | **Centralized pricing** — one source of truth | `src/lib/pricing.ts` (new), updated `stripe/{checkout,webhook}`, `twilio/voice`, all 5 OFFICE_MGR_TIERS consumers, CLAUDE.md |
| 3 | **Migration 010** — 10 concierge tables | `supabase-migrations/010_concierge_marketing_ops.sql` |
| 4 | **Weather skill** (NOAA, free) | `src/lib/marketing/weather-trigger.ts`, `skills/weather-trigger.md` |
| 5 | **Permit scanner** (5 metros, free) | `src/lib/marketing/permit-scanner.ts`, `skills/permit-scanner.md` |
| 6 | **Competitor watcher + GBP read** (Google Places) | `src/lib/marketing/competitor-watcher.ts`, `skills/competitor-watcher.md` |
| 7 | **Content gen** — ad creatives, SEO posts, reactivation drips | `src/lib/marketing/{ad-creative-generator,local-seo-publisher,reactivation-campaign}.ts` |
| 8 | **Weekly strategy report + notify** | `src/lib/marketing/strategy-report.ts`, `src/lib/notify.ts` |
| 9 | **Marketing Ops Agent + weekly cron** | `src/lib/marketing/agent.ts`, `src/app/api/crons/marketing-ops-weekly/route.ts`, `agents/marketing-ops-agent.md` |
| 10 | **Concierge dashboard + onboarding wizard + public report viewer** | `src/app/dashboard/concierge/{page,onboarding/page}.tsx`, `src/app/r/[reportId]/page.tsx`, `src/app/api/concierge/{data,settings}/route.ts` |
| 11 | **Growth Wallet + ad-manager stubs** | `src/lib/marketing/{growth-wallet,google-ads-manager,meta-ads-manager}.ts`, `src/app/api/growth-wallet/topup/route.ts`, webhook extension |
| 12 | **Typecheck clean** — zero errors across 25+ new/edited files |  |

## Required actions BEFORE this goes live

### 1. Run Supabase migration (5 min)
Open https://supabase.com/dashboard/project/calbttbufyrqiblnncsm/sql/new and paste the contents of `supabase-migrations/010_concierge_marketing_ops.sql`. Click Run. Verify all 10 tables created.

### 2. Set environment variables in Vercel (10 min)
| Variable | Where to get it | Required for |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | https://console.cloud.google.com → Places API | Competitor watcher + GBP read |
| `RESEND_API_KEY` | Sign up free at https://resend.com → API keys | Email notifications (SMS still works without it) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | After MCC approval | Live Google Ads (stubbed until set) |
| `GOOGLE_ADS_MCC_ID` | After MCC approval | Live Google Ads (stubbed until set) |
| `META_SYSTEM_USER_TOKEN` | After Meta Business Manager approval | Live Meta Ads (stubbed until set) |

The system functions WITHOUT the last three. Ad creatives queue in the dashboard waiting to go live; everything else (reports, leads, competitors, content) runs normally.

### 3. Check Vercel plan tier (2 min)
`vercel.json` now has **6 crons**. Vercel Hobby limits to 2; Pro allows 40. If on Hobby, upgrade ($20/mo) — at $1,997/mo per Concierge customer, this pays for itself with 1 customer.

### 4. Test end-to-end with yourself as the first Concierge customer (15 min)
```powershell
# In your browser:
# 1. Sign in to bellavego.com
# 2. POST to /api/admin/grant-tier with { "tier": "concierge", "provisionNumber": true }
#    (use Postman or the admin UI you built)
# 3. Visit /dashboard/concierge — should redirect to onboarding wizard
# 4. Fill out onboarding (use real ZIPs and a real Google Place ID for a competitor)
# 5. Trigger the cron manually:
curl -X GET "https://www.bellavego.com/api/crons/marketing-ops-weekly" -H "Authorization: Bearer $CRON_SECRET"
# 6. Check Supabase concierge_reports — a row should exist
# 7. Check your phone — SMS should arrive with report link
# 8. Open the report link — should render the McKinsey-style page
```

### 5. Approvals you need to start now (parallel, 3-10 days each)
- ✅ Google Ads MCC application (you said you submitted) — check status at ads.google.com
- ⬜ Meta Business Manager — go to `business.facebook.com`, create Business, request Marketing API access
- ⬜ A2P 10DLC SMS campaign registration — required for outbound SMS at scale. Twilio Console → Messaging → Compliance

## When you're ready to FLIP the new pricing live

This is the only customer-facing change still pending:

1. **In Stripe Dashboard**: create three new monthly prices ($397, $797, $1,997), three new annual prices, three new setup-fee prices
2. **Update `src/lib/pricing.ts`**: paste the new price IDs into `PRICE_IDS` and `PRICE_TO_TIER`. Update `TIER_METADATA` monthly/annual/setup values
3. **Rename `src/app/pricing-v2/page.tsx` → overwrite `src/app/pricing/page.tsx`** (back up the old one first)
4. **Commit + push to main**

This is intentionally a manual step — you said masterpiece, you said don't ship until ready. The new tier prices are NOT live yet, only the preview page at `/pricing-v2`.

## What's NOT yet built (Days 2-4 work)

- Google Ads API live integration (waiting on MCC approval — code stub ready)
- Meta Ads API live integration (waiting on BM approval — code stub ready)
- A2P 10DLC auto-registration on signup
- Customer support inbox / triage routing
- Atlanta, Houston, Phoenix permit adapters (3 of 5 metros done — NYC, Chicago, LA)
- Webflow API publishing (WordPress works, Webflow has a TODO)
- E2E browser test suite

The system is functional today for: SMB Receptionist + Office Manager (existing tiers), plus Concierge weekly reports + lead sourcing + content generation + competitor intel + reactivation campaigns (new). Live ad management ships the day Google/Meta approve.
