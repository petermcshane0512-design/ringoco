'use client'
import Link from 'next/link'

/**
 * Lead Report showcase — homepage anchor section.
 *
 * Replaces the older "consulting report" framing (Q1 growth report cover +
 * build terminal) with the actual artifact contractors get: a Monday lead
 * drop listing 15 high-intent homeowners in their service area plus the
 * specific reason BellAveGo flagged each one.
 *
 * Layout (per Peter, 2026-06-06):
 *   ~90% — the 15-lead Phoenix HVAC sample table (the real product)
 *   ~10% — small "Calls answered this month + revenue captured" strip
 *
 * Demo client is "Sun Valley HVAC, Phoenix AZ" so the leads can lean into
 * the regional reality (haboob dust, IRA/APS rebates, summer load, etc.)
 * without being a real contractor's data.
 */

export type Tag = 'New Move-In' | 'Aging Unit' | 'Pool Permit' | 'Storm Zone' | 'Rebate Window' | 'Rental Owner' | 'Switch Target' | 'Pre-Listing' | 'Solar Stack' | 'New Build'

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
  // ── TOP 5 (shown on homepage) — sorted by score, headline cases first ──
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
  // ── REMAINING 15 (shown only on /sample-report full report view) ──
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

// Homepage shows the top 5 only — the full /sample-report page renders all 20.
const TOP_LEADS = LEADS.slice(0, 5)
const TOP_PIPELINE = TOP_LEADS.reduce((sum, l) => sum + l.est, 0)
const TOTAL_LEAD_COUNT = LEADS.length

// Bottom 10% — phone-call activity strip. Numbers stay generic so the
// section reads as a realistic Sun Valley HVAC month without quoting any
// specific real tenant's metrics.
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

