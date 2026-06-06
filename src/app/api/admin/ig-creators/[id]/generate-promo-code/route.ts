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
 * Body (optional):
 *   { code?: string }  // force a specific vanity string instead of deriving from handle
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { id } = await ctx.params

  const { data: creator, error: fetchErr } = await supabase
    .from('ig_creator_outreach')
    .select('id, handle, promo_code, stripe_promotion_code_id')
    .eq('id', id)
    .single()

  if (fetchErr || !creator) {
    return NextResponse.json({ error: 'creator not found' }, { status: 404 })
  }

  // If we've already minted a code for this row, return it.
  if (creator.promo_code && creator.stripe_promotion_code_id) {
    return NextResponse.json({
      ok: true,
      already_minted: true,
      promo_code: creator.promo_code,
      stripe_promotion_code_id: creator.stripe_promotion_code_id,
    })
  }

  let body: { code?: string } = {}
  try { body = await req.json() } catch { /* body optional */ }

  // Build the vanity string — either override from body, or derive from handle.
  const base = body.code
    ? body.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
    : vanityCodeFromHandle(creator.handle as string)
  if (!base) {
    return NextResponse.json({ error: 'could not derive a valid promo code from handle' }, { status: 400 })
  }

  // Make sure the shared coupon exists before we point a promotion_code at it.
  await ensureSharedCoupon(stripe)

  const finalCode = await findAvailableCode(supabase, base)

  const promo = await mintPromotionCode(stripe, finalCode, {
    creator_id: String(creator.id),
    creator_handle: String(creator.handle),
  })

  const { error: updErr } = await supabase
    .from('ig_creator_outreach')
    .update({
      promo_code: finalCode,
      stripe_promotion_code_id: promo.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    already_minted: false,
    promo_code: finalCode,
    stripe_promotion_code_id: promo.id,
    ref_url: `https://www.bellavego.com/ref/${finalCode}`,
  })
}
