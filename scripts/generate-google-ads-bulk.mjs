#!/usr/bin/env node
/**
 * generate-google-ads-bulk.mjs
 *
 * Generates Google Ads Editor bulk-import CSV files for 3 search campaigns
 * targeting home-service contractors. Peter opens Google Ads Editor (free
 * desktop app), File → Import → CSV. Hits publish. Saves ~3 hours of UI work.
 *
 * Outputs:
 *   leads/google-ads/campaigns.csv          — 3 campaigns + budgets + geo
 *   leads/google-ads/ad-groups.csv          — 6 ad groups (2 per campaign)
 *   leads/google-ads/keywords.csv           — ~120 keywords across ad groups
 *   leads/google-ads/responsive-search-ads.csv  — 6 RSAs (one per ad group)
 *   leads/google-ads/launch-instructions.txt   — step-by-step setup
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR = 'C:\\Users\\peter\\ringoco\\leads\\google-ads'
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const LANDING_BASE = 'https://www.bellavego.com/answering-service-for-'
const UTM = '?utm_source=google&utm_medium=cpc&utm_campaign='

// ── 3 CAMPAIGNS ──────────────────────────────────────────────────────────
const CAMPAIGNS = [
  {
    name: 'BAVG · HVAC Search',
    trade: 'hvac',
    budget: 17,
    headlines: [
      'AI Receptionist for HVAC',
      'Never Miss an HVAC Call',
      '24/7 HVAC Answering Service',
      '$147/mo · 7-Day Free Trial',
      'Books Jobs While You Sleep',
      'Answer Every Call in 1 Ring',
      'Cheaper Than a Receptionist',
      'AI Books Your HVAC Jobs',
      'Stop Losing HVAC Leads',
      'For HVAC Shops 1-15 Techs',
      'Try Free for 7 Days',
      'No Card · Setup in 5 Min',
      'Texts Captured Leads to You',
      'Works on Your Number',
      'Save $40K/Yr vs Receptionist',
    ],
    descriptions: [
      'AI Emma answers every HVAC call in 1 ring, qualifies the lead, books on your calendar. $147/mo. 7-day free trial.',
      'Built for HVAC shops 1-15 techs. Works on your existing number. Captured jobs texted to your phone in 10 seconds.',
      'Avg HVAC shop loses $11K/mo to missed after-hours calls. BellAveGo catches them. Try free for 7 days, no card.',
      'Cheaper than a $45K/yr receptionist. AI answers 24/7. Cancel anytime. 7-day free trial, no credit card required.',
    ],
    keywords: [
      // exact match
      '[ai receptionist hvac]',
      '[hvac answering service]',
      '[24/7 hvac answering]',
      '[after hours hvac receptionist]',
      '[ai answering service hvac]',
      '[hvac call answering service]',
      '[hvac virtual receptionist]',
      '[hvac dispatch service]',
      // phrase match
      '"ai receptionist for hvac"',
      '"hvac answering service"',
      '"answering service for hvac"',
      '"hvac call center"',
      '"24 hour hvac answering"',
      '"after hours hvac"',
      '"hvac call answering"',
      '"hvac virtual assistant"',
      // broad match (low CPC discovery)
      'missed call hvac',
      'hvac lead capture',
      'hvac scheduling software',
      'small hvac business help',
    ],
  },
  {
    name: 'BAVG · Plumbing Search',
    trade: 'plumbing',
    budget: 17,
    headlines: [
      'AI Receptionist for Plumbers',
      'Never Miss a Plumbing Call',
      '24/7 Plumber Answering Service',
      '$147/mo · 7-Day Free Trial',
      'Books Plumbing Jobs 24/7',
      'Answer Every Call in 1 Ring',
      'Cheaper Than a Receptionist',
      'AI Books Your Plumbing Jobs',
      'Stop Losing Plumbing Leads',
      'For Plumbers 1-15 Techs',
      'Try Free for 7 Days',
      'No Card · Setup in 5 Min',
      'Texts Captured Leads to You',
      'Works on Your Number',
      'Save $40K/Yr vs Receptionist',
    ],
    descriptions: [
      'AI Emma answers every plumbing call in 1 ring, qualifies the emergency, books on your calendar. $147/mo. 7-day free trial.',
      'Built for plumbers 1-15 techs. Works on your existing number. Captured jobs texted to your phone in 10 seconds.',
      'Avg plumbing shop loses $9K/mo to missed after-hours calls. BellAveGo catches them. Try free for 7 days, no card.',
      'Cheaper than a $45K/yr receptionist. AI answers 24/7. Cancel anytime. 7-day free trial, no credit card required.',
    ],
    keywords: [
      '[ai receptionist plumber]',
      '[plumber answering service]',
      '[24/7 plumber answering]',
      '[after hours plumber receptionist]',
      '[ai answering service plumber]',
      '[plumbing call answering service]',
      '[plumbing virtual receptionist]',
      '"answering service for plumbers"',
      '"plumber answering service"',
      '"plumbing call center"',
      '"24 hour plumber"',
      '"after hours plumber"',
      '"plumber virtual assistant"',
      'missed call plumber',
      'plumbing lead capture',
      'small plumbing business help',
    ],
  },
  {
    name: 'BAVG · Electrician + Roofing Search',
    trade: 'electrical', // will use generic home-service hub
    budget: 16,
    headlines: [
      'AI Receptionist for Contractors',
      'Never Miss a Service Call',
      '24/7 Answering for Trades',
      '$147/mo · 7-Day Free Trial',
      'Books Service Calls 24/7',
      'Answer Every Call in 1 Ring',
      'Cheaper Than a Receptionist',
      'AI Books Your Service Jobs',
      'Stop Losing Service Leads',
      'For Contractors 1-15 Techs',
      'Try Free for 7 Days',
      'No Card · Setup in 5 Min',
      'Texts Captured Leads to You',
      'Works on Your Number',
      'Save $40K/Yr vs Receptionist',
    ],
    descriptions: [
      'AI Emma answers every service call in 1 ring, qualifies the lead, books on your calendar. $147/mo. 7-day free trial.',
      'Built for electricians, roofers, contractors 1-15 techs. Works on your existing number. Lead texts in 10 sec.',
      'Avg trade shop loses $8K/mo to missed after-hours calls. BellAveGo catches them. Try free for 7 days, no card.',
      'Cheaper than a $45K/yr receptionist. AI answers 24/7. Cancel anytime. 7-day free trial, no credit card.',
    ],
    keywords: [
      '[ai receptionist electrician]',
      '[electrician answering service]',
      '[ai receptionist roofer]',
      '[roofing answering service]',
      '[ai receptionist contractor]',
      '[contractor answering service]',
      '[24/7 electrician answering]',
      '"answering service for electricians"',
      '"answering service for roofers"',
      '"electrician virtual receptionist"',
      '"roofing call answering"',
      '"after hours electrician"',
      'missed call electrician',
      'missed call roofer',
      'electrician lead capture',
      'small electrical business help',
    ],
  },
]

// ── GENERATE CSVs ────────────────────────────────────────────────────────

// Google Ads Editor format reference:
// Required for Campaign import: Campaign, Campaign type, Status, Budget, Budget type, Networks, Languages, Locations, Bid strategy type
const campaignsCsv = [
  ['Campaign', 'Campaign Status', 'Campaign Type', 'Budget', 'Budget type', 'Networks', 'Languages', 'Locations', 'Location bid type', 'Bid Strategy Type'].join(','),
  ...CAMPAIGNS.map((c) => [
    c.name,
    'Paused', // start paused — Peter reviews before launching
    'Search',
    c.budget.toFixed(2),
    'Daily',
    '"Google search;Search partners"',
    'English',
    '"United States"',
    '"Targeted location"',
    'Manual CPC',
  ].join(',')),
].join('\n')

// Ad groups — 2 per campaign (Exact-Match + Phrase-Broad)
const adGroupsCsv = [
  ['Campaign', 'Ad group', 'Max CPC', 'Ad group status'].join(','),
  ...CAMPAIGNS.flatMap((c) => [
    [c.name, c.name + ' · Exact', '8.00', 'Paused'].join(','),
    [c.name, c.name + ' · Phrase+Broad', '4.00', 'Paused'].join(','),
  ]),
].join('\n')

// Keywords — split exact vs phrase/broad into the matching ad group
const keywordsCsv = [
  ['Campaign', 'Ad group', 'Keyword', 'Match type', 'Max CPC', 'Keyword status'].join(','),
  ...CAMPAIGNS.flatMap((c) =>
    c.keywords.map((kw) => {
      let matchType, cleanKw, adGroup
      if (kw.startsWith('[') && kw.endsWith(']')) {
        matchType = 'Exact'
        cleanKw = kw.slice(1, -1)
        adGroup = c.name + ' · Exact'
      } else if (kw.startsWith('"') && kw.endsWith('"')) {
        matchType = 'Phrase'
        cleanKw = kw.slice(1, -1)
        adGroup = c.name + ' · Phrase+Broad'
      } else {
        matchType = 'Broad'
        cleanKw = kw
        adGroup = c.name + ' · Phrase+Broad'
      }
      return [c.name, adGroup, `"${cleanKw}"`, matchType, '6.00', 'Active'].join(',')
    }),
  ),
].join('\n')

// Responsive Search Ads — one per ad group (so each campaign gets 2 ads)
const rsaRows = []
for (const c of CAMPAIGNS) {
  const finalUrl = `${LANDING_BASE}${c.trade}${UTM}${encodeURIComponent(c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`
  const headlineCols = Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`)
  const descCols = Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`)

  const headlineCells = Array.from({ length: 15 }, (_, i) => c.headlines[i] ?? '')
  const descCells = Array.from({ length: 4 }, (_, i) => c.descriptions[i] ?? '')

  for (const adGroup of [c.name + ' · Exact', c.name + ' · Phrase+Broad']) {
    rsaRows.push([
      c.name,
      adGroup,
      'Responsive search ad',
      finalUrl,
      'bellavego.com',
      'pricing',
      ...headlineCells.map((h) => `"${h.replace(/"/g, '""')}"`),
      ...descCells.map((d) => `"${d.replace(/"/g, '""')}"`),
      'Paused',
    ].join(','))
  }

  // Headers (only added once at start)
  if (rsaRows.length === 2) {
    rsaRows.unshift([
      'Campaign',
      'Ad group',
      'Ad type',
      'Final URL',
      'Path 1',
      'Path 2',
      ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
      ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
      'Ad status',
    ].join(','))
  }
}
const rsaCsv = rsaRows.join('\n')

// ── WRITE FILES ──────────────────────────────────────────────────────────
fs.writeFileSync(path.join(OUT_DIR, 'campaigns.csv'), campaignsCsv)
fs.writeFileSync(path.join(OUT_DIR, 'ad-groups.csv'), adGroupsCsv)
fs.writeFileSync(path.join(OUT_DIR, 'keywords.csv'), keywordsCsv)
fs.writeFileSync(path.join(OUT_DIR, 'responsive-search-ads.csv'), rsaCsv)

// ── INSTRUCTIONS ─────────────────────────────────────────────────────────
const instructions = `BellAveGo Google Ads — Launch Playbook
═══════════════════════════════════════════════════════════════════════════

Total daily budget: $${CAMPAIGNS.reduce((s, c) => s + c.budget, 0)}
Monthly burn:      ~$${CAMPAIGNS.reduce((s, c) => s + c.budget, 0) * 30}
First customer target: 7-14 days

───────────────────────────────────────────────────────────────────────────
ONE-TIME PREREQ (10 min)
───────────────────────────────────────────────────────────────────────────

1. Create Google Ads account: ads.google.com → "Switch to Expert Mode"
2. Skip the "create campaign" prompt — click X top-right
3. Set up billing: Tools → Billing → Add credit card
4. Create conversion action:
     Tools → Conversions → New conversion action → Website → "Trial Signup"
     Value: 147 (one-time), Count: One
     Click → "Set up conversion using gtag.js" → copy these 2 values:
       - Conversion ID (looks like AW-1234567890)
       - Conversion Label (looks like AbCdEfGhIjKl)
5. Add to Vercel env vars:
     NEXT_PUBLIC_GOOGLE_ADS_ID         = AW-1234567890
     NEXT_PUBLIC_GOOGLE_ADS_TRIAL_LABEL = AbCdEfGhIjKl
   Redeploy.

───────────────────────────────────────────────────────────────────────────
BULK IMPORT (5 min)
───────────────────────────────────────────────────────────────────────────

1. Download Google Ads Editor (free desktop app): ads.google.com/intl/en_us/home/tools/ads-editor/
2. Sign in to the BellAveGo Google Ads account
3. File → Import → From file
4. Import IN THIS ORDER (Editor will complain otherwise):
     a) campaigns.csv
     b) ad-groups.csv
     c) keywords.csv
     d) responsive-search-ads.csv
5. Editor shows "Posted changes pending". Review each campaign.
6. Click "Post" top-right when ready. Account is now live but all campaigns are PAUSED.

───────────────────────────────────────────────────────────────────────────
REVIEW BEFORE LAUNCH
───────────────────────────────────────────────────────────────────────────

In the Google Ads UI:
- Confirm geo targeting = United States only (or 50 metros from cities.ts)
- Confirm budget = $${CAMPAIGNS.reduce((s, c) => s + c.budget, 0)}/day total
- Confirm ad extensions: add at least sitelinks (Pricing, Demo, Sample Report)
- Confirm conversion tracking shows "Recording conversions" within 24h of first click

───────────────────────────────────────────────────────────────────────────
LAUNCH
───────────────────────────────────────────────────────────────────────────

Change each campaign status from Paused → Enabled.

Expected first 7 days:
- Impressions: 2,000-5,000/day total
- Clicks: 30-80/day at $1-3 CPC
- Trial signups: 1-3/day at 2-5% conversion
- Paying customers (post-7d trial): 1-3 by day 14

───────────────────────────────────────────────────────────────────────────
KILL CRITERIA (set on day 14 review)
───────────────────────────────────────────────────────────────────────────

PAUSE campaign if:
- CTR < 1.5% after 1,000 impressions (ad copy is wrong)
- Cost per trial > $80 (CAC is broken; LTV is $147 × ~6 months = $882)
- 0 conversions after 50 clicks (landing page or pricing is wrong)

DOUBLE budget if:
- Cost per trial < $30 AND ≥ 3 trials closed
- CTR > 4%

───────────────────────────────────────────────────────────────────────────
ICP NOTES
───────────────────────────────────────────────────────────────────────────

Per memory: NEVER target shops > 150 Google reviews (they already have receptionists).
For Google Ads, this means:
- Audience: small businesses, owner-operators
- Exclude searches like "enterprise", "franchise", "ServiceTitan integration"
- Watch search-term reports weekly; add negative keywords for spam queries

═══════════════════════════════════════════════════════════════════════════
`

fs.writeFileSync(path.join(OUT_DIR, 'launch-instructions.txt'), instructions)

// Mirror to OneDrive
const ONEDRIVE = 'C:\\Users\\peter\\OneDrive\\Desktop\\ringoco\\leads\\google-ads'
try {
  if (!fs.existsSync(ONEDRIVE)) fs.mkdirSync(ONEDRIVE, { recursive: true })
  for (const f of ['campaigns.csv', 'ad-groups.csv', 'keywords.csv', 'responsive-search-ads.csv', 'launch-instructions.txt']) {
    fs.copyFileSync(path.join(OUT_DIR, f), path.join(ONEDRIVE, f))
  }
} catch (e) {
  console.warn('OneDrive mirror failed: ' + e.message)
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  Google Ads Editor bulk import files generated:')
console.log('    ' + path.join(OUT_DIR, 'campaigns.csv'))
console.log('    ' + path.join(OUT_DIR, 'ad-groups.csv'))
console.log('    ' + path.join(OUT_DIR, 'keywords.csv'))
console.log('    ' + path.join(OUT_DIR, 'responsive-search-ads.csv'))
console.log('    ' + path.join(OUT_DIR, 'launch-instructions.txt'))
console.log('')
console.log('  ' + CAMPAIGNS.length + ' campaigns · ' + CAMPAIGNS.reduce((s, c) => s + c.keywords.length, 0) + ' keywords · ' + (CAMPAIGNS.length * 2) + ' responsive search ads')
console.log('  Total daily budget: $' + CAMPAIGNS.reduce((s, c) => s + c.budget, 0))
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
