/**
 * Shared types for cold-email lead pipeline.
 * Used by lib/leadEnrichment, lib/personalizeEmail, lib/instantly,
 * and the /api/agents/enrich-leads orchestrator.
 */

export type Trade =
  | 'HVAC'
  | 'Plumbing'
  | 'Electrical'
  | 'Roofing'
  | 'Cleaning'
  | 'Landscaping'
  | 'Handyman'
  | 'Appliance Repair'
  | 'Pool & Spa'
  | 'Pest Control'
  | 'Other'

/** Raw lead from Apollo before enrichment with Google Places + computed fields. */
export type ApolloLead = {
  ownerFirstName: string
  ownerLastName?: string
  ownerEmail: string
  ownerPhone?: string
  businessName: string
  websiteUrl?: string
  street?: string
  city: string
  state: string
  zip: string
  trade: Trade
  employeeCount?: number
  yearFounded?: number
  estimatedAnnualRevenue?: number
}

/** Google Places competitor entry. */
export type Competitor = {
  name: string
  rating: number
  reviewCount: number
  distanceMiles?: number
}

/** Fully enriched lead — Apollo + Google Places + computed missed-call math. */
export type EnrichedLead = ApolloLead & {
  googleRating?: number
  reviewCount?: number
  recentReviewSnippet?: string
  recentReviewSentiment?: 'positive' | 'negative' | 'neutral'
  topCompetitors: Competitor[]
  // Computed (per lead-sourcing math: reviews × 8 calls/review/mo × 0.4 miss rate)
  estimatedMonthlyCalls: number
  estimatedMissedCallsPerMonth: number
  // $385 avg job × 55% book rate = $211.75 per missed-call recovered
  estimatedMonthlyMissedRevenue: number
}

/** What Claude generates per lead — the personalization layer. */
export type PersonalizedFragments = {
  opening: string             // 1–2 sentences referencing specific lead data
  competitorRef?: string      // 1 sentence using a named local competitor
  roiMath: string             // 2-line math snippet personalized to their reviewCount
  reviewHook?: string         // optional — only if a complaint review exists
  closingHook: string         // 1-line CTA tying to demo number
}

/** Final lead payload pushed to Instantly with all merge fields. */
export type InstantlyLeadPayload = {
  email: string
  first_name: string
  last_name?: string
  company_name: string
  custom_variables: {
    business_name: string
    city: string
    state: string
    trade: Trade
    review_count: string
    estimated_missed_calls: string
    estimated_missed_revenue: string
    top_competitor_name: string
    ai_opening: string
    ai_competitor_ref: string
    ai_roi_math: string
    ai_review_hook: string
    ai_closing_hook: string
  }
}

export type InstantlyReplyEvent = {
  campaign_id: string
  lead_email: string
  reply_subject?: string
  reply_body: string
  received_at: string
}

export type ReplyClassification =
  | 'positive'        // wants demo / interested
  | 'objection'       // pushback but engaged
  | 'wrong_person'    // forwarding to right person
  | 'unsubscribe'     // stop / drop / not interested
  | 'auto_reply'      // out of office / vacation
  | 'spam'            // unrelated noise
