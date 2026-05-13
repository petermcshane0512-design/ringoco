/**
 * Growth Wallet — pre-funded ad-spend budget for Concierge customers.
 * Customer tops up via Stripe Checkout (one-time payment). Each ad spend
 * deducts from the balance + adds a 15% management fee line.
 *
 * Source of truth: growth_wallet_ledger table.
 * Cached balance: concierge_settings.growth_wallet_balance_cents (kept in sync).
 *
 * Use `applyLedgerEntry` for ALL balance changes — it's the single transactional
 * write path. Direct writes to balance_after_cents will drift.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const MGMT_FEE_BPS = 1500  // 15.00% = 1500 basis points

export type LedgerKind = 'topup' | 'ad_spend' | 'mgmt_fee' | 'refund'

export async function applyLedgerEntry(args: {
  supabase: SupabaseClient
  userId: string
  kind: LedgerKind
  amountCents: number   // signed: positive = credit (topup/refund), negative = debit (spend/fee)
  campaignId?: string
  stripeChargeId?: string
  note?: string
}): Promise<{ balanceAfter: number }> {
  const { data: settings } = await args.supabase
    .from('concierge_settings')
    .select('growth_wallet_balance_cents')
    .eq('user_id', args.userId)
    .maybeSingle()
  const currentBalance = settings?.growth_wallet_balance_cents ?? 0
  const balanceAfter = currentBalance + args.amountCents

  // Insert ledger row
  const { error: ledgerErr } = await args.supabase.from('growth_wallet_ledger').insert({
    user_id: args.userId,
    kind: args.kind,
    amount_cents: args.amountCents,
    balance_after_cents: balanceAfter,
    campaign_id: args.campaignId,
    stripe_charge_id: args.stripeChargeId,
    note: args.note,
  })
  if (ledgerErr) throw new Error(`ledger insert: ${ledgerErr.message}`)

  // Update cached balance — upsert in case row doesn't exist yet
  const { error: balErr } = await args.supabase
    .from('concierge_settings')
    .upsert(
      { user_id: args.userId, growth_wallet_balance_cents: balanceAfter, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (balErr) throw new Error(`balance update: ${balErr.message}`)

  return { balanceAfter }
}

/**
 * Record a $X ad spend. Posts two ledger lines: the spend itself + the 15% mgmt fee.
 * Both are debits (negative). Returns final balance.
 */
export async function recordAdSpend(args: {
  supabase: SupabaseClient
  userId: string
  amountCents: number      // positive; we negate inside
  campaignId?: string
  note?: string
}): Promise<{ balanceAfter: number; mgmtFeeCents: number }> {
  if (args.amountCents <= 0) throw new Error('amountCents must be positive')
  const mgmtFee = Math.round((args.amountCents * MGMT_FEE_BPS) / 10000)

  await applyLedgerEntry({
    supabase: args.supabase, userId: args.userId, kind: 'ad_spend',
    amountCents: -args.amountCents, campaignId: args.campaignId,
    note: args.note ?? 'Ad spend',
  })
  const after = await applyLedgerEntry({
    supabase: args.supabase, userId: args.userId, kind: 'mgmt_fee',
    amountCents: -mgmtFee, campaignId: args.campaignId,
    note: `15% management fee on $${(args.amountCents / 100).toFixed(2)} ad spend`,
  })
  return { balanceAfter: after.balanceAfter, mgmtFeeCents: mgmtFee }
}
