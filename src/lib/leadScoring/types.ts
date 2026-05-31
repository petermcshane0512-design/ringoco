/**
 * Shared types for predictive lead scoring.
 */

export type Trade =
  | 'HVAC'
  | 'plumbing'
  | 'electrical'
  | 'garage_door'
  | 'locksmith'
  | 'pest_control'
  | 'pool_service'

export const SUPPORTED_TRADES: Trade[] = [
  'HVAC',
  'plumbing',
  'electrical',
  'garage_door',
  'locksmith',
  'pest_control',
  'pool_service',
]

export type ProspectSignals = {
  business_name: string
  trade: Trade
  city: string
  state: string
  review_count: number | null
  rating: number | null
  website_url: string | null
  website_snippet: string | null // first ~2000 chars of homepage text
  employee_count_est: number | null // 1-5 sweet spot, 100+ disqualified
  has_review_responses: boolean // do they respond to reviews?
  recent_review_sentiment: 'positive' | 'mixed' | 'negative' | 'unknown'
  business_hours_listed: boolean
  emergency_service_listed: boolean
  has_booking_system: boolean // schedule/online-booking visible
  has_answering_service_mentioned: boolean // already have one = disqualify
}

export type ScoreResult = {
  buyer_score: number // 1-10
  reasoning: {
    positive_signals: string[]
    negative_signals: string[]
    one_line_summary: string
  }
  send_recommendation: 'send' | 'send_priority' | 'skip'
  score_version: string
}
