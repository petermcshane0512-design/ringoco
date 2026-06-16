import { createClient } from '@supabase/supabase-js'
import { isZipServed } from '@/lib/offer'

/**
 * Territory enforcement helpers — T3 of offer-rebuild plan (2026-06-10).
 *
 * Reads / writes the `territories` table defined in
 * sql/2026-06-10-opportunity-checker.sql. Shared between:
 *   - The homepage OpportunityChecker widget (read-only via /api/opportunity-check)
 *   - The /start/area gate page (read-only via /api/territory/check)
 *   - The Stripe webhook (claim on checkout, release-to-grace on cancel)
 *   - The /api/crons/territory-release-grace cron (grace → open)
 *   - /admin/territories table view
 *
 * Single shared Supabase client at module scope so we don't reconnect on
 * every API call.
 *
 * Column name notes: the schema lives at the parallel-agent path
 * (opportunity-checker.sql) so column names follow THEIR convention —
 * claimed_by_user_id (TEXT, holds Clerk user_id), grace_expires_at,
 * etc. The /admin/territories page + this helper module are the single
 * shared write surface; downstream callers think in our typed
 * abstractions (TerritoryRow.customerId etc) regardless of column name.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * 2026-06-10 — re-opened electrical + handyman + Other per Peter.
 * find-real-leads.tradeFiltersFor handles routing per trade; "other"
 * + free-text trades fall through to the handyman recent-buyer recipe.
 */
export const SUPPORTED_TRADE_SLUGS = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const
export type TerritoryTrade = (typeof SUPPORTED_TRADE_SLUGS)[number]

export type TerritoryStatus = 'open' | 'claimed' | 'grace' | 'unserved'

export const GRACE_DAYS = 14

export type TerritoryRow = {
  zip: string
  trade: string
  status: TerritoryStatus
  claimed_by_user_id: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  business_name: string | null
  metro: string | null
  claimed_at: string | null
  grace_expires_at: string | null
}

function normalizeZip(zip: string): string {
  return (zip || '').trim().slice(0, 5)
}

function normalizeTrade(trade: string): TerritoryTrade | null {
  const t = (trade || '').trim().toLowerCase()
  if ((SUPPORTED_TRADE_SLUGS as readonly string[]).includes(t)) return t as TerritoryTrade
  return null
}

/**
 * Look up territory status. Always returns 'open' as of 2026-06-10.
 *
 * History: T3 plan (commit c825033) enforced one-shop-per-(zip,trade)
 * via this gate. Rationale was a shared scraper pool — if two HVAC
 * shops claimed 60643 they'd fight over the same permit rows. With the
 * 2026-06-09 architecture pivot (per-tenant BatchData on signup, every
 * tenant gets their OWN 80 owner-occupied properties around their
 * business address), the shared-pool collision argument no longer
 * holds. Two HVAC shops in 60643 each draw their own 80-home pool from
 * BatchData with their own address-radius — overlap is statistical
 * noise, not a delivery collision.
 *
 * Per Peter 2026-06-10: "we're not making it so only 1 person can use
 * 1 zip code i hope not... if so fix that." Fixed.
 *
 * Lib + table preserved for back-compat (claim ledger / admin UI / SMS
 * attribution remain useful) but the gate that blocked second-shop
 * signups is dead. Existing claimed rows stay claimed for reporting
 * but never block a new claim.
 */
export async function checkTerritory(
  zipRaw: string,
  tradeRaw: string,
): Promise<{ status: TerritoryStatus; row: TerritoryRow | null }> {
  const zip = normalizeZip(zipRaw)
  const trade = normalizeTrade(tradeRaw)
  if (!zip || !trade) return { status: 'unserved', row: null }
  if (!isZipServed(zip)) return { status: 'unserved', row: null }
  // 2026-06-16 per Peter — EXCLUSIVITY RE-ENABLED (reverses the 2026-06-10
  // always-open). One shop per (zip, trade). The email/landing copy promises
  // "one shop per area, never shared" — so the lock MUST be real or the
  // promise is a lie. Look up the active claim; held + not expired-grace = taken.
  const { data } = await supabase
    .from('territories')
    .select('*')
    .eq('zip', zip)
    .eq('trade', trade)
    .maybeSingle()
  if (!data) return { status: 'open', row: null }
  const row = data as TerritoryRow
  if (row.status === 'claimed') return { status: 'claimed', row }
  if (row.status === 'grace') {
    // A recently-cancelled territory stays LOCKED through its grace window
    // (so the old owner can win it back) — only opens once grace expires.
    if (row.grace_expires_at && new Date(row.grace_expires_at) > new Date()) {
      return { status: 'grace', row }
    }
    return { status: 'open', row }
  }
  return { status: 'open', row }
}

