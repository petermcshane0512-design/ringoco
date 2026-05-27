import Anthropic from '@anthropic-ai/sdk'
import type { EnrichedLead, PersonalizedFragments } from './leadTypes'

const client = new Anthropic()

/**
 * Generate per-recipient personalized email fragments via Claude Haiku.
 * Used by the cold-email pipeline before pushing leads to Instantly.
 *
 * Cost: ~$0.005 per lead (Haiku 4.5, ~600 input + 150 output tokens).
 *
 * Returns Instantly-ready fragments that get merged into the email template
 * via custom variables: {{ai_opening}}, {{ai_competitor_ref}}, {{ai_roi_math}},
 * {{ai_review_hook}}, {{ai_closing_hook}}.
 */
export async function personalizeForLead(lead: EnrichedLead): Promise<PersonalizedFragments> {
  const topCompetitor = lead.topCompetitors[0]
  const reviewSignal =
    lead.recentReviewSentiment === 'negative' && lead.recentReviewSnippet
      ? `Recent negative review snippet: "${lead.recentReviewSnippet.slice(0, 200)}"`
      : 'No recent complaint review surfaced.'

  const system = `You write hyper-personalized B2B cold-email opening fragments for BellAveGo, an AI office manager for home-service contractors. Every fragment must reference a SPECIFIC fact about the recipient's business. No generic AI-sounding language. Match contractor tone — short sentences, concrete numbers, no jargon. Never use the words "leverage" "synergy" "robust" "solution" or em-dashes longer than one per fragment.

Output format: STRICT JSON with these exact keys:
{
  "opening": "1-2 sentences referencing one specific data point (review count, year founded, or city). Lead with the data, not a greeting.",
  "competitorRef": "Optional 1-line reference to a named local competitor (use the data provided). Only include if competitor data exists.",
  "roiMath": "2-3 short lines computing missed-call revenue at THIS contractor's specific volume. Use the numbers given. No fancy formatting.",
  "reviewHook": "Optional 1 line referencing a recent complaint review IF a negative review snippet was provided. Else empty string.",
  "closingHook": "1 line CTA pointing to the live demo number. Make it casual, not salesy."
}

Keep total output under 400 characters across all fragments combined. Sound like a 20-year-old founder, not an AI.`

  const userPrompt = `Recipient data:
- Owner: ${lead.ownerFirstName}
- Business: ${lead.businessName}
- Trade: ${lead.trade}
- Location: ${lead.city}, ${lead.state} (zip ${lead.zip})
- Year founded: ${lead.yearFounded ?? 'unknown'}
- Employee count: ${lead.employeeCount ?? 'unknown'}
- Google rating: ${lead.googleRating ?? 'unknown'} stars
- Google review count: ${lead.reviewCount ?? 'unknown'}
- Estimated monthly calls: ${lead.estimatedMonthlyCalls}
- Estimated missed calls per month: ${lead.estimatedMissedCallsPerMonth}
- Estimated monthly missed revenue: $${lead.estimatedMonthlyMissedRevenue.toLocaleString()}
- Top local competitor: ${topCompetitor ? `${topCompetitor.name} (${topCompetitor.rating}★, ${topCompetitor.reviewCount} reviews)` : 'unknown'}
- ${reviewSignal}

Demo number to reference: (651) 467-7829

Generate the JSON now.`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = stripCodeFence(text)
    const parsed = JSON.parse(cleaned) as PersonalizedFragments

    return {
      opening: parsed.opening?.trim() || fallbackOpening(lead),
      competitorRef: parsed.competitorRef?.trim() || undefined,
      roiMath: parsed.roiMath?.trim() || fallbackRoiMath(lead),
      reviewHook: parsed.reviewHook?.trim() || undefined,
      closingHook: parsed.closingHook?.trim() || `Call (651) 467-7829 — talk to it like you're a customer.`,
    }
  } catch (e) {
    console.error('personalizeForLead failed, using fallback:', e)
    return {
      opening: fallbackOpening(lead),
      roiMath: fallbackRoiMath(lead),
      closingHook: `Call (651) 467-7829 — talk to it like you're a customer.`,
    }
  }
}

/**
 * Run personalization in parallel with concurrency limit.
 *
 * Default concurrency bumped 5 → 15 (2026-05-27) to match the 1K/day
 * outreach bull target. Haiku 4.5 rate limits are very generous (tier 4
 * = 1000 req/min). 15-wide cuts wall time ~3x with no rate-limit risk
 * up to ~4000 leads/day. Override via the `concurrency` arg if a script
 * hits unexpected 429s.
 *
 * Cost tracking: logs total cost per batch so we can alert on runaway
 * personalization spend (e.g. accidental loop). Haiku 4.5 = $0.005/lead
 * approx, so 1000 leads = $5. Cost printed via console — pipe to logs.
 */
const HAIKU_COST_PER_LEAD_USD = 0.005

export async function personalizeBatch(
  leads: EnrichedLead[],
  concurrency: number = 15,
): Promise<Array<{ lead: EnrichedLead; fragments: PersonalizedFragments }>> {
  const startedAt = Date.now()
  const results: Array<{ lead: EnrichedLead; fragments: PersonalizedFragments }> = []
  for (let i = 0; i < leads.length; i += concurrency) {
    const batch = leads.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(async (lead) => ({ lead, fragments: await personalizeForLead(lead) })),
    )
    results.push(...batchResults)
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
  const estCostUsd = (leads.length * HAIKU_COST_PER_LEAD_USD).toFixed(2)
  console.log(`[personalizeBatch] ${leads.length} leads · concurrency=${concurrency} · ${elapsed}s · ~$${estCostUsd} Claude spend`)
  return results
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

function fallbackOpening(lead: EnrichedLead): string {
  return `${lead.ownerFirstName} — pulled up ${lead.businessName} on Google Maps, ${lead.reviewCount ?? 'solid'} reviews. Quick math on missed calls below.`
}

function fallbackRoiMath(lead: EnrichedLead): string {
  return `Estimated calls/mo: ~${lead.estimatedMonthlyCalls}\nEstimated missed: ~${lead.estimatedMissedCallsPerMonth}\nThat's ~$${lead.estimatedMonthlyMissedRevenue.toLocaleString()}/mo walking past you.`
}
