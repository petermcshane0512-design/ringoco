/**
 * BatchData daily spend gate. Per Fable 5 review:
 * "Without a hard daily spend cap, scanner-driven ghost clicks will drain
 *  the balance before any human converts."
 *
 * Every BatchData-touching route MUST call canSpendBatchData() before
 * the API hit + logBatchDataSpend() after a paid call (whether result_ok
 * or 4xx returning data).
 *
 * Cap is dollar-amount NOT request-count — different endpoints have
 * different costs (Property Search $0.05, Skip-Trace $0.10).
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

// Daily cap defaults to $10. Override via BATCHDATA_DAILY_CAP_USD env.
const DEFAULT_DAILY_CAP_CENTS = 1000
function dailyCapCents(): number {
  const raw = process.env.BATCHDATA_DAILY_CAP_USD
  if (!raw) return DEFAULT_DAILY_CAP_CENTS
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) ? DEFAULT_DAILY_CAP_CENTS : parsed * 100
}

/**
 * @returns true if we can fire another BatchData call today + headroom.
 * Fail-safe: on DB error returns true (don't BLOCK a real customer just
 * because Supabase is slow). The cap is a kill-switch for rare scanner
 * floods, not a precise budget control.
 */
export async function canSpendBatchData(estimatedCostCents: number): Promise<{ ok: boolean; spentTodayCents: number; capCents: number; reason?: string }> {
  const capCents = dailyCapCents()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('batchdata_spend_log')
    .select('cost_cents')
    .gte('spent_at', dayAgo)
    .limit(10000)
  if (error) {
    // Don't block on DB error — log it, allow the spend.
    console.warn('[batchdataSpend] db read failed, allowing spend:', error.message)
    return { ok: true, spentTodayCents: 0, capCents, reason: 'db_unavailable_allow' }
  }
  const spent = (data || []).reduce((acc, r) => acc + ((r as { cost_cents: number }).cost_cents || 0), 0)
  if (spent + estimatedCostCents > capCents) {
    return { ok: false, spentTodayCents: spent, capCents, reason: 'daily_cap_hit' }
  }
  return { ok: true, spentTodayCents: spent, capCents }
}

export async function logBatchDataSpend(params: {
  costCents: number
  caller: string
  context: Record<string, unknown>
  resultOk: boolean
}): Promise<void> {
  try {
    await supabase.from('batchdata_spend_log').insert({
      cost_cents: params.costCents,
      caller: params.caller,
      context: params.context,
      result_ok: params.resultOk,
    })
  } catch (e) {
    // Best-effort logging. Don't fail the caller because logging failed.
    console.warn('[batchdataSpend] log write failed:', (e as Error).message)
  }
}
