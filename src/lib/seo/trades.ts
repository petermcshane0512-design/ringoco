/**
 * Trade definitions for the programmatic /answering-service/[slug] pages.
 *
 * The slug is the URL fragment. The label is what shows in headlines.
 * The googleQuery is what we send to Google Places to find the top
 * 5 shops in any given city.
 *
 * Trades are ordered by BellAveGo ICP fit: HVAC is the strongest pitch
 * (averages $620/missed-job opportunity cost), plumbing close behind.
 */
export const TRADES = [
  {
    slug: 'hvac',
    label: 'HVAC',
    pluralLabel: 'HVAC contractors',
    googleQuery: 'HVAC contractor',
    avgMissedJobUsd: 620,
    pitchHook: 'A single missed AC call in summer costs you $620 in lost revenue. Emma answers every call, captures every lead, and texts you in 10 seconds — for $197/mo.',
    metaDesc: (city: string) =>
      `Best AI receptionist for HVAC contractors in ${city}. Answer every missed call, book every job. $197/mo, 30-day money-back guarantee. No setup fee.`,
  },
  {
    slug: 'plumbing',
    label: 'Plumbing',
    pluralLabel: 'plumbers',
    googleQuery: 'plumber',
    avgMissedJobUsd: 420,
    pitchHook: 'Plumbing emergencies don\'t wait for office hours. Emma picks up 24/7, qualifies the urgency, and dispatches you in seconds. $197/mo.',
    metaDesc: (city: string) =>
      `AI receptionist for plumbers in ${city}. 24/7 call answering, lead capture, instant SMS dispatch. $197/mo, 30-day money-back guarantee.`,
  },
  {
    slug: 'electrical',
    label: 'Electrical',
    pluralLabel: 'electricians',
    googleQuery: 'electrician',
    avgMissedJobUsd: 380,
    pitchHook: 'Every missed call is an electrical job that went to a competitor. Emma answers every ring — even when you\'re on a ladder. $197/mo.',
    metaDesc: (city: string) =>
      `AI receptionist for electricians in ${city}. Capture every lead while you\'re on the job. $197/mo, 30-day money-back guarantee.`,
  },
  {
    slug: 'roofing',
    label: 'Roofing',
    pluralLabel: 'roofing contractors',
    googleQuery: 'roofing contractor',
    avgMissedJobUsd: 1100,
    pitchHook: 'Roof leak calls average $1,100 per job. Miss one and you lose more than 6 months of BellAveGo. Emma answers every call instantly.',
    metaDesc: (city: string) =>
      `AI receptionist for roofers in ${city}. Capture storm-damage calls 24/7. $197/mo, 30-day money-back guarantee.`,
  },
  {
    slug: 'cleaning',
    label: 'Cleaning',
    pluralLabel: 'residential cleaners',
    googleQuery: 'residential cleaning service',
    avgMissedJobUsd: 240,
    pitchHook: 'Recurring-cleaning leads compound. Miss the first call and you lose an entire customer relationship. Emma answers in 1 ring.',
    metaDesc: (city: string) =>
      `AI receptionist for residential cleaners in ${city}. Never miss a recurring-service booking. $197/mo, 30-day money-back guarantee.`,
  },
  {
    slug: 'landscaping',
    label: 'Landscaping',
    pluralLabel: 'landscapers',
    googleQuery: 'landscaping company',
    avgMissedJobUsd: 480,
    pitchHook: 'Spring rush = phone never stops. Emma handles every overflow call so you keep mowing. $197/mo.',
    metaDesc: (city: string) =>
      `AI receptionist for landscapers in ${city}. Capture every spring-rush call. $197/mo, 30-day money-back guarantee.`,
  },
] as const

export type TradeSlug = (typeof TRADES)[number]['slug']

export function getTrade(slug: string) {
  return TRADES.find((t) => t.slug === slug) ?? null
}
