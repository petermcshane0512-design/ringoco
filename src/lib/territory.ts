import { createClient } from '@supabase/supabase-js'

/**
 * Territory enforcement helpers — T3 of offer-rebuild plan (2026-06-10).
 *
 * Makes the "one shop per area" claim mechanically real:
 *   - check(zip, trade)        → 'open' | 'claimed' | 'grace'
 *   - claim(zip, trade, ...)   → mark territory as held by customer (Stripe webhook)
 *   - release(customer_id)     → move all owned territories to 'grace' for 14d
 *   - reopenExpiredGrace()     → cron: flip grace → open after released_at passes
 *
 * Companion SQL: sql/2026-06-10-territories.sql.
 *
 * Single shared Supabase client at module scope so we don't reconnect on
 * every API call.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export const SUPPORTED_TRADE_SLUGS = ['hvac', 'plumbing', 'electrical', 'roofing', 'handyman'] as const
export type TerritoryTrade = (typeof SUPPORTED_TRADE_SLUGS)[number]

export type TerritoryStatus = 'open' | 'claimed' | 'grace'

export const GRACE_DAYS = 14

export type TerritoryRow = {
  id: string
  zip: string
  trade: string
  status: TerritoryStatus
  customer_id: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  claimed_at: string | null
  released_at: string | null
  business_name: string | null
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
 * Look up territory status. Returns 'open' if no row exists — caller
 * should treat that as available.
 */
export async function checkTerritory(
  zipRaw: string,
  tradeRaw: string,
): Promise<{ status: TerritoryStatus; row: TerritoryRow | null }> {
  const zip = normalizeZip(zipRaw)
  const trade = normalizeTrade(tradeRaw)
  if (!zip || !trade) return { status: 'open', row: null }
  const { data, error } = await supabase
    .from('territories')
    .select('*')
    .eq('zip', zip)
    .eq('trade', trade)
    .maybeSingle()
  if (error) {
    console.error('[territory.check]', error)
    // Fail-open intentionally: if Supabase is unreachable, do not block
    // checkout. Worst case = a double-claim that the webhook will catch
    // via the UNIQUE(zip, trade) constraint and refund.
    return { status: 'open', row: null }
  }
  if (!data) return { status: 'open', row: null }
  return { status: data.status as TerritoryStatus, row: data as TerritoryRow }
}

/**
 * Claim a territory for a customer. Called from the Stripe webhook on
 * checkout.session.completed. Idempotent: re-claiming the same (zip,
 * trade) by the same customer is a no-op.
 *
 * Returns true if the claim succeeded (or was already held by this
 * customer). Returns false if the (zip, trade) is held by SOMEONE ELSE
 * and is still in 'claimed' or 'grace' — caller should refund.
 */
export async function claimTerritory(opts: {
  zip: string
  trade: string
  customerId: string
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  businessName?: string | null
  metro?: string | null
}): Promise<{ ok: boolean; row: TerritoryRow | null; conflict?: TerritoryRow }> {
  const zip = normalizeZip(opts.zip)
  const trade = normalizeTrade(opts.trade)
  if (!zip || !trade) return { ok: false, row: null }

  // Check current state.
  const existing = await checkTerritory(zip, trade)

  // Same customer re-claiming → idempotent success.
  if (existing.row && existing.row.customer_id === opts.customerId) {
    const { data } = await supabase
      .from('territories')
      .update({
        status: 'claimed',
        stripe_customer_id: opts.stripeCustomerId ?? existing.row.stripe_customer_id,
        stripe_subscription_id: opts.stripeSubscriptionId ?? existing.row.stripe_subscription_id,
        business_name: opts.businessName ?? existing.row.business_name,
        released_at: null,
      })
      .eq('id', existing.row.id)
      .select()
      .maybeSingle()
    return { ok: true, row: (data as TerritoryRow) ?? existing.row }
  }

  // Held by someone else → conflict, do NOT overwrite.
  if (existing.row && existing.status !== 'open') {
    return { ok: false, row: null, conflict: existing.row }
  }

  // Open (no row, or row marked open) → upsert claim.
  const { data, error } = await supabase
    .from('territories')
    .upsert({
      zip,
      trade,
      metro: opts.metro ?? null,
      status: 'claimed',
      customer_id: opts.customerId,
      stripe_customer_id: opts.stripeCustomerId ?? null,
      stripe_subscription_id: opts.stripeSubscriptionId ?? null,
      business_name: opts.businessName ?? null,
      claimed_at: new Date().toISOString(),
      released_at: null,
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
  const releasedAt = new Date(Date.now() + GRACE_DAYS * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('territories')
    .update({ status: 'grace', released_at: releasedAt })
    .eq('customer_id', customerId)
    .eq('status', 'claimed')
    .select('id')
  if (error) {
    console.error('[territory.release]', error)
    return 0
  }
  return (data || []).length
}

/**
 * Cron-callable: flip grace → open for any territory whose released_at
 * has passed. Returns the count flipped.
 */
export async function reopenExpiredGrace(): Promise<number> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('territories')
    .update({
      status: 'open',
      customer_id: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      business_name: null,
      claimed_at: null,
      released_at: null,
    })
    .eq('status', 'grace')
    .lt('released_at', nowIso)
    .select('id')
  if (error) {
    console.error('[territory.reopenExpiredGrace]', error)
    return 0
  }
  return (data || []).length
}

/**
 * Append an email to the waitlist for a held territory. Idempotent on
 * (zip, trade, email) via the UNIQUE index.
 */
export async function addToWaitlist(opts: {
  zip: string
  trade: string
  email: string
  businessName?: string | null
  source?: string
}): Promise<{ ok: boolean }> {
  const zip = normalizeZip(opts.zip)
  const trade = normalizeTrade(opts.trade)
  const email = (opts.email || '').trim().toLowerCase()
  if (!zip || !trade || !email) return { ok: false }
  const { error } = await supabase
    .from('territory_waitlist')
    .upsert({
      zip,
      trade,
      email,
      business_name: opts.businessName ?? null,
      source: opts.source || 'start_area',
    }, { onConflict: 'zip,trade,email' })
  if (error) {
    console.error('[territory.waitlist]', error)
    return { ok: false }
  }
  return { ok: true }
}
