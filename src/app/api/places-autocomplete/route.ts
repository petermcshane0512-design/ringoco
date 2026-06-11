import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * GET /api/places-autocomplete?q=123 main
 *
 * Server-side proxy for Google Places Autocomplete (legacy endpoint —
 * same Places API the rest of the app already has enabled, no browser
 * key / referrer restriction needed). Returns US address predictions so
 * /start/area + the dashboard ProfileGate can show a live dropdown.
 *
 * Why this exists: free-text address entry was producing un-geocodable
 * strings ("couldn't verify that address") which then left business_lat
 * null and scattered the leads. Forcing the user to PICK a real Google
 * address guarantees the downstream geocode succeeds.
 *
 * Returns: { ok: true, predictions: [{ description, place_id }] }
 * Cost: ~$0.003 per keystroke-session (session tokens not used here;
 * debounce on the client keeps call volume low).
 */

const ENDPOINT = 'https://maps.googleapis.com/maps/api/place/autocomplete/json'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim()
  if (q.length < 3) {
    return NextResponse.json({ ok: true, predictions: [] })
  }
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY
  if (!key) {
    return NextResponse.json({ ok: false, error: 'maps key not set', predictions: [] }, { status: 200 })
  }

  const url =
    `${ENDPOINT}?input=${encodeURIComponent(q)}` +
    `&types=address&components=country:us&key=${key}`

  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    const j = (await r.json()) as {
      status?: string
      error_message?: string
      predictions?: Array<{ description?: string; place_id?: string }>
    }
    if (j.status && j.status !== 'OK' && j.status !== 'ZERO_RESULTS') {
      console.warn(`[places-autocomplete] status=${j.status} ${j.error_message || ''}`)
      return NextResponse.json({ ok: false, error: j.status, predictions: [] }, { status: 200 })
    }
    const predictions = (j.predictions || [])
      .filter((p) => p.description && p.place_id)
      .slice(0, 5)
      .map((p) => ({ description: p.description as string, place_id: p.place_id as string }))
    return NextResponse.json({ ok: true, predictions })
  } catch (e) {
    console.warn('[places-autocomplete] fetch failed:', (e as Error).message)
    return NextResponse.json({ ok: false, error: 'fetch failed', predictions: [] }, { status: 200 })
  }
}
