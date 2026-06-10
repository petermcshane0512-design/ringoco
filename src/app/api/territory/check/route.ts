import { NextRequest, NextResponse } from 'next/server'
import { checkTerritory } from '@/lib/territory'

export const runtime = 'nodejs'

/**
 * GET /api/territory/check?zip=12345&trade=hvac
 *
 * Public. Returns the current territorial status of a (zip, trade)
 * pair. Called by /start/area's client form to decide whether to send
 * the prospect into checkout or into the waitlist.
 *
 * Response shape:
 *   { ok: true, status: 'open' | 'claimed' | 'grace', released_at?: string }
 *
 * Fail-open: if Supabase errors, returns 'open' (better to risk a rare
 * collision the webhook can refund than to block a real customer at
 * checkout because Supabase blipped).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const zip = (searchParams.get('zip') || '').trim().slice(0, 5)
  const trade = (searchParams.get('trade') || '').trim().toLowerCase()
  if (!zip || !trade) {
    return NextResponse.json({ ok: false, error: 'zip and trade required' }, { status: 400 })
  }
  const { status, row } = await checkTerritory(zip, trade)
  return NextResponse.json({
    ok: true,
    status,
    released_at: row?.released_at ?? null,
  })
}
