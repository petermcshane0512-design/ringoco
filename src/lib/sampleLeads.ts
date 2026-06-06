/**
 * Marketing-page sample lead data.
 *
 * Lives in a pure module (not the 'use client' ConsultingShowcase
 * component) so both server pages (/monthly-report) and client components
 * can import it without breaking Next.js static collection.
 *
 * 20 fictional Phoenix-area HVAC leads — used on the homepage Lead Report
 * showcase (top 5) and the full /monthly-report (all 20, sliced into 4
 * weekly drops). Phone numbers are deliberately fake (555 series).
 */

export type Tag =
  | 'New Move-In' | 'Aging Unit' | 'Pool Permit' | 'Storm Zone'
  | 'Rebate Window' | 'Rental Owner' | 'Switch Target' | 'Pre-Listing'
  | 'Solar Stack' | 'New Build'

export type Lead = {
  owner: string
  address: string
  phone: string
  tag: Tag
  why: string
  est: number   // estimated job value, USD
  score: number // BellAveGo lead score, 0-10
}

export const LEADS: Lead[] = [
  // ── TOP 5 (homepage) ──
  {
    owner: 'Daniel & Sara Bachman',
    address: '6712 N 7th St, Phoenix 85014',
    phone: '(623) 555-0317',
    tag: 'Aging Unit',
    why: 'Single-family built 1998. Property record + last permit show original Carrier unit, now year 28. Avg PHX lifespan 15-20 yrs. Statistically already had 2+ emergency repairs this season — they are waiting for the next one.',
    est: 9800,
    score: 9.6,
  },
  {
    owner: 'Aurelia Vázquez',
    address: '2476 N 16th St, Phoenix 85006',
    phone: '(602) 555-1118',
    tag: 'Rebate Window',
    why: 'Submitted SRP rebate application for 16+ SEER heat pump. Pre-approved, looking for installer. Window expires Sep 30 — caller-side urgency does the closing for you. Average rebate-driven install: $11,400.',
    est: 11400,
    score: 9.5,
  },
  {
    owner: 'Dana Friedhoff',
    address: '9201 E Sweetwater Ave, Scottsdale 85260',
    phone: '(480) 555-1540',
    tag: 'Switch Target',
    why: 'Long-time customer of competitor "Cool-Tech AZ." Public Yelp review history shows 1-star on last 4 service visits ("never showed up", "doubled the quote"). Ripe for switch. Estimated 3-zone home, 2 condensers.',
    est: 14800,
    score: 9.4,
  },
  {
    owner: 'Marcus Reyes',
    address: '4517 E Cactus Blvd, Phoenix 85032',
    phone: '(602) 555-0184',
    tag: 'New Move-In',
    why: 'Closed on 3,200 sqft home 19 days ago. Maricopa County permit history shows AC unit last serviced 2008 (Carrier 38AKS, 17 yrs old). Move-in 90-day window = peak service-intent. Pitch pre-summer tune-up + replacement quote.',
    est: 8400,
    score: 9.4,
  },
  {
    owner: 'Jamal Whitfield',
    address: '9408 S 51st Ave, Laveen 85339',
    phone: '(602) 555-0408',
    tag: 'New Move-In',
    why: 'Just moved from CA Mar 2026 (out-of-state mover, AC-naive). Listing photos show outdoor condenser caked in dust + missing capacitor cap — both pre-failure indicators. First haboob takes it out.',
    est: 6100,
    score: 9.3,
  },
  // ── REMAINING 15 (full report view only) ──
  {
    owner: 'Brian Coats',
    address: '6101 N Black Canyon Hwy, Phoenix 85015',
    phone: '(623) 555-1245',
    tag: 'Aging Unit',
    why: 'Home built 1972. No HVAC permit on file since 1992 (34 yrs). Statistical near-certainty of full system replacement need. Lead score 9.2/10 by replacement-probability model.',
    est: 12000,
    score: 9.2,
  },
  {
    owner: 'Frank Salerno',
    address: '5689 W Glendale Ave, Glendale 85301',
    phone: '(623) 555-0834',
    tag: 'Solar Stack',
    why: 'New solar permit filed (Sunrun, 8.4kW). Solar customers stack IRA 25C tax credit by adding heat-pump replacement in same tax yr. Pitch bundled install for combined ~$3,000 credit.',
    est: 13500,
    score: 9.2,
  },
  {
    owner: 'Lisa Tran',
    address: '2891 W Indian School Rd, Phoenix 85015',
    phone: '(480) 555-0291',
    tag: 'Pool Permit',
    why: 'New pool permit filed Apr 12. Pool installs add 8-12k BTU heat load on indoor return; her existing 3.5-ton unit will run undersized starting June. Quote upsize + dedicated pool-deck mini-split.',
    est: 11200,
    score: 9.1,
  },
  {
    owner: 'Kenji Watanabe',
    address: '4422 E Camelback Rd, Phoenix 85018',
    phone: '(602) 555-1467',
    tag: 'Rental Owner',
    why: 'Owns 4-unit rental property (LLC: KW Holdings AZ). Tenant filed maintenance request via property mgmt portal for "not cooling." Landlord = decision-maker on price-no-object emergency. Same-day call wins.',
    est: 2400,
    score: 9.0,
  },
  {
    owner: 'Theresa Nguyen',
    address: '3725 E Bell Rd, Phoenix 85032',
    phone: '(602) 555-1612',
    tag: 'New Move-In',
    why: 'Estate sale closed May 19 — probate inheritance, out-of-state heir flying in to manage property. Prior owner deceased 8 mo ago, no HVAC maintenance since. Inheritor wants minimum spend to flip + rent. Tune-up + repair window.',
    est: 1700,
    score: 8.9,
  },
  {
    owner: 'Patricia Holloway',
    address: '12055 E Beverly Ln, Scottsdale 85259',
    phone: '(480) 555-0526',
    tag: 'Solar Stack',
    why: 'Zoning permit for 380 sqft room addition + new ductwork. Existing 4-ton system needs load recalc. Avg addition ticket in 85259: $8,200. Quote ductwork + supplemental zone.',
    est: 8200,
    score: 8.8,
  },
  {
    owner: 'Roberto Cantú',
    address: '3144 N 34th Ave, Phoenix 85017',
    phone: '(602) 555-0691',
    tag: 'Aging Unit',
    why: 'Filed 311 noise complaint about neighbor compressor in May. Identical neighborhood build year (1989) — same compressor likely in failure mode on his unit too. Pre-emergency call wins job over the 2am one.',
    est: 7500,
    score: 8.7,
  },
  {
    owner: 'Calvin Brooks',
    address: '7611 W Camelback Rd, Glendale 85303',
    phone: '(623) 555-1755',
    tag: 'Rebate Window',
    why: 'Disabled veteran. Filed VA HISA + AZ APS rebate paperwork for heat-pump replacement (combined credit ~$4,400). Pre-approved, looking for installer who handles VA paperwork. Lead is fully pre-qualified — just needs a yes.',
    est: 9200,
    score: 8.7,
  },
  {
    owner: 'Doug Mendelsohn',
    address: '5024 N 36th Pl, Phoenix 85018',
    phone: '(602) 555-1881',
    tag: 'Storm Zone',
    why: 'Dialed 311 about a noisy outdoor unit on May 31 — public city records mark it as "compressor seizure complaint." Confirmed unit failure within ~30 days based on prior 311 patterns in the neighborhood. Same-day visit wins.',
    est: 6800,
    score: 8.6,
  },
  {
    owner: 'Ezra Park',
    address: '8033 E Belleview Pl, Scottsdale 85257',
    phone: '(480) 555-1063',
    tag: 'New Move-In',
    why: 'Closed Feb 2026. Family of 4 + 2 dogs (Maricopa pet license records). Pet hair load doubles filter replacement cycle. Hard-sell monthly maintenance plan during move-in window.',
    est: 1800,
    score: 8.6,
  },
  {
    owner: 'Megan O\'Brien',
    address: '7820 E Vista Bonita Dr, Scottsdale 85255',
    phone: '(480) 555-0752',
    tag: 'Pre-Listing',
    why: 'Listed home for sale 6 days ago at $1.4M. AZ inspection reports always flag HVAC > 12 yrs. Pre-listing tune-up + cert letter ≈ $450 ticket + 1-2 buyer-side referrals when home closes.',
    est: 1200,
    score: 8.5,
  },
  {
    owner: 'Jenna Castillo',
    address: '1822 E Bethany Home Rd, Phoenix 85016',
    phone: '(602) 555-1994',
    tag: 'Aging Unit',
    why: 'SRP energy-use data shows her June bill is 168% higher YoY despite same square footage. Classic signal of failing compressor or refrigerant leak. Existing unit installed 2009 per permit. Energy-audit pitch wedges the sale.',
    est: 5600,
    score: 8.4,
  },
  {
    owner: 'Hannah Reichert',
    address: '14211 N 28th St, Phoenix 85032',
    phone: '(602) 555-0907',
    tag: 'Storm Zone',
    why: 'Inside Aug 2025 haboob path. Filed roof insurance claim. Outdoor condenser coil is statistically packed with dust debris. Coil-clean ($380) + duct sanitize ($620) upsell.',
    est: 1000,
    score: 8.3,
  },
  {
    owner: 'Yvette Park',
    address: '2845 E Indian School Rd, Phoenix 85016',
    phone: '(602) 555-2067',
    tag: 'New Move-In',
    why: 'New homeowner since Apr 2026, just enrolled newborn at Madison School District (Maricopa school records — new-baby-in-house signal). Young families panic-buy AC service the first hot week of summer. Time the call for next 80°+ forecast day.',
    est: 2200,
    score: 8.2,
  },
  {
    owner: 'Sofia Maldonado',
    address: '11744 W Wood Ave, Avondale 85323',
    phone: '(623) 555-1389',
    tag: 'New Build',
    why: 'New construction closing Q3 (Lennar tract). Builder warranty expires 1 yr post-move-in — buyers usually shop independent service contract before yr-1 anniversary. Lock annual maintenance now.',
    est: 540,
    score: 7.9,
  },
]

