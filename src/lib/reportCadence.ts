/**
 * Per-tier consulting report cadence.
 *
 * Front Desk (receptionist):  3 reports/year  → ~122 days between
 * AI Office Manager:          6 reports/year  → ~61  days between
 * Concierge:                  12 reports/year → ~30  days between
 *
 * Every tier gets a welcome report on day 1 of activation (`welcome_report_at`).
 * The first periodic report is due `cadenceDays` after that welcome.
 *
 * Legacy tier names are mapped to the v6 tiers so old subscribers don't break.
 */

export type CadenceTier = 'receptionist' | 'officemgr' | 'concierge'

const TIER_MAP: Record<string, CadenceTier> = {
  // v6 (current)
  receptionist: 'receptionist',
  officemgr: 'officemgr',
  concierge: 'concierge',
  // v3 legacy
  foundation: 'receptionist',
  growth: 'officemgr',
  premium: 'concierge',
  // v2 legacy
  starter: 'receptionist',
  solo: 'receptionist',
  scale: 'officemgr',
  multiloc: 'concierge',
}

const CADENCE_DAYS: Record<CadenceTier, number> = {
  receptionist: 122, //  3/year
  officemgr: 61,     //  6/year
  concierge: 30,     // 12/year
}

const REPORTS_PER_YEAR: Record<CadenceTier, number> = {
  receptionist: 3,
  officemgr: 6,
  concierge: 12,
}

export function normalizeTier(rawTier: string | null | undefined): CadenceTier | null {
  if (!rawTier) return null
  return TIER_MAP[rawTier] ?? null
}

export function cadenceDaysForTier(rawTier: string | null | undefined): number | null {
  const tier = normalizeTier(rawTier)
  return tier ? CADENCE_DAYS[tier] : null
}

export function reportsPerYear(rawTier: string | null | undefined): number {
  const tier = normalizeTier(rawTier)
  return tier ? REPORTS_PER_YEAR[tier] : 0
}

/**
 * Decide whether a customer is due for a periodic report.
 * Returns 'welcome' | 'periodic' | null (not due).
 */
export function reportDue(opts: {
  planTier: string | null | undefined
  isActive: boolean | null | undefined
  welcomeReportAt: string | null | undefined
  lastConsultingReportAt: string | null | undefined
  now?: Date
}): 'welcome' | 'periodic' | null {
  if (!opts.isActive) return null
  const tier = normalizeTier(opts.planTier)
  if (!tier) return null

  const now = opts.now ?? new Date()

  // No welcome yet → send welcome
  if (!opts.welcomeReportAt) return 'welcome'

  const cadenceMs = CADENCE_DAYS[tier] * 24 * 60 * 60 * 1000
  const lastAtIso = opts.lastConsultingReportAt ?? opts.welcomeReportAt
  const lastAt = new Date(lastAtIso).getTime()
  if (now.getTime() - lastAt >= cadenceMs) return 'periodic'
  return null
}

/**
 * Build a human-friendly period label spanning the last cadence window
 * (or "since activation" for the welcome report).
 */
export function periodLabel(opts: {
  reportType: 'welcome' | 'periodic'
  planTier: string | null | undefined
  windowEnd: Date
  windowStartOverride?: Date
}): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (opts.reportType === 'welcome') return `Welcome · ${fmt(opts.windowEnd)}`

  const days = cadenceDaysForTier(opts.planTier) ?? 90
  const start = opts.windowStartOverride
    ?? new Date(opts.windowEnd.getTime() - days * 24 * 60 * 60 * 1000)
  return `${fmt(start)} – ${fmt(opts.windowEnd)}`
}
