import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { vanityCodeFromHandle, findAvailableCode, mintPromotionCode, ensureSharedCoupon } from '@/lib/creatorCodes'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

export const runtime = 'nodejs'

/**
 * GET  /api/admin/ig-creators              — list all, optional ?status=
 * POST /api/admin/ig-creators              — create new creator (body: handle, followers, trade, hashtag_source, notes)
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
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const handle = (body.handle || '').trim().replace(/^@/, '').toLowerCase()
  if (!handle) return NextResponse.json({ error: 'handle required' }, { status: 400 })

  // Legacy free_trial_code kept on the row for back-compat — anyone hitting
  // /ref/BAVG-XXXXXX from old DMs still resolves. New attribution pivot
  // (2026-06-06) uses promo_code (the personalized Stripe promotion_code).
  const free_trial_code = `BAVG-${handle.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(6, '0')}`

  const { data: created, error } = await supabase
    .from('ig_creator_outreach')
    .upsert({
      handle,
      followers: body.followers ?? null,
      trade: body.trade || null,
      hashtag_source: body.hashtag_source || null,
      notes: body.notes || null,
      status: body.status && VALID_STATUS.includes(body.status) ? body.status : 'saved',
      free_trial_code,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'handle' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-mint the personalized Stripe promotion_code so the row is fully
  // shareable the moment Peter sees it on the admin page. Wrapped in
  // try/catch — if Stripe is down, the creator still exists and we can
  // re-run /generate-promo-code later. Don't block the response.
  let promo_code: string | null = created.promo_code ?? null
  let stripe_promotion_code_id: string | null = created.stripe_promotion_code_id ?? null
  if (!promo_code) {
    try {
      const base = vanityCodeFromHandle(handle)
      if (base) {
        await ensureSharedCoupon(stripe)
        const finalCode = await findAvailableCode(supabase, base)
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
      console.warn('[admin/ig-creators] promo_code auto-mint failed for', handle, e)
    }
  }

  return NextResponse.json({
    ok: true,
    creator: { ...created, promo_code, stripe_promotion_code_id },
    ref_url: promo_code ? `https://www.bellavego.com/ref/${promo_code}` : null,
  })
}