export const TOP_LEADS = LEADS.slice(0, 5)
export const TOTAL_PIPELINE = LEADS.reduce((sum, l) => sum + l.est, 0)
export const TOP_PIPELINE = TOP_LEADS.reduce((sum, l) => sum + l.est, 0)

export const CALLS = {
  answered: 87,
  bookedJobs: 31,
  estRevenueCaptured: 42300,
  avgTicket: 487,
  topCall: {
    customer: 'Maria Ruiz',
    note: 'After-hours emergency · AC out · same-day install',
    value: 11400,
  },
}

export const TAG_STYLES: Record<Tag, { bg: string; color: string; border: string }> = {
  'New Move-In':    { bg: 'rgba(94,234,212,0.12)',  color: '#5EEAD4', border: 'rgba(94,234,212,0.40)' },
  'Aging Unit':     { bg: 'rgba(232,116,43,0.14)',  color: '#FF9D5A', border: 'rgba(232,116,43,0.40)' },
  'Pool Permit':    { bg: 'rgba(59,130,246,0.14)',  color: '#93C5FD', border: 'rgba(59,130,246,0.40)' },
  'Storm Zone':     { bg: 'rgba(168,85,247,0.14)',  color: '#C4B5FD', border: 'rgba(168,85,247,0.40)' },
  'Rebate Window':  { bg: 'rgba(34,197,94,0.14)',   color: '#86EFAC', border: 'rgba(34,197,94,0.40)' },
  'Rental Owner':   { bg: 'rgba(244,114,182,0.14)', color: '#F9A8D4', border: 'rgba(244,114,182,0.40)' },
  'Switch Target':  { bg: 'rgba(251,191,36,0.14)',  color: '#FCD34D', border: 'rgba(251,191,36,0.40)' },
  'Pre-Listing':    { bg: 'rgba(20,184,166,0.14)',  color: '#5EEAD4', border: 'rgba(20,184,166,0.40)' },
  'Solar Stack':    { bg: 'rgba(255,217,168,0.18)', color: '#FFD9A8', border: 'rgba(255,217,168,0.50)' },
  'New Build':      { bg: 'rgba(148,163,184,0.18)', color: '#CBD5E1', border: 'rgba(148,163,184,0.45)' },
}

export function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}