export default function ConsultingShowcase() {
  return (
    <section className="cs-root">
      <style>{`
        .cs-root {
          position: relative;
          padding: 60px 32px 64px;
          background:
            radial-gradient(900px 500px at 90% 8%, rgba(232,123,55,0.18), transparent 65%),
            radial-gradient(700px 500px at 8% 92%, rgba(94,234,212,0.10), transparent 65%),
            linear-gradient(180deg, #050E1F 0%, #0B1F3A 55%, #112C4A 100%);
          color: #fff;
          overflow: hidden;
          border-bottom: 1px solid rgba(94,234,212,0.18);
        }
        .cs-root::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(94,234,212,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(94,234,212,0.045) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 55%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 55%, transparent 100%);
          pointer-events: none;
        }
        .cs-wrap { max-width: 1180px; margin: 0 auto; position: relative; z-index: 1; }

        /* Header */
        .cs-head { text-align: center; max-width: 760px; margin: 0 auto 28px; }
        .cs-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 5px 12px;
          border-radius: 99px;
          background: rgba(94,234,212,0.10);
          border: 1px solid rgba(94,234,212,0.30);
          font-size: 10.5px; font-weight: 800;
          color: #5EEAD4; letter-spacing: 0.18em; text-transform: uppercase;
          margin-bottom: 14px;
        }
        .cs-eyebrow::before {
          content: ''; width: 6px; height: 6px; border-radius: 50%;
          background: #22C55E; box-shadow: 0 0 8px rgba(34,197,94,0.7);
          animation: csBlink 1.6s infinite;
        }
        .cs-h2 {
          font-size: clamp(26px, 3.4vw, 42px);
          font-weight: 900; line-height: 1.04;
          letter-spacing: -0.04em;
          margin: 0 0 12px;
          color: #fff;
        }
        .cs-h2 .money {
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 35%, #E8742B 70%, #C84B26 100%);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          filter: drop-shadow(0 0 24px rgba(232,116,43,0.35));
        }
        .cs-sub { font-size: 15px; line-height: 1.55; color: rgba(255,255,255,0.72); margin: 0; max-width: 680px; margin-left: auto; margin-right: auto; }

        /* Report frame */
        .cs-report {
          background: linear-gradient(165deg, #0F2542 0%, #0A1B33 100%);
          border: 1px solid rgba(94,234,212,0.24);
          border-radius: 18px;
          box-shadow:
            0 30px 70px rgba(0,0,0,0.45),
            0 0 0 1px rgba(94,234,212,0.10),
            inset 0 1px 0 rgba(255,255,255,0.05);
          overflow: hidden;
          margin-bottom: 22px;
        }
        .cs-rep-head {
          padding: 18px 24px;
          background: linear-gradient(135deg, rgba(232,116,43,0.08), rgba(94,234,212,0.06));
          border-bottom: 1px solid rgba(94,234,212,0.14);
          display: flex; align-items: center; justify-content: space-between; gap: 14px;
          flex-wrap: wrap;
        }
        .cs-rep-titlewrap { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .cs-rep-ico {
          width: 42px; height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          box-shadow: 0 8px 18px rgba(232,116,43,0.42);
          flex-shrink: 0;
        }
        .cs-rep-tagstrip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cs-rep-tag {
          font-size: 9.5px; font-weight: 800;
          color: #FF9D5A; letter-spacing: 0.18em; text-transform: uppercase;
          padding: 3px 9px; border-radius: 99px;
          background: rgba(232,116,43,0.10);
          border: 1px solid rgba(232,116,43,0.32);
        }
        .cs-rep-title {
          font-size: 18px; font-weight: 900; color: #fff;
          letter-spacing: -0.3px; margin: 4px 0 2px;
        }
        .cs-rep-sub {
          font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 600;
        }
        .cs-rep-pipeline {
          text-align: right; flex-shrink: 0;
        }
        .cs-rep-pipeline .lab {
          font-size: 9px; font-weight: 800;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: rgba(255,255,255,0.55); margin-bottom: 3px;
        }
        .cs-rep-pipeline .num {
          font-size: 28px; font-weight: 900;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          letter-spacing: -0.5px; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .cs-rep-pipeline .lab2 { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.55); margin-top: 3px; }

        /* Leads table */
        .cs-leads-wrap { padding: 4px 10px 14px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .cs-leads { width: 100%; border-collapse: collapse; min-width: 760px; }
        .cs-leads th {
          text-align: left;
          padding: 12px 12px 8px;
          font-size: 9.5px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
          color: rgba(94,234,212,0.85);
          border-bottom: 1px solid rgba(94,234,212,0.14);
          background: rgba(255,255,255,0.015);
          position: sticky; top: 0;
        }
        .cs-leads td {
          padding: 14px 12px;
          font-size: 12.5px;
          color: rgba(255,255,255,0.85);
          border-bottom: 1px solid rgba(94,234,212,0.07);
          vertical-align: top;
        }
        .cs-leads tr:last-child td { border-bottom: none; }
        .cs-leads tr:hover td { background: rgba(94,234,212,0.04); }

        .cs-lead-num {
          color: rgba(255,255,255,0.45);
          font-size: 11px; font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .cs-lead-owner { font-weight: 800; color: #fff; letter-spacing: -0.1px; font-size: 13px; }
        .cs-lead-addr { color: rgba(255,255,255,0.55); font-size: 10.5px; margin-top: 2px; line-height: 1.4; }

        .cs-lead-tagchip {
          display: inline-block;
          font-size: 9.5px; font-weight: 800;
          padding: 3px 8px; border-radius: 99px;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .cs-lead-why {
          color: rgba(255,255,255,0.82);
          font-size: 12px; line-height: 1.5;
          max-width: 360px;
        }

        .cs-lead-phone {
          font-size: 13px; font-weight: 800;
          color: #5EEAD4;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
          white-space: nowrap;
        }
        .cs-lead-score {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 800;
          padding: 3px 8px; border-radius: 8px;
          background: rgba(34,197,94,0.10);
          border: 1px solid rgba(34,197,94,0.30);
          color: #86EFAC;
          font-variant-numeric: tabular-nums;
        }
        .cs-lead-est {
          font-size: 13px; font-weight: 900;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
          white-space: nowrap;
        }
        .cs-lead-call {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 11px;
          border-radius: 8px;
          background: linear-gradient(135deg, #FF9D5A, #E8742B);
          color: #fff !important;
          font-size: 11px; font-weight: 800;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(232,116,43,0.42);
          white-space: nowrap;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .cs-lead-call:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(232,116,43,0.55);
        }

        /* Bottom 10% — calls answered strip */
        .cs-callstrip {
          background:
            radial-gradient(600px 220px at 90% 0%, rgba(94,234,212,0.10), transparent 70%),
            linear-gradient(165deg, #0F2542 0%, #0A1B33 100%);
          border: 1px solid rgba(94,234,212,0.22);
          border-radius: 16px;
          padding: 18px 22px;
          margin-bottom: 22px;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 18px;
          align-items: center;
        }
        @media (max-width: 880px) { .cs-callstrip { grid-template-columns: 1fr; } }
        .cs-callstrip-label {
          font-size: 9.5px; font-weight: 800;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: #5EEAD4;
          padding: 4px 10px; border-radius: 99px;
          background: rgba(94,234,212,0.10);
          border: 1px solid rgba(94,234,212,0.30);
          display: inline-block;
          margin-bottom: 4px;
        }
        .cs-callstrip-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        @media (max-width: 720px) { .cs-callstrip-grid { grid-template-columns: repeat(2, 1fr); } }
        .cs-cs-stat .num {
          font-size: 22px; font-weight: 900;
          background: linear-gradient(135deg, #5EEAD4, #14B8A6);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          letter-spacing: -0.4px; line-height: 1.05;
          font-variant-numeric: tabular-nums;
        }
        .cs-cs-stat.money .num {
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .cs-cs-stat .lab {
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,0.55);
          letter-spacing: 0.06em; text-transform: uppercase;
          margin-top: 4px;
        }
        .cs-cs-top {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(232,116,43,0.08);
          border: 1px solid rgba(232,116,43,0.30);
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-wrap: wrap;
        }
        .cs-cs-top .left { min-width: 0; }
        .cs-cs-top .tag {
          display: inline-block;
          font-size: 8.5px; font-weight: 800;
          color: #FF9D5A; letter-spacing: 0.16em; text-transform: uppercase;
          margin-bottom: 2px;
        }
        .cs-cs-top .who { font-size: 13px; font-weight: 800; color: #fff; }
        .cs-cs-top .note { font-size: 11.5px; color: rgba(255,255,255,0.6); margin-top: 2px; }
        .cs-cs-top .val {
          font-size: 18px; font-weight: 900;
          background: linear-gradient(135deg, #FFD9A8, #FF9D5A 50%, #E8742B);
          -webkit-background-clip: text; background-clip: text; color: transparent;
          font-variant-numeric: tabular-nums;
        }

        /* CTA row */
        .cs-cta-row {
          display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;
        }
        .cs-cta-primary {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 16px 28px;
          border-radius: 12px;
          background: linear-gradient(135deg, #FFD9A8 0%, #FF9D5A 40%, #E8742B 100%);
          color: #0B1F3A;
          font-weight: 900; font-size: 15px;
          text-decoration: none;
          border: 1px solid rgba(255,217,168,0.55);
          box-shadow: 0 14px 36px rgba(232,116,43,0.42), inset 0 1px 0 rgba(255,255,255,0.55);
          transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.22s ease, filter 0.22s ease;
        }
        .cs-cta-primary:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 20px 50px rgba(232,116,43,0.6), inset 0 1px 0 rgba(255,255,255,0.55);
          filter: brightness(1.04);
        }
        .cs-cta-secondary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 16px 24px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(94,234,212,0.30);
          color: #fff;
          font-weight: 700; font-size: 14px;
          text-decoration: none;
          transition: background 0.2s, border-color 0.2s, transform 0.2s;
        }
        .cs-cta-secondary:hover {
          background: rgba(94,234,212,0.10);
          border-color: rgba(94,234,212,0.55);
          transform: translateY(-1px);
        }

        @media (max-width: 720px) {
          .cs-cta-row { flex-direction: column; align-items: stretch; gap: 10px; width: 100%; padding: 0 6px; box-sizing: border-box; }
          .cs-cta-primary, .cs-cta-secondary { width: 100%; box-sizing: border-box; justify-content: center; text-align: center; padding: 14px 18px; font-size: 14px; white-space: normal; }
        }

        @keyframes csBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
      `}</style>

      <div className="cs-wrap">
        {/* Header */}
        <header className="cs-head">
          <span className="cs-eyebrow">Weekly Report · Included on every plan</span>
          <h2 className="cs-h2">
            5 fresh leads in your neighborhood. <span className="money">Real homes. Real reasons. Real phone numbers. Every week.</span>
          </h2>
          <p className="cs-sub">
            Every Monday BellAveGo drops 5 high-intent homeowners straight to your dashboard. We mine new permits, deed transfers, aging-HVAC homes, new neighbors moving in, storm-damage zones, rebate-window claims, pre-listing tune-ups, rental-owner emergencies, energy-bill spikes, estate &amp; probate transitions, solar-stack add-ons, and competitor-switch targets — pre-qualified, ranked by addressable revenue, and ready to call. Below is a real sample week for a Phoenix HVAC shop.
          </p>
        </header>

        {/* THE REPORT — 90% of the section */}
        <div className="cs-report">
          <div className="cs-rep-head">
            <div className="cs-rep-titlewrap">
              <div className="cs-rep-ico">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/>
                  <line x1="9" y1="17" x2="13" y2="17"/>
                </svg>
              </div>
              <div>
                <div className="cs-rep-tagstrip">
                  <span className="cs-rep-tag">Lead Report</span>
                  <span className="cs-rep-tag" style={{ color: '#5EEAD4', borderColor: 'rgba(94,234,212,0.32)', background: 'rgba(94,234,212,0.10)' }}>Week of June 9, 2026</span>
                </div>
                <div className="cs-rep-title">Sun Valley HVAC · Phoenix, AZ</div>
                <div className="cs-rep-sub">Top 5 of this week · ranked by addressable revenue × intent score</div>
              </div>
            </div>
            <div className="cs-rep-pipeline">
              <div className="lab">Top-5 Pipeline Value</div>
              <div className="num">{usd(TOP_PIPELINE)}</div>
              <div className="lab2">this week alone</div>
            </div>
          </div>

          <div className="cs-leads-wrap">
            <table className="cs-leads">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>#</th>
                  <th>Homeowner</th>
                  <th>Why you should call</th>
                  <th>Phone</th>
                  <th>Score</th>
                  <th style={{ textAlign: 'right' }}>Est. Job</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {TOP_LEADS.map((l, i) => {
                  const ts = TAG_STYLES[l.tag]
                  const telHref = 'tel:+1' + l.phone.replace(/[^0-9]/g, '')
                  return (
                    <tr key={i}>
                      <td><span className="cs-lead-num">{String(i + 1).padStart(2, '0')}</span></td>
                      <td>
                        <div className="cs-lead-owner">{l.owner}</div>
                        <div className="cs-lead-addr">{l.address}</div>
                        <div style={{ marginTop: 6 }}>
                          <span className="cs-lead-tagchip" style={{ background: ts.bg, color: ts.color, border: '1px solid ' + ts.border }}>{l.tag}</span>
                        </div>
                      </td>
                      <td><div className="cs-lead-why">{l.why}</div></td>
                      <td><div className="cs-lead-phone">{l.phone}</div></td>
                      <td><span className="cs-lead-score">{l.score.toFixed(1)} / 10</span></td>
                      <td style={{ textAlign: 'right' }}><div className="cs-lead-est">{usd(l.est)}</div></td>
                      <td style={{ textAlign: 'right' }}>
                        <a className="cs-lead-call" href={telHref}>
                          Call
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                          </svg>
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom 10% — calls answered + revenue strip */}
        <div className="cs-callstrip">
          <div>
            <div className="cs-callstrip-label">Also this month</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '-0.2px' }}>
              Your AI receptionist worked while you slept.
            </div>
          </div>
          <div>
            <div className="cs-callstrip-grid">
              <div className="cs-cs-stat">
                <div className="num">{CALLS.answered}</div>
                <div className="lab">Calls Answered</div>
              </div>
              <div className="cs-cs-stat">
                <div className="num">{CALLS.bookedJobs}</div>
                <div className="lab">Jobs Booked</div>
              </div>
              <div className="cs-cs-stat money">
                <div className="num">{usd(CALLS.estRevenueCaptured)}</div>
                <div className="lab">Est. Revenue Captured</div>
              </div>
              <div className="cs-cs-stat money">
                <div className="num">{usd(CALLS.avgTicket)}</div>
                <div className="lab">Avg Ticket</div>
              </div>
            </div>
            <div className="cs-cs-top">
              <div className="left">
                <div className="tag">Biggest call this month</div>
                <div className="who">{CALLS.topCall.customer}</div>
                <div className="note">{CALLS.topCall.note}</div>
              </div>
              <div className="val">{usd(CALLS.topCall.value)}</div>
            </div>
          </div>
        </div>

        {/* CTA row */}
        <div className="cs-cta-row">
          <Link href="/monthly-report" className="cs-cta-primary">
            View Full Monthly Report of {TOTAL_LEAD_COUNT}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
          <Link href="/pricing" className="cs-cta-secondary">
            Get my weekly lead drop
          </Link>
        </div>
      </div>
    </section>
  )
}
