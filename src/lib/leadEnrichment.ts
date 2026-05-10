import type { ApolloLead, Competitor, EnrichedLead, Trade } from './leadTypes'

const APOLLO_KEY = process.env.APOLLO_API_KEY
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY

const APOLLO_BASE = 'https://api.apollo.io/api/v1'
const PLACES_BASE = 'https://places.googleapis.com/v1'

/**
 * Search Apollo for contractor leads in a given city + trade.
 * Falls back to deterministic mock data when APOLLO_API_KEY isn't set —
 * lets the rest of the pipeline run end-to-end without keys.
 */
export async function searchApolloLeads(opts: {
  city: string
  state: string
  trade: Trade
  limit?: number
}): Promise<ApolloLead[]> {
  const limit = opts.limit ?? 25

  if (!APOLLO_KEY) {
    return generateMockApolloLeads(opts, limit)
  }

  // Real Apollo call. Apollo's search API is POST /mixed_people/search
  // with filters for industry + location + employee size. The full schema
  // is documented at apollo.io/docs.
  const body = {
    api_key: APOLLO_KEY,
    person_titles: ['Owner', 'CEO', 'President', 'Founder', 'General Manager'],
    person_locations: [`${opts.city}, ${opts.state}`],
    organization_industries: [tradeToApolloIndustry(opts.trade)],
    organization_num_employees_ranges: ['2,5', '6,10', '11,20'],
    page: 1,
    per_page: limit,
  }

  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Apollo ${res.status}`)
    const data = (await res.json()) as { people: ApolloApiPerson[] }
    return (data.people ?? [])
      .filter((p) => p.email && p.organization)
      .map((p) => apolloPersonToLead(p, opts.trade))
  } catch (e) {
    console.error('Apollo search failed, falling back to mock:', e)
    return generateMockApolloLeads(opts, limit)
  }
}

/**
 * Pull Google Places competitor data + business's own rating/reviews
 * for a given trade in a zip. Used to enrich Apollo leads with the
 * "named competitor" + "review hook" data Claude needs.
 */
export async function enrichWithPlaces(lead: ApolloLead): Promise<EnrichedLead> {
  let googleRating: number | undefined
  let reviewCount: number | undefined
  let recentReviewSnippet: string | undefined
  let recentReviewSentiment: 'positive' | 'negative' | 'neutral' | undefined
  let topCompetitors: Competitor[] = []

  if (PLACES_KEY) {
    try {
      // Search for the business itself
      const businessSearch = await placesTextSearch(`${lead.businessName} ${lead.city} ${lead.state}`, lead.zip)
      const business = businessSearch[0]
      if (business) {
        googleRating = business.rating
        reviewCount = business.userRatingCount
        // Pull most recent review for sentiment hook
        const reviews = await placesGetReviews(business.id)
        const negative = reviews.find((r) => r.rating <= 3)
        if (negative) {
          recentReviewSnippet = negative.text
          recentReviewSentiment = 'negative'
        }
      }

      // Search for competitors in the same trade + zip
      const competitorSearch = await placesTextSearch(`${lead.trade} ${lead.city}`, lead.zip)
      topCompetitors = competitorSearch
        .filter((p) => p.displayName.text !== lead.businessName)
        .slice(0, 5)
        .map((p) => ({
          name: p.displayName.text,
          rating: p.rating ?? 0,
          reviewCount: p.userRatingCount ?? 0,
        }))
    } catch (e) {
      console.error('Google Places enrichment failed, using mock:', e)
    }
  }

  // If no Places data (no key, or API failure), use mock
  if (!reviewCount) {
    const mock = generateMockEnrichment(lead)
    googleRating = mock.googleRating
    reviewCount = mock.reviewCount
    recentReviewSnippet = mock.recentReviewSnippet
    recentReviewSentiment = mock.recentReviewSentiment
    topCompetitors = mock.topCompetitors
  }

  // Per the lead-sourcing model: reviews × 8 calls/mo × 40% miss rate × $211.75 recovered/call
  const estimatedMonthlyCalls = Math.round((reviewCount ?? 30) * 8)
  const estimatedMissedCallsPerMonth = Math.round(estimatedMonthlyCalls * 0.4)
  const estimatedMonthlyMissedRevenue = Math.round(estimatedMissedCallsPerMonth * 211.75)

  return {
    ...lead,
    googleRating,
    reviewCount,
    recentReviewSnippet,
    recentReviewSentiment,
    topCompetitors,
    estimatedMonthlyCalls,
    estimatedMissedCallsPerMonth,
    estimatedMonthlyMissedRevenue,
  }
}

// ── Apollo helpers ─────────────────────────────────────────────

type ApolloApiPerson = {
  first_name: string
  last_name: string
  email: string
  phone_numbers?: { sanitized_number: string }[]
  organization?: {
    name: string
    website_url?: string
    primary_phone?: { sanitized_number: string }
    raw_address?: string
    city?: string
    state?: string
    postal_code?: string
    estimated_num_employees?: number
    founded_year?: number
    annual_revenue?: number
  }
}

function apolloPersonToLead(p: ApolloApiPerson, trade: Trade): ApolloLead {
  const org = p.organization!
  return {
    ownerFirstName: p.first_name,
    ownerLastName: p.last_name,
    ownerEmail: p.email,
    ownerPhone: p.phone_numbers?.[0]?.sanitized_number,
    businessName: org.name,
    websiteUrl: org.website_url,
    city: org.city ?? '',
    state: org.state ?? '',
    zip: org.postal_code ?? '',
    trade,
    employeeCount: org.estimated_num_employees,
    yearFounded: org.founded_year,
    estimatedAnnualRevenue: org.annual_revenue,
  }
}

function tradeToApolloIndustry(trade: Trade): string {
  const map: Record<Trade, string> = {
    HVAC: 'mechanical or industrial engineering',
    Plumbing: 'construction',
    Electrical: 'electrical/electronic manufacturing',
    Roofing: 'construction',
    Cleaning: 'facilities services',
    Landscaping: 'consumer services',
    Handyman: 'consumer services',
    'Appliance Repair': 'consumer services',
    'Pool & Spa': 'consumer services',
    'Pest Control': 'consumer services',
    Other: 'consumer services',
  }
  return map[trade] ?? 'consumer services'
}

// ── Google Places (New) helpers ────────────────────────────────

type PlaceResult = {
  id: string
  displayName: { text: string }
  rating?: number
  userRatingCount?: number
}

async function placesTextSearch(query: string, zip: string): Promise<PlaceResult[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({ textQuery: `${query} ${zip}`, pageSize: 10 }),
  })
  if (!res.ok) throw new Error(`Places ${res.status}`)
  const data = (await res.json()) as { places?: PlaceResult[] }
  return data.places ?? []
}

async function placesGetReviews(placeId: string): Promise<{ rating: number; text: string }[]> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': PLACES_KEY!,
      'X-Goog-FieldMask': 'reviews',
    },
  })
  if (!res.ok) return []
  const data = (await res.json()) as { reviews?: { rating: number; text?: { text: string } }[] }
  return (data.reviews ?? []).slice(0, 5).map((r) => ({
    rating: r.rating,
    text: r.text?.text ?? '',
  }))
}

// ── Mock fallback (used when keys missing or APIs fail) ─────────

const FAKE_FIRST_NAMES = ['Mike', 'Jim', 'Tony', 'Dave', 'Steve', 'Carlos', 'Brian', 'Kevin', 'Mark', 'Rick']
const FAKE_LAST_NAMES = ['Smith', 'Johnson', 'Garcia', 'Martinez', 'Brown', 'Davis', 'Wilson', 'Anderson']
const FAKE_BIZ_SUFFIXES = ['Heating & Cooling', 'HVAC Services', 'Plumbing & Drain', 'Air Conditioning', 'Mechanical', 'Comfort Solutions']
const FAKE_COMPETITORS_HVAC = ['Estes Services', 'Coolray Heating', 'Service Experts', 'One Hour Heating', 'Aire Serv']

function generateMockApolloLeads(opts: { city: string; state: string; trade: Trade }, n: number): ApolloLead[] {
  return Array.from({ length: n }, (_, i) => {
    const seed = (opts.city.charCodeAt(0) + i) % FAKE_LAST_NAMES.length
    const fn = FAKE_FIRST_NAMES[seed % FAKE_FIRST_NAMES.length]
    const ln = FAKE_LAST_NAMES[seed]
    const biz = `${ln} ${FAKE_BIZ_SUFFIXES[seed % FAKE_BIZ_SUFFIXES.length]}`
    return {
      ownerFirstName: fn,
      ownerLastName: ln,
      ownerEmail: `${fn.toLowerCase()}@${biz.toLowerCase().replace(/\W+/g, '')}.com`,
      ownerPhone: `+1${500 + i}5550${100 + i}`,
      businessName: biz,
      city: opts.city,
      state: opts.state,
      zip: ['30309', '75201', '77002', '85003', '33101'][i % 5],
      trade: opts.trade,
      employeeCount: 3 + (i % 8),
      yearFounded: 2000 + (i % 22),
      estimatedAnnualRevenue: 500_000 + i * 100_000,
    }
  })
}

function generateMockEnrichment(lead: ApolloLead) {
  const reviewCount = 30 + ((lead.businessName.length * 7) % 80)
  const rating = 4.2 + (((lead.businessName.length % 6) - 3) * 0.1)
  return {
    googleRating: Math.max(3.5, Math.min(4.9, parseFloat(rating.toFixed(1)))),
    reviewCount,
    recentReviewSnippet:
      reviewCount % 3 === 0
        ? `Tried calling for two days, no answer. Ended up going with another company.`
        : undefined,
    recentReviewSentiment: (reviewCount % 3 === 0 ? 'negative' : 'positive') as 'positive' | 'negative',
    topCompetitors: FAKE_COMPETITORS_HVAC.slice(0, 3).map((name, idx) => ({
      name,
      rating: 4.5 + idx * 0.1,
      reviewCount: 200 + idx * 400,
    })),
  }
}
