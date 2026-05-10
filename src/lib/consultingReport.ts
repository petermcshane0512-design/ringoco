export type Confidence = 'high' | 'medium' | 'low'

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
    callsAnswered: 312,
    callsAnsweredDelta: 0.24,
    jobsBooked: 47,
    jobsBookedDelta: 0.08,
    revenue: 34200,
    revenueDelta: 0.11,
    avgTicket: 728,
    avgTicketDelta: 0.03,
    callsSaved: 89,
    answerRate: 0.78,
  },
  bellaveScore: {
    composite: 7.8,
    answerRate: 8.4,
    bookingConversion: 7.1,
    responseTime: 9.2,
    pricingPower: 6.4,
  },
  executiveSummary: [
    "Mike's HVAC closed Q1 2026 with $34,200 in booked revenue across 47 jobs — an 11% lift over Q4 2025, despite the seasonal lull. Call answer rate climbed to 78%, putting Mike in the top quartile of solo HVAC operators in the Twin Cities metro. The data shows a business operating efficiently within its current capacity, but leaving meaningful revenue on the table in three specific patterns.",
    "The single largest gap is weekend response. 31 of the 89 missed calls landed Saturday 10 AM – 2 PM, and the booking conversion on those calls (when answered later) is 64% — well above the 41% Q1 weekday average. These are warm leads with cooling-emergency intent, and competitors are catching them. Closing this gap alone is worth an estimated $5,200/month at current close rates and average ticket size.",
    "Looking forward, the AC tune-up window opens in Minneapolis the third week of April. Last spring, Mike's tune-up volume peaked late and trailed market share — a narrow 4-week window where targeted outreach to the 1,800 single-family homes in his service area with HVAC over 15 years old historically converts at 7–9%. The 90-day action plan in §7 prioritizes both opportunities and a third — a UV-light add-on that's been quietly closing at 38% on existing tune-up customers across the BellAveGo network.",
  ],
  opportunities: [
    {
      rank: 1,
      title: 'Weekend response gap',
      monthlyValue: 5200,
      pattern: '31 missed calls Saturday 10 AM – 2 PM. 64% booking rate when reached later vs. 41% weekday baseline. Emergency intent.',
      action: 'Switch BellAveGo to "high-intent mode" Saturdays — auto-text contractor + offer earliest Sunday slot with $50 off as a hold.',
      confidence: 'high',
    },
    {
      rank: 2,
      title: 'AC tune-up wave (May–Jun)',
      monthlyValue: 3800,
      pattern: '1,847 homes with HVAC > 15 yrs in service zips. Historical tune-up conversion 7–9% with proactive outreach in week 3 of April.',
      action: 'Run pre-season SMS to last 24-mo customers + targeted postcard to high-age-HVAC homes within 8mi radius.',
      confidence: 'high',
    },
    {
      rank: 3,
      title: 'UV light add-on at tune-up',
      monthlyValue: 2400,
      pattern: 'BellAveGo network close rate 38% on UV upsell during tune-up appointment. Avg ticket $340. Mike has not run this offer.',
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
    { service: 'AC tune-up (pre-season)', demandSignal: '1,847 eligible homes', avgTicket: 189, closeRate: 0.08, monthlyOpportunity: 2790 },
    { service: 'UV light installation', demandSignal: '38% close on tune-up customers', avgTicket: 340, closeRate: 0.38, monthlyOpportunity: 2420 },
    { service: 'Smart thermostat install', demandSignal: 'Energy rebate ends Sep 30', avgTicket: 425, closeRate: 0.22, monthlyOpportunity: 1870 },
    { service: 'Duct cleaning', demandSignal: 'Cross-sell post-repair', avgTicket: 480, closeRate: 0.18, monthlyOpportunity: 1730 },
    { service: 'Heat-pump quote (replacement)', demandSignal: '24% homes HVAC > 15 yrs', avgTicket: 8200, closeRate: 0.04, monthlyOpportunity: 6560 },
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
      'Fastest response time on BellAveGo network (avg 11s)',
      'Repeat customer rate 41% (network avg 28%)',
    ],
    gaps: [
      'Review volume is 1/10th of largest competitor — deters new homeowners doing price-sensitive research',
      'No web presence beyond Google Business Profile',
      'No after-hours emergency positioning despite weekend intent data',
    ],
  },
  actionPlan: [
    {
      priority: 1,
      title: 'Activate Saturday emergency mode',
      rationale: 'Largest revenue gap. Existing customers + emergency intent already coming in via missed calls.',
      expectedImpact: '+$5,200/mo within 30 days',
      timeline: 'Implement this week',
      effort: 'low',
    },
    {
      priority: 2,
      title: 'Pre-season tune-up outreach',
      rationale: 'AC tune-up window opens April 13. Last year you trailed market by 4 weeks on this campaign.',
      expectedImpact: '+$2,790/mo April–June',
      timeline: 'Launch April 13',
      effort: 'low',
    },
    {
      priority: 3,
      title: 'Add UV light to tune-up flow',
      rationale: 'BellAveGo network close rate is 38%. Each tune-up appointment is a $340 upsell opportunity at 38% conversion.',
      expectedImpact: '+$2,420/mo once active',
      timeline: 'Live by April 20',
      effort: 'low',
    },
    {
      priority: 4,
      title: 'Review-volume campaign',
      rationale: 'You out-rate every competitor but lose new-customer searches on volume. 200 reviews would close the gap.',
      expectedImpact: '+12–18% inbound new-customer calls',
      timeline: '90 days to first 100 reviews',
      effort: 'medium',
    },
    {
      priority: 5,
      title: 'Heat-pump replacement quote engine',
      rationale: '24% of homes in your area have HVAC over 15 years old. Even at 4% close rate, a single sale is $8,200.',
      expectedImpact: '+$6,560/mo at network-avg conversion',
      timeline: 'Set up by May 15',
      effort: 'medium',
    },
  ],
  methodology:
    'Internal metrics pulled from BellAveGo call_logs + jobs (last 90 days). Market data from US Census ACS 2024 + Google Places. BellAveGo Score blends answer rate (25%), booking conversion (30%), response time (15%), and pricing power vs. local market (30%). Competitive data refreshed weekly. Recommendations generated by Claude Sonnet 4.6 from 4M+ contractor data points across the BellAveGo network.',
}
