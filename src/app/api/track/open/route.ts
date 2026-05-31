import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * GET /api/track/open?l=<lead_id>
 *
 * 1x1 transparent GIF pixel embedded in cold-email body. When prospect
 * opens the email, their mail client requests this image → we log the
 * open + timestamp.
 *
 * Caveat: Gmail proxies image fetches (Mail Privacy Protection). An open
 * here means "Gmail prefetched on behalf of the user" — not always a
 * human eye. Still directionally useful when comparing per-variant
 * relative open rates.
 *
 * Returns a 1x1 transparent GIF regardless of DB outcome so mail clients
 * never render a broken-image icon.
 */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const leadId = url.searchParams.get('l') || url.searchParams.get('lead_id') || null

  if (leadId) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      // Atomically bump open_count + set first_opened_at if null + set last_opened_at.
      // Use raw rpc-style update — Supabase JS client can't increment a column directly
      // without a custom SQL function, so we read-then-write.
      const { data: existing } = await supabase
        .from('outreach_leads')
        .select('first_opened_at, open_count')
        .eq('id', leadId)
        .maybeSingle()
      if (existing) {
        await supabase
          .from('outreach_leads')
          .update({
            first_opened_at: existing.first_opened_at ?? new Date().toISOString(),
            last_opened_at: new Date().toISOString(),
            open_count: (existing.open_count ?? 0) + 1,
          })
          .eq('id', leadId)
      }
    } catch (e) {
      console.error('open tracking write failed:', e)
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