/**
 * Claim a territory for a customer. Called from the Stripe webhook on
 * checkout.session.completed. Idempotent: re-claiming the same (zip,
 * trade) by the same customer is a no-op.
 *
 * Returns ok=true if the claim succeeded (or was already held by this
 * customer). Returns ok=false if the (zip, trade) is held by SOMEONE
 * ELSE and is still in 'claimed' or 'grace' — caller should refund.
 */
export async function claimTerritory(opts: {
  zip: string
  trade: string
  customerId: string                  // Clerk user_id
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  businessName?: string | null
  metro?: string | null
}): Promise<{ ok: boolean; row: TerritoryRow | null; conflict?: TerritoryRow }> {
  const zip = normalizeZip(opts.zip)
  const trade = normalizeTrade(opts.trade)
  if (!zip || !trade) return { ok: false, row: null }

  const existing = await checkTerritory(zip, trade)

  // Same customer re-claiming → idempotent success.
  if (existing.row && existing.row.claimed_by_user_id === opts.customerId) {
    const { data } = await supabase
      .from('territories')
      .update({
        status: 'claimed',
        stripe_customer_id: opts.stripeCustomerId ?? existing.row.stripe_customer_id,
        stripe_subscription_id: opts.stripeSubscriptionId ?? existing.row.stripe_subscription_id,
        business_name: opts.businessName ?? existing.row.business_name,
        grace_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('zip', zip)
      .eq('trade', trade)
      .select()
      .maybeSingle()
    return { ok: true, row: (data as TerritoryRow) ?? existing.row }
  }

  // Held by someone else AND still active → conflict, do NOT overwrite.
  if (existing.row && existing.status !== 'open') {
    return { ok: false, row: null, conflict: existing.row }
  }

  // Open (no row, expired-grace row, or status='open') → upsert claim.
  const { data, error } = await supabase
    .from('territories')
    .upsert({
      zip,
      trade,
      status: 'claimed',
      claimed_by_user_id: opts.customerId,
      stripe_customer_id: opts.stripeCustomerId ?? null,
      stripe_subscription_id: opts.stripeSubscriptionId ?? null,
      business_name: opts.businessName ?? null,
      metro: opts.metro ?? null,
      claimed_at: new Date().toISOString(),
      grace_expires_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'zip,trade' })
    .select()
    .maybeSingle()

  if (error) {
    console.error('[territory.claim] upsert failed:', error)
    return { ok: false, row: null }
  }
  return { ok: true, row: data as TerritoryRow }
}

/**
 * Move all of a customer's claimed territories into a 14-day grace
 * window. Called when their Stripe subscription cancels OR a refund
 * fires. Exclusivity is owed only while subscribed — grace prevents
 * accidental double-sell during dunning + retry cycles.
 */
export async function releaseCustomerTerritories(customerId: string): Promise<number> {
  const graceExpiresAt = new Date(Date.now() + GRACE_DAYS * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('territories')
    .update({
      status: 'grace',
      grace_expires_at: graceExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('claimed_by_user_id', customerId)
    .eq('status', 'claimed')
    .select('zip')
  if (error) {
    console.error('[territory.release]', error)
    return 0
  }
  return (data || []).length
}

/**
 * Cron-callable: flip grace → open for any territory whose
 * grace_expires_at has passed. Returns the count flipped.
 */
export async function reopenExpiredGrace(): Promise<number> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('territories')
    .update({
      status: 'open',
      claimed_by_user_id: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      business_name: null,
      claimed_at: null,
      grace_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'grace')
    .lt('grace_expires_at', nowIso)
    .select('zip')
  if (error) {
    console.error('[territory.reopenExpiredGrace]', error)
    return 0
  }
  return (data || []).length
}

/**
 * Append an email to the waitlist for a held territory. Writes to the
 * parallel-agent `opportunity_waitlist` table with reason='claimed' so
 * both the homepage widget's "uncovered" capture and our /start/area's
 * "claimed" capture share a single inbox.
 */
export async function addToWaitlist(opts: {
  zip: string
  trade: string
  email: string
  reason?: 'claimed' | 'uncovered'
}): Promise<{ ok: boolean }> {
  const zip = normalizeZip(opts.zip)
  const trade = normalizeTrade(opts.trade)
  const email = (opts.email || '').trim().toLowerCase()
  if (!zip || !trade || !email) return { ok: false }
  const { error } = await supabase
    .from('opportunity_waitlist')
    .upsert({
      zip,
      trade,
      email,
      reason: opts.reason ?? 'claimed',
    }, { onConflict: 'email,zip,trade' })
  if (error) {
    console.error('[territory.waitlist]', error)
    return { ok: false }
  }
  return { ok: true }
}
