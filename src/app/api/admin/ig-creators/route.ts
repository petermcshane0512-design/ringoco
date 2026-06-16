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

export const runtime = 'nodejs'

/**
 * GET  /api/admin/ig-creators              â€” list all, optional ?status=
 * POST /api/admin/ig-creators              â€” create new creator (body: handle, followers, trade, hashtag_source, notes)
 *
 * Manual IG creator outreach tracking. Peter sends DMs by hand,
 * logs progress here. NO SCRAPING per CLAUDE.md.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const VALID_STATUS = ['saved', 'dmed', 'replied_yes', 'replied_no', 'active_creator', 'paid_bonus_hit', 'dropped']

export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  let q = supabase
    .from('ig_creator_outreach')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(500)
  if (status && VALID_STATUS.includes(status)) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Summary counts
  const { data: counts } = await supabase
    .from('ig_creator_outreach')
    .select('status')
  const byStatus: Record<string, number> = {}
  for (const r of counts ?? []) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
  }

  // This week's DM count
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: dmedThisWeek } = await supabase
    .from('ig_creator_outreach')
    .select('*', { count: 'exact', head: true })
    .gte('dmed_at', weekAgo)
  const { count: repliesThisWeek } = await supabase
    .from('ig_creator_outreach')
    .select('*', { count: 'exact', head: true })
    .gte('replied_at', weekAgo)

  return NextResponse.json({
    ok: true,
    creators: data ?? [],
    stats: {
      total: counts?.length ?? 0,
      by_status: byStatus,
      dmed_this_week: dmedThisWeek ?? 0,
      replies_this_week: repliesThisWeek ?? 0,
    },
  })
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res

  let body: {
    handle?: string
    followers?: number
    trade?: string
    hashtag_source?: string
    notes?: string
    status?: string
    // 2026-06-06 â€” Peter wants to name codes manually. If provided, these
    // override the auto-derived `{HANDLE}` / `{HANDLE}3MO` strings.
    public_code?: string
    personal_code?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  function sanitize(s: string | undefined): string | null {
    if (!s) return null
    const out = s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
    return out || null
  }
  const publicCodeOverride = sanitize(body.public_code)
  const personalCodeOverride = sanitize(body.personal_code)

  const handle = (body.handle || '').trim().replace(/^@/, '').toLowerCase()
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 })

  // Legacy free_trial_code kept on the row for back-compat â€” anyone hitting
  // /ref/BAVG-XXXXXX from old DMs still resolves. New attribution pivot
  // (2026-06-06) uses promo_code (the personalized Stripe promotion_code).
  const free_trial_code = `BAVG-${handle.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')}`

  // Schema has UNIQUE INDEX (lower(handle)) â€” a functional index, not a
  // plain UNIQUE column constraint. Supabase's upsert `onConflict: 'handle'`
  // requires a real column constraint and 500s otherwise with:
  //   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
  //
  // Fix: plain INSERT; on 23505 (unique_violation), fetch the existing row
  // and patch the fields. Same pattern used by the ig-creator-discovery cron.
  const insertPayload = {
    handle,
    followers: body.followers ?? null,
    trade: body.trade || null,
    hashtag_source: body.hashtag_source || null,
    notes: body.notes || null,
    status: body.status && VALID_STATUS.includes(body.status) ? body.status : 'saved',
    free_trial_code,
    updated_at: new Date().toISOString(),
  }

  let created: Record<string, unknown> | null = null
  const insertRes = await supabase
    .from('ig_creator_outreach')
    .insert(insertPayload)
    .select('*')
    .single()

  if (insertRes.error) {
    // 23505 = unique_violation. Find by handle (case-insensitive) and update.
    const code = (insertRes.error as { code?: string }).code
    if (code !== '23505') {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
    }
    const { data: existing } = await supabase
      .from('ig_creator_outreach')
      .select('*')
      .ilike('handle', handle)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'unique violation but no matching row found' }, { status: 500 })
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.followers != null) patch.followers = body.followers
    if (body.trade) patch.trade = body.trade
    if (body.hashtag_source) patch.hashtag_source = body.hashtag_source
    if (body.notes) patch.notes = body.notes
    if (body.status && VALID_STATUS.includes(body.status)) patch.status = body.status
    const { data: patched, error: patchErr } = await supabase
      .from('ig_creator_outreach')
      .update(patch)
      .eq('id', (existing as { id: string }).id)
      .select('*')
      .single()
    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 })
    created = patched as Record<string, unknown>
  } else {
    created = insertRes.data as Record<string, unknown>
  }

  if (!created) return NextResponse.json({ error: 'no row produced' }, { status: 500 })

  // Auto-mint BOTH promo codes for this creator:
  //   PUBLIC   ($400 off first month for fans, multi-use)        â†’ promo_code
  //   PERSONAL (3 months free Pro for the creator, single-use)   â†’ personal_promo_code
  //
  // Each stage wrapped â€” if Stripe blips on one, the creator still
  // exists and we can re-run via /generate-promo-code later.
  let promo_code: string | null = (created.promo_code as string | null | undefined) ?? null
  let stripe_promotion_code_id: string | null = (created.stripe_promotion_code_id as string | null | undefined) ?? null
  let personal_promo_code: string | null = (created.personal_promo_code as string | null | undefined) ?? null
  let personal_stripe_promotion_code_id: string | null = (created.personal_stripe_promotion_code_id as string | null | undefined) ?? null

  if (!promo_code) {
    try {
      const base = publicCodeOverride || vanityCodeFromHandle(handle)
      if (base) {
        await ensureSharedCoupon(stripe)
        // If user provided an explicit override, fail loudly on collision
        // rather than appending a suffix â€” they care about the exact string.
        let finalCode: string
        if (publicCodeOverride) {
          const { data: clash } = await supabase
            .from('ig_creator_outreach')
            .select('id, handle')
            .eq('promo_code', publicCodeOverride)
            .maybeSingle()
          if (clash) {
            console.warn('[admin/ig-creators] public_code collision', publicCodeOverride, clash)
            // fall back to auto-derive instead of erroring the whole add
            finalCode = await findAvailableCode(supabase, vanityCodeFromHandle(handle), 'promo_code')
          } else {
            finalCode = publicCodeOverride
          }
        } else {
          finalCode = await findAvailableCode(supabase, base, 'promo_code')
        }
        const promo = await mintPromotionCode(stripe, finalCode, {
          creator_id: String(created.id),
          creator_handle: handle,
        })
        await supabase
          .from('ig_creator_outreach')
          .update({
            promo_code: finalCode,
            stripe_promotion_code_id: promo.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', created.id)
        promo_code = finalCode
        stripe_promotion_code_id = promo.id
      }
    } catch (e) {
      console.warn('[admin/ig-creators] public promo_code mint failed for', handle, e)
    }
  }

  if (!personal_promo_code) {
    try {
      const base = personalCodeOverride || personalCodeFromHandle(handle)
      if (base) {
        await ensurePersonalCoupon(stripe)
        let finalCode: string
        if (personalCodeOverride) {
          const { data: clash } = await supabase
            .from('ig_creator_outreach')
            .select('id, handle')
            .eq('personal_promo_code', personalCodeOverride)
            .maybeSingle()
          if (clash) {
            console.warn('[admin/ig-creators] personal_code collision', personalCodeOverride, clash)
            finalCode = await findAvailableCode(supabase, personalCodeFromHandle(handle), 'personal_promo_code')
          } else {
            finalCode = personalCodeOverride
          }
        } else {
          finalCode = await findAvailableCode(supabase, base, 'personal_promo_code')
        }
        const promo = await mintPersonalPromotionCode(stripe, finalCode, {
          creator_id: String(created.id),
          creator_handle: handle,
          kind: 'personal_3mo_free',
        })
        await supabase
          .from('ig_creator_outreach')
          .update({
            personal_promo_code: finalCode,
            personal_stripe_promotion_code_id: promo.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', created.id)
        personal_promo_code = finalCode
        personal_stripe_promotion_code_id = promo.id
      }
    } catch (e) {
      console.warn('[admin/ig-creators] personal promo_code mint failed for', handle, e)
    }
  }

  return NextResponse.json({
    ok: true,
    creator: {
      ...created,
      promo_code,
      stripe_promotion_code_id,
      personal_promo_code,
      personal_stripe_promotion_code_id,
    },
    public_ref_url: promo_code ? `https://www.bellavego.com/ref/${promo_code}` : null,
    personal_signup_code: personal_promo_code,
    // Convenience block â€” paste-ready for Peter's DM follow-up.
    dm_block: promo_code && personal_promo_code
      ? `Your personal 3-months-free code: ${personal_promo_code}\nSignup: https://www.bellavego.com/pricing\nApply ${personal_promo_code} at checkout.\n\nYour fan code (give to your followers): ${promo_code}\nThey use https://www.bellavego.com/ref/${promo_code} and get a free first month.`
      : null,
  })
}
