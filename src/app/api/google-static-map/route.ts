import { NextRequest, NextResponse } from 'next/server'
import { getGoogleApiKey } from '@/lib/googleApi'

/**
 * Server-side proxy for Google Static Maps API.
 *
 * Why proxy instead of direct img src: the API key stays server-side
 * (no exposure in HTML). Client renders <img src="/api/google-static-map?center=..." />.
 *
 * Cost: $2 per 1,000 requests. At 100 reports/month we're at ~$0.20/month.
 *
 * Required Google Cloud setup:
 *   - Enable "Maps Static API" on the project key
 *   - Recommended: HTTP referrer restriction = bellavego.com/* + localhost/*
 *
 * Query params:
 *   center=Minneapolis,MN  (required — address or lat,lng)
 *   zoom=12                (default 12)
 *   size=1000x430          (default 1000x430 — matches the report's 21:9 ratio)
 *   maptype=roadmap        (default roadmap; satellite | terrain | hybrid valid)
 *   markers=...            (optional, can repeat — passed through to Google)
 */
export async function GET(req: NextRequest) {
  const apiKey = getGoogleApiKey()
  if (!apiKey) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 503 })
  }

  const { searchParams } = req.nextUrl
  const center = searchParams.get('center')
  if (!center) {
    return NextResponse.json({ error: 'center param required' }, { status: 400 })
  }
  const zoom = searchParams.get('zoom') ?? '12'
  const size = searchParams.get('size') ?? '1000x430'
  const maptype = searchParams.get('maptype') ?? 'roadmap'
  const scale = searchParams.get('scale') ?? '2'  // retina-quality for sharp rendering on hi-DPI

  const upstream = new URL('https://maps.googleapis.com/maps/api/staticmap')
  upstream.searchParams.set('center', center)
  upstream.searchParams.set('zoom', zoom)
  upstream.searchParams.set('size', size)
  upstream.searchParams.set('maptype', maptype)
  upstream.searchParams.set('scale', scale)
  upstream.searchParams.set('key', apiKey)
  // Pass through any markers= params (Google supports multiple)
  searchParams.getAll('markers').forEach(m => upstream.searchParams.append('markers', m))

  try {
    const res = await fetch(upstream.toString(), { cache: 'force-cache' })
    if (!res.ok) {
      const errText = await res.text()
      console.error('[google-static-map] upstream error', res.status, errText.slice(0, 200))
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: 502 })
    }
    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        // Aggressive cache — same address + zoom should hit edge cache
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
      },
    })
  } catch (e) {
    console.error('[google-static-map] fetch failed:', e)
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
