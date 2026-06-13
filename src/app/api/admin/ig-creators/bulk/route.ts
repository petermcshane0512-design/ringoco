import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripeClient'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import {
  vanityCodeFromHandle,
  personalCodeFromHandle,
  findAvailableCode,
  mintPromotionCode,
  mintPersonalPromotionCode,
  ensureSharedCoupon,
  ensurePersonalCoupon,
} from '@/lib/creatorCodes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/**
 * POST /api/admin/ig-creators/bulk
 *
 * Bulk creator onboarding. Designed for nights when Peter sends out 75
 * DMs and 10 of them respond yes â€” he pastes those 10 handles into one
 * request, gets back 10 pairs of codes ready to DM back.
 *
 * Body:
 *   { handles: string[], trade?: string }
 *
 * Each handle gets:
 *   - row in ig_creator_outreach (status='active_creator')
 *   - PUBLIC promo code  ($400 off first month, multi-use)
 *   - PERSONAL promo code (3 months free, single-use)
 *   - paste-ready DM block
 *
 * Idempotent on handle â€” if the row already exists, we add codes that
 * are still missing without disturbing the rest of the record.
 */
const VALID_STATUS = ['saved', 'dmed', 'replied_yes', 'replied_no', 'active_creator', 'paid_bonus_hit', 'dropped'] as const

type CreatorResult = {
  handle: string
  ok: boolean
  creator_id?: string
  promo_code?: string | null
  personal_promo_code?: string | null
  public_ref_url?: string | null
  dm_block?: string | null
  error?: string
  stage?: string
}

async function provisionOne(handle: string, trade?: string): Promise<CreatorResult> {
  const normalized = (handle || '').trim().replace(/^@/, '').toLowerCase()
  if (!normalized) return { handle, ok: false, error: 'empty handle', stage: 'validate' }

  // 1. Upsert the creator row (insert or fetch existing).
  let creatorId: string | null = null
  let existingRow: Record<string, unknown> | null = null
  const insertRes = await supabase
    .from('ig_creator_outreach')
    .insert({
      handle: normalized,
      trade: trade || null,
      status: 'active_creator',
      free_trial_code: `BAVG-${normalized.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')}`,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertRes.error) {
    const code = (insertRes.error as { code?: string }).code
    if (code === '23505') {
      const found = await supabase
        .from('ig_creator_outreach')
        .select('*')
        .ilike('handle', normalized)
        .maybeSingle()
      if (!found.data) return { handle: normalized, ok: false, error: 'unique violation but no matching row', stage: 'upsert' }
      // Flip the row to active_creator since they just opted in.
      const status = VALID_STATUS.includes('active_creator' as typeof VALID_STATUS[number]) ? 'active_creator' : 'saved'
      const patched = await supabase
        .from('ig_creator_outreach')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', (found.data as { id: string }).id)
        .select('*')
        .single()
      existingRow = (patched.data ?? found.data) as Record<string, unknown>
      creatorId = (existingRow.id as string) || null
    } else {
      return { handle: normalized, ok: false, error: insertRes.error.message, stage: 'insert' }
    }
  } else {
    existingRow = insertRes.data as Record<string, unknown>
    creatorId = (existingRow.id as string) || null
  }
  if (!creatorId || !existingRow) return { handle: normalized, ok: false, error: 'no creator id', stage: 'persist' }

  let promo_code = (existingRow.promo_code as string | null | undefined) ?? null
  let personal_promo_code = (existingRow.personal_promo_code as string | null | undefined) ?? null

  // 2. Mint PUBLIC code if missing.
  if (!promo_code) {
    try {
      await ensureSharedCoupon(stripe)
      const base = vanityCodeFromHandle(normalized)
      const finalCode = await findAvailableCode(supabase, base, 'promo_code')
      const promo = await mintPromotionCode(stripe, finalCode, {
        creator_id: creatorId,
        creator_handle: normalized,
      })
      await supabase
        .from('ig_creator_outreach')
        .update({
          promo_code: finalCode,
          stripe_promotion_code_id: promo.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', creatorId)
      promo_code = finalCode
    } catch (e) {
      const err = e as { message?: string; raw?: { message?: string } }
      return { handle: normalized, creator_id: creatorId, ok: false, error: err.raw?.message || err.message || String(e), stage: 'mint_public' }
    }
  }

  // 3. Mint PERSONAL code if missing.
  if (!personal_promo_code) {
    try {
      await ensurePersonalCoupon(stripe)
      const base = personalCodeFromHandle(normalized)
      const finalCode = await findAvailableCode(supabase, base, 'personal_promo_code')
      const promo = await mintPersonalPromotionCode(stripe, finalCode, {
        creator_id: creatorId,
        creator_handle: normalized,
        kind: 'personal_3mo_free',
      })
      await supabase
        .from('ig_creator_outreach')
        .update({
          personal_promo_code: finalCode,
          personal_stripe_promotion_code_id: promo.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', creatorId)
      personal_promo_code = finalCode
    } catch (e) {
      const err = e as { message?: string; raw?: { message?: string } }
      return { handle: normalized, creator_id: creatorId, ok: false, error: err.raw?.message || err.message || String(e), stage: 'mint_personal' }
    }
  }

  const public_ref_url = promo_code ? `https://www.bellavego.com/ref/${promo_code}` : null
  const dm_block = promo_code && personal_promo_code
    ? `ðŸ”¥ You're in. Two codes:\n\n` +
      `1) YOUR personal 3-months-free code: ${personal_promo_code}\n` +
      `   Sign up at https://www.bellavego.com/pricing, apply ${personal_promo_code} at checkout.\n\n` +
      `2) YOUR fan code (give to followers): ${promo_code}\n` +
      `   They click https://www.bellavego.com/ref/${promo_code} and get $97 first month.\n` +
      `   You earn $200/paid ref (Friday after their month 2 charge clears) + $1K bonus at 5 refs + $3K at 15.`
    : null

  return {
    handle: normalized,
    ok: true,
    creator_id: creatorId,
    promo_code,
    personal_promo_code,
    public_ref_url,
    dm_block,
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    let body: { handles?: unknown; trade?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 400 })
    }

    const handlesRaw = body.handles
    if (!Array.isArray(handlesRaw) || handlesRaw.length === 0) {
      return NextResponse.json({ error: 'handles[] required (non-empty)' }, { status: 400 })
    }
    if (handlesRaw.length > 50) {
      return NextResponse.json({ error: 'max 50 handles per call' }, { status: 400 })
    }

    const results: CreatorResult[] = []
    for (const h of handlesRaw) {
      const r = await provisionOne(String(h), body.trade)
      results.push(r)
    }

    return NextResponse.json({
      ok: true,
      provisioned: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    })
  } catch (e) {
    const err = e as { message?: string; stack?: string }
    return NextResponse.json({
      error: 'unhandled exception',
      detail: err.message || String(e),
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    }, { status: 500 })
  }
}
