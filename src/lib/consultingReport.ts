export type Confidence = 'high' | 'medium' | 'low'

export type ServiceAreaPoint = {
  kind: 'business' | 'opportunity' | 'competitor'
  label: string
  /** Normalized 0–100 coordinates within the SVG viewport (not real lat/lng) */
  x: number
  y: number
  /** OPTIONAL real geographic coordinates — when present, the map uses Google
   *  native markers instead of the stylized SVG overlay. Set by the server-side
   *  enrichment step (sampleReportEnrich.ts) for real prospects. */
  lat?: number
  lng?: number
  note?: string
}

export type OutreachTarget = {
  business: string
  type: string
  address: string
  phone: string
  why: string
}

export type ConsultingReport = {
  meta: {
    businessName: string
    businessType: string
    ownerName: string
    period: string
    serviceArea: string[]
    primaryZip: string
    metroLabel: string
    generatedAt: string
    reportNumber: string
  }
  performance: {
    callsAnswered: number
    callsAnsweredDelta: number
    jobsBooked: number
    jobsBookedDelta: number
    revenue: number
    revenueDelta: number
    avgTicket: number
    avgTicketDelta: number
    callsSaved: number
    answerRate: number
  }
  bellaveScore: {
    composite: number
    answerRate: number
    bookingConversion: number
    responseTime: number
    pricingPower: number
  }
  executiveSummary: string[]
  opportunities: {
    rank: number
    title: string
    monthlyValue: number
    pattern: string
    action: string
    confidence: Confidence
  }[]
  marketScan: {
    homeownersInArea: number
    medianIncome: number
    medianHomeAge: number
    pctHvacOver15Yrs: number
    addressableRevenueMonthly: number
    seasonalSignal: string
  }
  upsells: {
    service: string
    demandSignal: string
    avgTicket: number
    closeRate: number
    monthlyOpportunity: number
  }[]
  competitive: {
    competitors: { name: string; rating: number; reviewCount: number; distance: string }[]
    yourRating: number
    yourReviewCount: number
    marketAvgRating: number
    marketAvgReviewCount: number
    yourRank: number
    totalCompetitors: number
    strengths: string[]
    gaps: string[]
  }
  serviceAreaMap: {
    centerLabel: string
    points: ServiceAreaPoint[]
  }
  outreachTargets: OutreachTarget[]
  actionPlan: {
    priority: number
    title: string
    rationale: string
    expectedImpact: string
    timeline: string
    effort: 'low' | 'medium' | 'high'
  }[]
  methodology: string
}

