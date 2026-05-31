/**
 * Single source of truth for the cold-email body that all senders use:
 * - /api/crons/daily-cold-send (currently disabled — was Gmail OAuth)
 * - scripts/fire-50-now.mjs
 * - scripts/manual-send.mjs
 * - scripts/dump-rtf-pack.mjs
 * - scripts/dump-50-emails.mjs
 * - scripts/dump-today-missed.mjs
 * - future Instantly campaign template
 *
 * Includes the open-tracking pixel and a click-tracking-friendly report URL.
 * HTML version embeds the pixel; text version doesn't (no images possible).
 */

export type RenderEmailInput = {
  lead_id: string
  first_name: string
  company_name: string
  city: string
  state: string
  report: {
    competitive?: {
      yourReviewCount?: number
      marketAvgReviewCount?: number
      yourRank?: number
      totalCompetitors?: number
      yourRating?: number
      competitors?: Array<{ name?: string; reviewCount?: number }>
    }
    opportunities?: Array<{ title?: string; monthlyValue?: number }>
  }
  report_url: string
  variant?: 'A' | 'B' | 'C'
  app_url?: string
}

// Append &l=<lead_id> to the report URL so click-through hits
// /api/track/report-visit and we record report_visit_at on the lead.
function withLeadTracker(reportUrl: string, leadId: string): string {
  if (!leadId) return reportUrl
  const sep = reportUrl.includes('?') ? '&' : '?'
  return `${reportUrl}${sep}l=${encodeURIComponent(leadId)}`
}

export function renderEmailText(input: RenderEmailInput): string {
  const c = input.report.competitive ?? {}
  const o = (input.report.opportunities ?? [])[0] ?? {}
  const topComp = (c.competitors ?? [])[0] ?? {}
  const opener = pickOpener(input.variant)
  const trackedUrl = withLeadTracker(input.report_url, input.lead_id)

  return [
    `Hey ${input.first_name},`,
    '',
    opener(input.company_name, input.city, input.state),
    '',
    'Three things stood out:',
    '',
    `→ You're ranked #${c.yourRank ?? '?'} of ${c.totalCompetitors ?? '?'} HVAC shops with ${c.yourRating ?? '?'}★ and ${c.yourReviewCount ?? 0} reviews. Market average is ${c.marketAvgReviewCount ?? 0} reviews. ${topComp.name ?? 'Top competitor'} sits at ${topComp.reviewCount ?? 0}.`,
    '',
    `→ Top opportunity for ${input.company_name}: "${o.title ?? 'revenue gap'}" — modeled at +$${o.monthlyValue ?? 0}/mo. Full pattern + 5-step action plan inside the report.`,
    '',
    `→ Competitive table inside shows where you sit vs the 5 nearest shops by review volume + rating.`,
    '',
    `Full personalized report (no signup, 2 min):`,
    trackedUrl,
    '',
    `We're BellAveGo — AI receptionist for HVAC shops that don't have one yet. You're probably answering your own phone between jobs right now, losing 2-3 jobs/week when you can't pick up. We answer those calls for you, capture the lead, text it to your phone in 10 seconds — so you can stay on the wrench AND book the job. 7-day free trial, $147/mo. No risk, cancel anytime.`,
    '',
    `— Peter`,
    `BellAveGo · (773) 710-9565`,
    '',
    `P.S. Want to set up your team's account? Text us at (773) 710-9565. We'll text back the moment we see it — no Zoom calls, no scheduling, just a conversation on your phone like everything else in your day.`,
  ].join('\n')
}

export function renderEmailHtml(input: RenderEmailInput): string {
  const text = renderEmailText(input)
  const appUrl = input.app_url || 'https://www.bellavego.com'
  const pixelUrl = `${appUrl}/api/track/open?l=${encodeURIComponent(input.lead_id)}`
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')

  return [
    `<!DOCTYPE html>`,
    `<html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#0b1f3a;max-width:560px">`,
    escaped,
    // open-tracking pixel — must be at end, after the visible content,
    // so the recipient never sees a broken-image flicker
    `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`,
    `</body></html>`,
  ].join('\n')
}

type Opener = (company: string, city: string, state: string) => string

function pickOpener(variant?: 'A' | 'B' | 'C'): Opener {
  const A: Opener = (company, city, state) =>
    `Pulled a quick revenue intel report on ${company} this morning — ${city} ${state} HVAC market.`
  const B: Opener = (company, city) =>
    `Spent 10 minutes last night pulling the HVAC market data for ${city} — your shop, ${company}, shows up in the top quartile by rating.`
  const C: Opener = (company, city) =>
    `Was looking at the ${city} HVAC market this week and ${company} kept catching my eye — wanted to send what I found.`
  switch (variant) {
    case 'B': return B
    case 'C': return C
    case 'A':
    default: return A
  }
}
