import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * POST /api/opportunity-check/waitlist
 *
 * Email capture for the homepage zip-checker fallback. Two reasons we land here:
 *   - 'uncovered' — zip has no scraper coverage / <10 real leads in 90d
 *   - 'claimed'   — zip+trade slot is already taken
 *
 * Body: { email, zip, trade, reason }
 *
 * Idempotent on (email, zip, trade). Never blocks the response on a dup.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: { email?: string; zip?: string; trade?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const email = (body.email || '').trim().toLowerCase().slice(0, 200)
  const zip = (body.zip || '').replace(/\D/g, '').slice(0, 5)
  const trade = (body.trade || '').toLowerCase().trim().slice(0, 80)
  const reason = body.reason === 'claimed' ? 'claimed' : 'uncovered'

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'invalid email' }, { status: 400 })
  }
  if (zip.length !== 5) {
    return NextResponse.json({ ok: false, error: 'zip must be 5 digits' }, { status: 400 })
  }
  if (!trade) {
    return NextResponse.json({ ok: false, error: 'trade required' }, { status: 400 })
  }

  const { error } = await supabase.from('opportunity_waitlist').upsert({
    email,
    zip,
    trade,
    reason,
    promo: req.cookies.get('bavg_promo')?.value || null,
    ref_code: req.cookies.get('bavg_ref')?.value || req.cookies.get('bavg_creator_code')?.value || null,
  }, { onConflict: 'email,zip,trade' })

  if (error) {
    console.warn('[opportunity-check/waitlist] insert err', error)
    return NextResponse.json({ ok: false, error: 'save failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
