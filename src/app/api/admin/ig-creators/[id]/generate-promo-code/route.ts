import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { vanityCodeFromHandle, findAvailableCode, mintPromotionCode, ensureSharedCoupon } from '@/lib/creatorCodes'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/**
 * POST /api/admin/ig-creators/[id]/generate-promo-code
 *
 * Mints (or returns existing) the personalized Stripe promotion_code for
 * one creator. Idempotent — safe to re-call. Run automatically when a new
 * creator is added; can also be called manually if a row predates this
 * system or its code got reset.
 *
 * EVERY error path returns JSON with `error: <message>` and a sensible
 * status so the caller sees the actual reason — never returns an empty
 * body that breaks the browser's `response.json()`.
 *
 * Body (optional):
 *   { code?: string }  // force a specific vanity string instead of deriving from handle
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res
    const { id } = await ctx.params

    const { data: creator, error: fetchErr } = await supabase
      .from('ig_creator_outreach')
      .select('id, handle, promo_code, stripe_promotion_code_id')
      .eq('id', id)
      .single()

    if (fetchErr || !creator) {
      return NextResponse.json({ error: 'creator not found', detail: fetchErr?.message }, { status: 404 })
    }

    if (creator.promo_code && creator.stripe_promotion_code_id) {
      return NextResponse.json({
        ok: true,
        already_minted: true,
        promo_code: creator.promo_code,
        stripe_promotion_code_id: creator.stripe_promotion_code_id,
        ref_url: `https://www.bellavego.com/ref/${creator.promo_code}`,
      })
    }

    let body: { code?: string } = {}
    try { body = await req.json() } catch { /* body optional */ }

    const base = body.code
      ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
      : vanityCodeFromHandle(creator.handle as string)
    if (!base) {
      return NextResponse.json({ error: 'could not derive a valid promo code from handle', handle: creator.handle }, { status: 400 })
    }

    // ── Stage: ensure coupon ──
    try {
      await ensureSharedCoupon(stripe)
    } catch (e) {
      const err = e as { message?: string; code?: string; type?: string; raw?: { message?: string } }
      return NextResponse.json({
        error: 'stripe coupon setup failed',
        stage: 'ensureSharedCoupon',
        detail: err.raw?.message || err.message || String(e),
        code: err.code,
        type: err.type,
      }, { status: 502 })
    }

    // ── Stage: pick a free promo_code slot ──
    let finalCode: string
    try {
      finalCode = await findAvailableCode(supabase, base)
    } catch (e) {
      const err = e as { message?: string }
      return NextResponse.json({
        error: 'failed to find available promo code',
        stage: 'findAvailableCode',
        detail: err.message || String(e),
      }, { status: 500 })
    }

    // ── Stage: mint Stripe promotion_code pointing at the shared coupon ──
    let promoId: string
    try {
      const promo = await mintPromotionCode(stripe, finalCode, {
        creator_id: String(creator.id),
        creator_handle: String(creator.handle),
      })
      promoId = promo.id
    } catch (e) {
      const err = e as { message?: string; code?: string; type?: string; raw?: { message?: string } }
      return NextResponse.json({
        error: 'stripe promotion_code create failed',
        stage: 'mintPromotionCode',
        attempted_code: finalCode,
        detail: err.raw?.message || err.message || String(e),
        code: err.code,
        type: err.type,
      }, { status: 502 })
    }

    // ── Stage: persist back to Supabase ──
    const { error: updErr } = await supabase
      .from('ig_creator_outreach')
      .update({
        promo_code: finalCode,
        stripe_promotion_code_id: promoId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updErr) {
      return NextResponse.json({
        error: 'supabase update failed (stripe promo created — orphaned)',
        stage: 'persist',
        detail: updErr.message,
        promo_code: finalCode,
        stripe_promotion_code_id: promoId,
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      already_minted: false,
      promo_code: finalCode,
      stripe_promotion_code_id: promoId,
      ref_url: `https://www.bellavego.com/ref/${finalCode}`,
    })
  } catch (e) {
    // Catch-all so the browser never sees an empty 500.
    const err = e as { message?: string; stack?: string }
    return NextResponse.json({
      error: 'unhandled exception',
      detail: err.message || String(e),
      // Surface stack only in non-prod to avoid leaking impl details.
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    }, { status: 500 })
  }
}
