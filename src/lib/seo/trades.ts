/**
 * Trade definitions for the programmatic /leads/[city]/[trade] SEO pages.
 *
 * 2026-06-17 — rewritten from the dead receptionist era ("Emma answers
 * your calls") to the current product: FREE homeowner leads pulled from
 * public code-enforcement + permit records, delivered weekly. One shop
 * per zip, 2 weeks free, then $197/mo.
 *
 * slug        — URL fragment (/leads/chicago-il/roofing)
 * label       — headline noun ("Roofing")
 * pluralLabel — "roofing contractors" (used mid-sentence)
 * googleQuery — Google Places query for getTopShops (competitor proof)
 * avgJobUsd   — typical ticket; powers the "do the math" line
 * enforcementAngle — WHY this trade gets leads from city records
 * leadHook    — one-liner hero subhead, lead-gen framed
 * metaDesc    — <meta name=description>, keyed on city label
 */
export const TRADES = [
  {
    slug: 'roofing',
    label: 'Roofing',
    pluralLabel: 'roofing contractors',
    googleQuery: 'roofing contractor',
    avgJobUsd: 9_500,
    enforcementAngle:
      'Cities issue roof, re-roof, and storm-damage permits — and code-enforcement notices for missing/damaged roofs — every week. Each one is a homeowner who needs a roofer NOW, often on a deadline before a fine hits.',
    leadHook:
      'Homeowners in {city} pulled roofing permits and got cited for roof violations this month. We hand you their name, address, and phone — your first one free.',
    metaDesc: (city: string) =>
      `Free roofing leads in ${city}. Real homeowners with open roof permits and code violations — name, address, phone. First lead free, 2 weeks free, then $197/mo. One roofer per zip.`,
  },
  {
    slug: 'hvac',
    label: 'HVAC',
    pluralLabel: 'HVAC contractors',
    googleQuery: 'HVAC contractor',
    avgJobUsd: 6_500,
    enforcementAngle:
      'Mechanical and HVAC permits, plus health/comfort code violations (no heat, failed inspection), surface in public records constantly. Each is a homeowner who needs install or repair work fast.',
    leadHook:
      'Homeowners in {city} pulled HVAC/mechanical permits and failed inspections this month. We hand you their name, address, and phone — your first one free.',
    metaDesc: (city: string) =>
      `Free HVAC leads in ${city}. Real homeowners with open mechanical permits and failed inspections — name, address, phone. First lead free, 2 weeks free, then $197/mo. One HVAC shop per zip.`,
  },
  {
    slug: 'plumbing',
    label: 'Plumbing',
    pluralLabel: 'plumbers',
    googleQuery: 'plumber',
    avgJobUsd: 3_200,
    enforcementAngle:
      'Plumbing permits (water heater, sewer, repipe) and water/sanitary code violations are filed publicly. Each one is a homeowner mid-project or under a deadline to fix it.',
    leadHook:
      'Homeowners in {city} pulled plumbing permits and got cited for water/sewer violations this month. We hand you their name, address, and phone — your first one free.',
    metaDesc: (city: string) =>
      `Free plumbing leads in ${city}. Real homeowners with open plumbing permits and code violations — name, address, phone. First lead free, 2 weeks free, then $197/mo. One plumber per zip.`,
  },
  {
    slug: 'electrical',
    label: 'Electrical',
    pluralLabel: 'electricians',
    googleQuery: 'electrician',
    avgJobUsd: 2_800,
    enforcementAngle:
      'Electrical permits (panel upgrades, rewires, EV chargers) and electrical-hazard code violations are public record. Each is a homeowner who legally needs a licensed electrician.',
    leadHook:
      'Homeowners in {city} pulled electrical permits and got cited for hazard violations this month. We hand you their name, address, and phone — your first one free.',
    metaDesc: (city: string) =>
      `Free electrical leads in ${city}. Real homeowners with open electrical permits and code violations — name, address, phone. First lead free, 2 weeks free, then $197/mo. One electrician per zip.`,
  },
  {
    slug: 'masonry',
    label: 'Masonry & Tuckpointing',
    pluralLabel: 'masonry contractors',
    googleQuery: 'masonry tuckpointing contractor',
    avgJobUsd: 7_000,
    enforcementAngle:
      'Facade, parapet, and masonry inspection ordinances force owners to repair brick, tuckpoint, and parapets on a deadline — or face daily fines. These violations are filed publicly with the address.',
    leadHook:
      'Homeowners and building owners in {city} got cited for facade and masonry violations this month — on a fine deadline. We hand you their name, address, and phone — your first one free.',
    metaDesc: (city: string) =>
      `Free masonry & tuckpointing leads in ${city}. Building owners under facade-violation deadlines — name, address, phone. First lead free, 2 weeks free, then $197/mo. One mason per zip.`,
  },
  {
    slug: 'landscaping',
    label: 'Landscaping & Exterior',
    pluralLabel: 'landscapers',
    googleQuery: 'landscaping company',
    avgJobUsd: 1_800,
    enforcementAngle:
      'Weeds, overgrowth, debris, and property-maintenance violations are issued to homeowners weekly — each one a forced exterior cleanup job with a compliance deadline.',
    leadHook:
      'Homeowners in {city} got cited for overgrowth and property-maintenance violations this month. We hand you their name, address, and phone — your first one free.',
    metaDesc: (city: string) =>
      `Free landscaping leads in ${city}. Homeowners cited for property-maintenance violations — name, address, phone. First lead free, 2 weeks free, then $197/mo. One landscaper per zip.`,
  },
] as const

export type TradeSlug = (typeof TRADES)[number]['slug']

export function getTrade(slug: string) {
  return TRADES.find((t) => t.slug === slug) ?? null
}
