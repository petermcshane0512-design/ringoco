import tradeTriggersConfig from '@/config/tradeTriggers.json'

/**
 * Enforcement-tier trigger model — 2026-06-11 per Peter.
 *
 * Every lead carries a trigger_type + urgency_tier in source_details:
 *
 *   trigger_type   urgency_tier   meaning
 *   hearings_case  1              fines imposed / Admin Hearings docket — legal + financial pressure NOW
 *   violation      2              open building violation — city has ordered the repair
 *   failed_inspection 3           inspection FAILED (from the violations feed's inspection_status)
 *   311            3              urgent building-related service request
 *   permit         4              planned project (existing pipeline)
 *
 * The tier drives the lead score, the colored dashboard tag, and the
 * legal/financial-pressure call-angle copy. The keyword → trade mapping
 * lives in src/config/tradeTriggers.json (editable, no code change to
 * tune matching).
 */

export type TriggerType = 'permit' | 'violation' | 'failed_inspection' | 'hearings_case' | '311'

export type TradeRule = { key: string; engineTrade: string; label: string; patterns: string[] }

export function tradeRules(): TradeRule[] {
  return (tradeTriggersConfig as { trades: TradeRule[] }).trades
}

export function building311Types(): string[] {
  return (tradeTriggersConfig as { sr311_building_types: string[] }).sr311_building_types
}

/** Match free text against the config. Returns granular keys + engine trades. */
export function matchTrades(text: string): { keys: string[]; engineTrades: string[] } {
  const blob = (text || '').toLowerCase()
  const keys: string[] = []
  const engine = new Set<string>()
  for (const rule of tradeRules()) {
    if (rule.patterns.some((p) => new RegExp(p, 'i').test(blob))) {
      keys.push(rule.key)
      engine.add(rule.engineTrade)
    }
  }
  return { keys, engineTrades: [...engine] }
}

export function tierFor(trigger: TriggerType): 1 | 2 | 3 | 4 {
  if (trigger === 'hearings_case') return 1
  if (trigger === 'violation') return 2
  if (trigger === 'failed_inspection' || trigger === '311') return 3
  return 4
}

export function scoreForTier(tier: 1 | 2 | 3 | 4): number {
  return tier === 1 ? 96 : tier === 2 ? 88 : tier === 3 ? 82 : 70
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** Plain-English colored tag text for the dashboard list view. */
export function urgencyLabel(trigger: TriggerType, opts: { date?: string | null; fine?: number | null; tradeLabel?: string | null }): string {
  const d = shortDate(opts.date)
  if (trigger === 'hearings_case') {
    if (opts.fine && opts.fine > 0) return `Fined $${Math.round(opts.fine).toLocaleString()}${d ? ` — hearing ${d}` : ''}`
    return `Hearings case${d ? ` — ${d}` : ''}`
  }
  if (trigger === 'violation') return `Cited${opts.tradeLabel ? `: ${opts.tradeLabel.toLowerCase()} repair required` : ' by the city'}${d ? ` (${d})` : ''}`
  if (trigger === 'failed_inspection') return `Failed inspection${d ? ` ${d}` : ''}`
  if (trigger === '311') return `City complaint filed${d ? ` ${d}` : ''}`
  return 'Permit filed'
}

/**
 * Normalize raw municipal text (ALL CAPS, quote artifacts, code refs) to a
 * readable sentence fragment. Server-side sibling of the dashboard's
 * render-time cleaner — applied at INGEST so stored pitches are clean.
 */
export function cleanMunicipalText(text: string): string {
  let t = (text || '')
    .replace(/'\s*'+/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (t === t.toUpperCase() && /[A-Z]{4,}/.test(t)) {
    t = t.toLowerCase()
    t = t.charAt(0).toUpperCase() + t.slice(1)
  }
  t = t.replace(/\s*\(1[0-9]-[0-9-]+\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (t && !/[.!?]$/.test(t)) t += '.'
  return t
}

/**
 * 1-2 plain sentences for the call angle. Emphasizes the legal/financial
 * pressure: these homeowners are ORDERED to fix it — the contractor's
 * call is the solution, not a pitch.
 */
export function buildPitch(trigger: TriggerType, desc: string, opts: { fine?: number | null; date?: string | null }): string {
  const clean = cleanMunicipalText(desc)
  const d = shortDate(opts.date)
  if (trigger === 'hearings_case') {
    const fine = opts.fine && opts.fine > 0 ? `$${Math.round(opts.fine).toLocaleString()} in fines` : 'fines'
    return `The city has taken this homeowner to administrative hearings with ${fine} on the line — they are legally required to fix this: ${clean} They need a licensed contractor now; your call solves their problem.`
  }
  if (trigger === 'violation') {
    return `The city cited this home${d ? ` on ${d}` : ''} and ordered the repair: ${clean} They have to fix it or fines start — call this week while they're looking for someone licensed.`
  }
  if (trigger === 'failed_inspection') {
    return `This property failed a city inspection${d ? ` on ${d}` : ''}: ${clean} The owner needs the work corrected and re-inspected — be the contractor who gets them to pass.`
  }
  if (trigger === '311') {
    return `The homeowner (or a neighbor) reported this to the city${d ? ` on ${d}` : ''}: ${clean} They're already aware of the problem — a quick call books the fix.`
  }
  return `Recent permit activity at this address: ${clean} Call or knock this week while they're planning the project.`
}

export function whyTags(trigger: TriggerType, opts: { fine?: number | null; date?: string | null; desc?: string; historyCount?: number }): string[] {
  const tags: string[] = []
  const d = shortDate(opts.date)
  if (trigger === 'hearings_case') {
    tags.push(opts.fine && opts.fine > 0 ? `City fine on record: $${Math.round(opts.fine).toLocaleString()}` : 'Administrative hearings case open')
    tags.push('Legally required to make this repair')
  } else if (trigger === 'violation') {
    tags.push(`Open city violation${d ? ` since ${d}` : ''}`)
    tags.push('Repair ordered — fines accrue if ignored')
  } else if (trigger === 'failed_inspection') {
    tags.push(`Failed city inspection${d ? ` ${d}` : ''}`)
    tags.push('Must correct and pass re-inspection')
  } else if (trigger === '311') {
    tags.push(`311 complaint filed${d ? ` ${d}` : ''}`)
  }
  if (opts.desc) tags.push(cleanMunicipalText(opts.desc).slice(0, 90))
  if (opts.historyCount && opts.historyCount > 1) tags.push(`${opts.historyCount} separate city actions at this address`)
  return tags
}