export const SAMPLE_REPORT: ConsultingReport = {
  meta: {
    businessName: "Mike's HVAC & Cooling",
    businessType: 'HVAC',
    ownerName: 'Mike Rasmussen',
    period: 'Q1 2026',
    serviceArea: ['55426', '55427', '55416', '55305'],
    primaryZip: '55426',
    metroLabel: 'Minneapolis – St. Louis Park',
    generatedAt: '2026-04-01',
    reportNumber: 'BAG-2026-Q1-00342',
  },
  performance: {
    callsAnswered: 195,
    callsAnsweredDelta: 0.18,
    jobsBooked: 38,
    jobsBookedDelta: 0.27,
    revenue: 24320,
    revenueDelta: 0.31,
    avgTicket: 640,
    avgTicketDelta: 0.04,
    callsSaved: 65,
    answerRate: 0.81,
  },
  bellaveScore: {
    composite: 7.4,
    answerRate: 8.1,
    bookingConversion: 7.0,
    responseTime: 9.2,
    pricingPower: 5.5,
  },
  executiveSummary: [
    "Mike's HVAC closed Q1 2026 with $24,320 in booked revenue across 38 jobs — a 31% lift over Q4 2025. The boost came almost entirely from the 65 after-hours and weekend calls BellAveGo answered while Mike was on jobsites, calls that historically went to voicemail. At an 81% answer rate and an average ticket of $640, the operating fundamentals are healthy.",
    "The biggest remaining gap is Saturday late-morning. 8 missed calls per month land between 10 AM and 2 PM Saturdays — when emergency cooling/heating issues spike — and Mike's existing close rate on those calls (when reached later) is 52%. At his average ticket, closing that single window adds an estimated $1,800/month with no additional ad spend.",
    "Looking forward, the AC tune-up window opens in the Twin Cities the third week of April. Last spring Mike trailed the market by 4 weeks on this campaign. There are 1,847 single-family homes in his service area with HVAC over 15 years old and 71 commercial properties (property managers, restaurants, mid-size retail) that legally accept cold outreach and historically convert at 14–22% on a maintenance contract pitch. The 90-day plan in §8 prioritizes Saturday capture, the tune-up wave, and a UV-light upsell quietly closing at 22% across the BellAveGo network.",
  ],
  opportunities: [
    {
      rank: 1,
      title: 'Saturday 10 AM – 2 PM gap',
      monthlyValue: 1800,
      pattern: '8 missed calls/month land in that window. 52% close rate when reached later (vs. 38% weekday). Emergency-cooling intent.',
      action: 'Switch BellAveGo to "high-intent mode" Saturdays — auto-text Mike when an emergency keyword hits, auto-offer earliest Sunday slot with $40 hold.',
      confidence: 'high',
    },
    {
      rank: 2,
      title: 'AC tune-up wave (Apr 13 – Jun 22)',
      monthlyValue: 1200,
      pattern: '1,847 homes with HVAC > 15 yrs in service zips. Historical tune-up conversion 7–9% with proactive outreach in week 3 of April.',
      action: 'Run pre-season SMS to last 24-mo customers + targeted postcard to high-age-HVAC homes within 8 mi radius.',
      confidence: 'high',
    },
    {
      rank: 3,
      title: 'UV light add-on at tune-up',
      monthlyValue: 1500,
      pattern: 'BellAveGo network close rate 22% on UV upsell during tune-up. Avg ticket $340. Mike has not run this offer.',
      action: 'Add UV-light line item to tune-up estimate template. AI receptionist mentions it on inbound tune-up calls.',
      confidence: 'medium',
    },
  ],
  marketScan: {
    homeownersInArea: 12847,
    medianIncome: 89400,
    medianHomeAge: 58,
    pctHvacOver15Yrs: 0.24,
    addressableRevenueMonthly: 482000,
    seasonalSignal: 'AC tune-up window opens week of April 13. Peak demand May 4 – June 22. Heat-pump rebate window through Sep 30.',
  },
  upsells: [
    { service: 'AC tune-up (pre-season)', demandSignal: '1,847 eligible homes', avgTicket: 189, closeRate: 0.08, monthlyOpportunity: 1190 },
    { service: 'UV light installation', demandSignal: '22% close on tune-up customers', avgTicket: 340, closeRate: 0.22, monthlyOpportunity: 1500 },
    { service: 'Smart thermostat install', demandSignal: 'Energy rebate ends Sep 30', avgTicket: 425, closeRate: 0.18, monthlyOpportunity: 1140 },
    { service: 'Duct cleaning cross-sell', demandSignal: 'Add-on to repair visits', avgTicket: 480, closeRate: 0.16, monthlyOpportunity: 920 },
    { service: 'Commercial maintenance contract', demandSignal: '71 commercial leads in §6', avgTicket: 2400, closeRate: 0.12, monthlyOpportunity: 2880 },
  ],
  competitive: {
    competitors: [
      { name: 'Northern Air Mechanical', rating: 4.7, reviewCount: 218, distance: '2.4 mi' },
      { name: 'Bonfe Home Services', rating: 4.6, reviewCount: 1840, distance: '4.1 mi' },
      { name: 'Sabre Heating & Cooling', rating: 4.5, reviewCount: 96, distance: '3.8 mi' },
      { name: 'Genz-Ryan', rating: 4.3, reviewCount: 1290, distance: '6.2 mi' },
      { name: 'Standard Heating', rating: 4.6, reviewCount: 712, distance: '5.5 mi' },
    ],
    yourRating: 4.8,
    yourReviewCount: 47,
    marketAvgRating: 4.4,
    marketAvgReviewCount: 482,
    yourRank: 2,
    totalCompetitors: 8,
    strengths: [
      'Highest rating in service area (4.8 vs 4.4 market avg)',
      '24/7 AI receptionist — captures after-hours calls competitors miss',
      'Instant SMS dispatch beats voicemail-reliant competitors',
    ],
    gaps: [
      'Review volume is 1/10th of largest competitor — deters new homeowners doing price-sensitive research',
      'No after-hours emergency positioning despite weekend intent data',
      'No automated quote follow-up — 50%+ of quotes go cold without one',
    ],
  },
  serviceAreaMap: {
    centerLabel: 'St. Louis Park · Minneapolis Metro',
    points: [
      { kind: 'business', label: 'M', x: 50, y: 52, note: "Mike's HVAC · base of operations" },
      { kind: 'opportunity', label: '1', x: 32, y: 38, note: 'Cedar Lake — 412 homes, 31% HVAC > 15 yrs' },
      { kind: 'opportunity', label: '2', x: 68, y: 32, note: 'Golden Valley — 387 homes, 28% HVAC > 15 yrs' },
      { kind: 'opportunity', label: '3', x: 58, y: 72, note: 'Edina (54%) — 524 homes, 22% HVAC > 15 yrs' },
      { kind: 'competitor', label: 'C1', x: 26, y: 60, note: 'Northern Air Mechanical · 2.4 mi · ★4.7' },
      { kind: 'competitor', label: 'C2', x: 78, y: 64, note: 'Bonfe Home Services · 4.1 mi · ★4.6' },
      { kind: 'competitor', label: 'C3', x: 44, y: 18, note: 'Sabre Heating & Cooling · 3.8 mi · ★4.5' },
    ],
  },
  outreachTargets: [
    {
      business: 'Park Place Property Management',
      type: 'Multi-family property mgmt',
      address: '5050 Excelsior Blvd, St. Louis Park',
      phone: '(952) 555‑0142',
      why: 'Manages 14 buildings (~340 units) within 4 mi. No current HVAC service contract on file with permit office.',
    },
    {
      business: 'Knollwood Mall Operations',
      type: 'Retail / commercial',
      address: '8332 Hwy 7, St. Louis Park',
      phone: '(952) 555‑0337',
      why: 'Mid-size retail center with 22 rooftop units. Last permitted HVAC work 2018 — replacement window likely.',
    },
    {
      business: 'The Block Apartments',
      type: 'Multi-family (200+ units)',
      address: '6900 Wayzata Blvd, St. Louis Park',
      phone: '(763) 555‑0290',
      why: 'New build 2019. Out-of-warranty Q3 2026. Strong fit for preventive maintenance contract.',
    },
    {
      business: 'Crave Restaurant Group',
      type: 'Restaurant chain (3 locations in area)',
      address: '4949 Excelsior Blvd, St. Louis Park',
      phone: '(952) 555‑0418',
      why: 'Restaurant kitchens = 24/7 cooling needs. Currently using out-of-area contractor based on permit data.',
    },
    {
      business: 'RE/MAX Results — West Metro',
      type: 'Real estate brokerage (referral source)',
      address: '5402 Parkdale Dr, St. Louis Park',
      phone: '(952) 555‑0561',
      why: '38 agents. Pre-listing HVAC inspections + post-close service — high-LTV referral pipeline. No current preferred vendor.',
    },
  ],
  actionPlan: [
    {
      priority: 1,
      title: 'Activate Saturday emergency mode',
      rationale: 'Largest revenue gap. Existing customers + emergency intent already coming in via missed Sat calls.',
      expectedImpact: '+$1,800/mo within 30 days',
      timeline: 'Implement this week',
      effort: 'low',
    },
    {
      priority: 2,
      title: 'Pre-season tune-up outreach',
      rationale: 'AC tune-up window opens April 13. Last year you trailed market by 4 weeks on this campaign.',
      expectedImpact: '+$1,200/mo April–June',
      timeline: 'Launch April 13',
      effort: 'low',
    },
    {
      priority: 3,
      title: 'Add UV light to tune-up flow',
      rationale: 'BellAveGo network close rate is 22%. Each tune-up is a $340 upsell at modest effort.',
      expectedImpact: '+$1,500/mo once active',
      timeline: 'Live by April 20',
      effort: 'low',
    },
    {
      priority: 4,
      title: 'Work the 5 commercial outreach targets in §6',
      rationale: 'Commercial maintenance contracts are 4–6× the LTV of one-off residential and legal to cold-call. The 5 listed have weak or no current vendor relationships.',
      expectedImpact: 'One contract = ~$2,400/mo recurring',
      timeline: '2 calls/week × 3 weeks',
      effort: 'medium',
    },
    {
      priority: 5,
      title: 'Review-volume campaign',
      rationale: 'You out-rate every competitor but lose new-customer searches on volume. 200 reviews would close the gap.',
      expectedImpact: '+12–18% inbound new-customer calls',
      timeline: '90 days to first 100 reviews',
      effort: 'medium',
    },
  ],
  methodology:
    'Internal metrics pulled from this account\'s BellAveGo call_logs + jobs over the cadence window, with the prior-period of the same length used for deltas. ' +
    'Local market data from Google Places (competitors, ratings, geographic positioning) and US Census ACS 2022 5-year (homeowner counts, median income, median home age) for the customer\'s primary ZIP. ' +
    'BellAveGo Score blends answer rate (25%), booking conversion (30%), AI response-time baseline (15%), and avg-ticket-vs-trade-anchor pricing power (30%). ' +
    'B2B outreach targets are real businesses pulled from Google Places — commercial properties only (TCPA-safe). ' +
    'Narrative + opportunity ranking + action plan generated by the BellAveGo AI engine, grounded in the inputs above. Every dollar figure derives from the contractor\'s own numbers or from cited market data — no industry-aggregate claims.',
}
