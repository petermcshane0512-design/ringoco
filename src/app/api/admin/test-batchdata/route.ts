import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { skipTraceAddress } from '@/lib/skipTrace'

export const runtime = 'nodejs'

/**
 * POST /api/admin/test-batchdata
 *
 * One-off verification — fires a single BatchData skip-trace request
 * against any address we hand it. Returns the raw shape we get back so
 * we can confirm:
 *   - BATCHDATA_API_KEY env var is loaded and valid
 *   - BatchData account has prepaid balance
 *   - The response parser in src/lib/skipTrace.ts handles the shape
 *
 * Costs ~$0.10 per call. Idempotent in the sense that you can call it
 * repeatedly without hitting any DB state, but every call burns 10c of
 * your BatchData balance.
 *
 * Body:
 *   { street: string, city?: string, state?: string, zip?: string }
 *
 * Returns the SkipTraceResult shape from skipTrace.ts.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (!gate.ok) return gate.res

    let body: { street?: string; city?: string; state?: string; zip?: string } = {}
    try { body = await req.json() } catch { /* body optional */ }

    // Sensible default — a real Phoenix address (any well-known building
    // — used the AZ State Capitol here — so the caller can hit POST with
    // no body to just verify the integration.)
    const street = body.street?.trim() || '1700 W Washington St'
    const city   = body.city?.trim()   || 'Phoenix'
    const state  = body.state?.trim()  || 'AZ'
    const zip    = body.zip?.trim()    || '85007'

    if (!process.env.BATCHDATA_API_KEY) {
      return NextResponse.json({
        ok: false,
        error: 'BATCHDATA_API_KEY env var not set on this deploy',
      }, { status: 500 })
    }

    const r = await skipTraceAddress({ street, city, state, zip })

    return NextResponse.json({
      ok: r.ok,
      input: { street, city, state, zip },
      result: {
        hit: r.hit,
        owner_name: r.owner_name ?? null,
        owner_phones: r.owner_phones ?? [],
        owner_emails: r.owner_emails ?? [],
        cost_cents: r.cost_cents,
        error: r.error ?? null,
      },
      // Truncate raw to top-level keys so the console output stays readable.
      raw_top_level_keys: r.raw_response && typeof r.raw_response === 'object'
        ? Object.keys(r.raw_response as Record<string, unknown>)
        : null,
    })
  } catch (e) {
    const err = e as { message?: string; stack?: string }
    return NextResponse.json({
      ok: false,
      error: 'unhandled exception',
      detail: err.message || String(e),
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
    }, { status: 500 })
  }
}
