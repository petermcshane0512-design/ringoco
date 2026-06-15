import Anthropic from '@anthropic-ai/sdk'

/**
 * freeLeadIntel — turn a bare cited-homeowner record into a RICH, sales-ready
 * lead (2026-06-15, per Peter + call feedback "leads aren't detailed enough").
 * One Claude call produces the job breakdown, a word-for-word outreach script,
 * a "why your shop" pitch, and property/job intel — so the free lead reads
 * like a $25 lead, not a violation notice. Cached on the prospect_free_leads
 * row (one call per contractor), so cost is ~$0.01-0.03 once, not per view.
 */

export type LeadIntel = {
  job_summary: string        // what the city cited means + scope, plain language
  est_value_line: string     // honest job-value range + why
  outreach_script: string    // word-for-word call/text opener to the homeowner
  why_you: string            // why THIS contractor is the right fit
  property_note: string      // age/value implication for the job
}

const MODEL = 'claude-sonnet-4-6'

export async function generateLeadIntel(input: {
  ownerName: string | null
  address: string            // full "street, city ST zip"
  trade: string              // contractor's trade (masonry/roofing/hvac/...)
  violationText: string      // the actual city citation text
  fineUsd: number            // 0 if none
  hearingNote: string | null // e.g. "hearing Sep 30"
  homeValue: number | null
  yearBuilt: number | null
  contractorBiz: string | null
  contractorCity: string | null
}): Promise<LeadIntel | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const trade = input.trade || 'home-service'
  const biz = input.contractorBiz || 'your shop'
  const sys = `You turn a public code-enforcement record into a sales-ready lead packet for a small ${trade} contractor. Be concrete, honest, and useful — a guy under a truck should be able to act on it in 30 seconds. NO hype, NO made-up facts. If you don't know a number, give an honest range and say it's an estimate. Never invent the homeowner's phone or personal details. Plain language only.

Return STRICT JSON, no markdown:
{
 "job_summary": "2-3 sentences: what the city cited, what work it almost certainly means for a ${trade} contractor, and the scope.",
 "est_value_line": "one line: honest job-value range for this work + why (tie to the violation + home value if given). Mark it an estimate.",
 "outreach_script": "4-6 sentences the contractor can say WORD-FOR-WORD when they call/text this homeowner. Reference the city order + deadline as the reason to act now. Warm, local, not salesy.",
 "why_you": "2-3 sentences on why ${biz} is the right shop for THIS job — local to the area, does ${trade}, can move before the hearing/deadline.",
 "property_note": "1-2 sentences: what the home's age/value implies for the job (materials, access, ballpark)."
}`

  const user = `CITED HOMEOWNER:
- Owner: ${input.ownerName || 'homeowner (name on file)'}
- Property: ${input.address}
- City citation (verbatim): "${input.violationText || 'code violation on file'}"
- ${input.fineUsd > 0 ? `City fine: $${input.fineUsd.toLocaleString('en-US')}` : 'Under city order (no fine amount listed)'}${input.hearingNote ? ` · ${input.hearingNote}` : ''}
- Home value (est): ${input.homeValue ? `$${input.homeValue.toLocaleString('en-US')}` : 'unknown'}
- Year built: ${input.yearBuilt ?? 'unknown'}

CONTRACTOR receiving this lead:
- Business: ${biz}
- Trade: ${trade}
- Area: ${input.contractorCity || 'their local area'}

Write the lead packet JSON.`

  try {
    const msg = await anthropic.messages.create({
      model: MODEL, max_tokens: 900, system: sys,
      messages: [{ role: 'user', content: user }],
    })
    let text = msg.content.find((c) => c.type === 'text')?.text?.trim() || ''
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(text) as LeadIntel
    if (!parsed.job_summary || !parsed.outreach_script) return null
    return parsed
  } catch {
    return null  // intel is enrichment — never block the lead on it
  }
}
