import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { stripe } from '@/lib/stripeClient'
import { mintPromotionCode, mintPersonalPromotionCode, ensureSharedCoupon, ensurePersonalCoupon } from '@/lib/creatorCodes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const PROMOTION_CODE_API_VERSION = '2024-11-20.acacia'

/**
 * POST /api/admin/ig-creators/[id]/rename-codes
 *
 * Stripe promotion_codes can't be renamed — `code` is immutable. So we
 * mint NEW codes with the new names and DEACTIVATE the old ones.
 *
 * What's preserved:
 *   - creator row id, handle, payout counters (pending/payable/lifetime)
 *   - existing profiles.referred_by_promo_code attributions
 *   - creator_payouts audit history
 *   - old Stripe promo_code records (just inactive — no new redemptions)
 *
 * What changes:
 *   - ig_creator_outreach.promo_code, stripe_promotion_code_id
 *   - ig_creator_outreach.personal_promo_code, personal_stripe_promotion_code_id
 *   - notes appended with rename audit line
 *
 * Body (both optional — omit either to leave that code alone):
 *   { public_code?: string, personal_code?: string }
 *
 * Codes are normalized to uppercase A-Z 0-9 only, max 16 chars.
 */

function sanitizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const { id } = await ctx.params

    let body: { public_code?: string; personal_code?: string } = {}
    try { body = await req.json() } catch { /* both fields optional */ }

    const newPublic = body.public_code ? sanitizeCode(body.public_code) : null
    const newPersonal = body.personal_code ? sanitizeCode(body.personal_code) : null
    if (!newPublic && !newPersonal) {
      return NextResponse.json({ error: 'provide public_code and/or personal_code' }, { status: 400 })
    }

    const { data: creatorRaw, error: fetchErr } = await supabase
      .from('ig_creator_outreach')
      .select('id, handle, promo_code, stripe_promotion_code_id, personal_promo_code, personal_stripe_promotion_code_id, notes')
      .eq('id', id)
      .maybeSingle()
    type Row = {
      id: string
      handle: string | null
      promo_code: string | null
      stripe_promotion_code_id: string | null
      personal_promo_code: string | null
      personal_stripe_promotion_code_id: string | null
      notes: string | null
    }
    const creator = creatorRaw as Row | null
    if (fetchErr || !creator) {
      return NextResponse.json({ error: 'creator not found', detail: fetchErr?.message }, { status: 404 })
    }

    const before = {
      promo_code: creator.promo_code,
      stripe_promotion_code_id: creator.stripe_promotion_code_id,
      personal_promo_code: creator.personal_promo_code,
      personal_stripe_promotion_code_id: creator.personal_stripe_promotion_code_id,
    }

    const renamedParts: string[] = []
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // ── PUBLIC code rename ──
    let finalPublic = creator.promo_code
    let finalPublicId = creator.stripe_promotion_code_id
    if (newPublic && newPublic !== creator.promo_code) {
      // Uniqueness check (DB-side) so we don't collide with another creator.
      const { data: clash } = await supabase
        .from('ig_creator_outreach')
        .select('id, handle')
        .eq('promo_code', newPublic)
        .neq('id', id)
        .maybeSingle()
      if (clash) {
        return NextResponse.json({
          error: 'public_code already in use by another creator',
          stage: 'collision_public',
          conflicting_creator: clash,
        }, { status: 409 })
      }

      try { await ensureSharedCoupon(stripe) } catch (e) {
        const err = e as { message?: string; raw?: { message?: string } }
        return NextResponse.json({ error: 'ensureSharedCoupon failed', stage: 'ensure_public', detail: err.raw?.message || err.message || String(e) }, { status: 502 })
      }

      let newPromo: Stripe.PromotionCode
      try {
        newPromo = await mintPromotionCode(stripe, newPublic, {
          creator_id: String(creator.id),
          creator_handle: String(creator.handle),
          rename_origin: creator.promo_code || '(none)',
        })
      } catch (e) {
        const err = e as { message?: string; raw?: { message?: string } }
        return NextResponse.json({ error: 'mint new public promo failed', stage: 'mint_public', attempted_code: newPublic, detail: err.raw?.message || err.message || String(e) }, { status: 502 })
      }

      // Deactivate the old Stripe promotion_code.
      if (creator.stripe_promotion_code_id) {
        try {
          await stripe.promotionCodes.update(
            creator.stripe_promotion_code_id,
            { active: false, metadata: { renamed_to: newPublic, renamed_at: new Date().toISOString() } },
            { apiVersion: PROMOTION_CODE_API_VERSION },
          )
        } catch (e) {
          const err = e as { message?: string }
          console.warn('[rename-codes] failed to deactivate old public', creator.stripe_promotion_code_id, err.message)
        }
      }

      finalPublic = newPublic
      finalPublicId = newPromo.id
      update.promo_code = finalPublic
      update.stripe_promotion_code_id = finalPublicId
      renamedParts.push(`${before.promo_code || '(none)'}→${newPublic}`)
    }

    // ── PERSONAL code rename ──
    let finalPersonal = creator.personal_promo_code
    let finalPersonalId = creator.personal_stripe_promotion_code_id
    if (newPersonal && newPersonal !== creator.personal_promo_code) {
      const { data: clash } = await supabase
        .from('ig_creator_outreach')
        .select('id, handle')
        .eq('personal_promo_code', newPersonal)
        .neq('id', id)
        .maybeSingle()
      if (clash) {
        return NextResponse.json({
          error: 'personal_code already in use by another creator',
          stage: 'collision_personal',
          conflicting_creator: clash,
        }, { status: 409 })
      }

      try { await ensurePersonalCoupon(stripe) } catch (e) {
        const err = e as { message?: string; raw?: { message?: string } }
        return NextResponse.json({ error: 'ensurePersonalCoupon failed', stage: 'ensure_personal', detail: err.raw?.message || err.message || String(e) }, { status: 502 })
      }

      let newPromo: Stripe.PromotionCode
      try {
        newPromo = await mintPersonalPromotionCode(stripe, newPersonal, {
          creator_id: String(creator.id),
          creator_handle: String(creator.handle),
          rename_origin: creator.personal_promo_code || '(none)',
          kind: 'personal_3mo_free',
        })
      } catch (e) {
        const err = e as { message?: string; raw?: { message?: string } }
        return NextResponse.json({ error: 'mint new personal promo failed', stage: 'mint_personal', attempted_code: newPersonal, detail: err.raw?.message || err.message || String(e) }, { status: 502 })
      }

      if (creator.personal_stripe_promotion_code_id) {
        try {
          await stripe.promotionCodes.update(
            creator.personal_stripe_promotion_code_id,
            { active: false, metadata: { renamed_to: newPersonal, renamed_at: new Date().toISOString() } },
            { apiVersion: PROMOTION_CODE_API_VERSION },
          )
        } catch (e) {
          const err = e as { message?: string }
          console.warn('[rename-codes] failed to deactivate old personal', creator.personal_stripe_promotion_code_id, err.message)
        }
      }

      finalPersonal = newPersonal
      finalPersonalId = newPromo.id
      update.personal_promo_code = finalPersonal
      update.personal_stripe_promotion_code_id = finalPersonalId
      renamedParts.push(`${before.personal_promo_code || '(none)'}→${newPersonal} (personal)`)
    }

    if (renamedParts.length === 0) {
      return NextResponse.json({ ok: true, no_op: true, message: 'codes already match requested values' })
    }

    const auditLine = ` | ${new Date().toISOString().slice(0,10)} rename: ${renamedParts.join(', ')}`
    update.notes = (creator.notes || '') + auditLine

    const { error: updErr } = await supabase
      .from('ig_creator_outreach')
      .update(update)
      .eq('id', id)
    if (updErr) {
      return NextResponse.json({
        error: 'supabase update failed (new stripe codes minted — orphaned)',
        stage: 'persist',
        detail: updErr.message,
        new_stripe_codes_minted: {
          promo_code: finalPublic,
          stripe_promotion_code_id: finalPublicId,
          personal_promo_code: finalPersonal,
          personal_stripe_promotion_code_id: finalPersonalId,
        },
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      before,
      after: {
        promo_code: finalPublic,
        stripe_promotion_code_id: finalPublicId,
        personal_promo_code: finalPersonal,
        personal_stripe_promotion_code_id: finalPersonalId,
      },
      public_ref_url: finalPublic ? `https://www.bellavego.com/ref/${finalPublic}` : null,
      dm_block: finalPublic && finalPersonal
        ? `🔥 You're in. Two codes:\n\n` +
          `1) Your personal 3-months-free code: ${finalPersonal}\n` +
          `   Sign up at https://www.bellavego.com/pricing, apply ${finalPersonal} at checkout.\n\n` +
          `2) Your fan code: ${finalPublic}\n` +
          `   They click https://www.bellavego.com/ref/${finalPublic} → $97 first month.\n` +
          `   You earn $200/paid ref (Friday after their month 2 charge clears) + $1K @ 5 refs + $3K @ 15.`
        : null,
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
