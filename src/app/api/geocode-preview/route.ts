import { NextRequest, NextResponse } from 'next/server'
import { geocodeBusinessAddress } from '@/lib/geocodeBusinessAddress'

export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * POST /api/geocode-preview
 *
 * Public-ish (per-IP rate limit only). Geocodes a free-text address via
 * Google Maps and returns the formatted address + lat/lng so /start/area
 * can show the contractor a "did we read this right?" confirmation step
 * BEFORE Stripe checkout fires. Catches the silent failure mode where a
 * typo ("Saint" vs "St", "Drive" vs "Dr", wrong-state zip) maps to the
 * wrong neighborhood and they get 4 weeks of leads they cannot service.
 *
 * Cost: $0.005 per geocode (Google's free tier covers ~40K/mo).
 *
 * Body: { address: string }
 * Returns:
 *   { ok: true, formatted: string, lat: number, lng: number }
 *   { ok: false, error: string }
 */

// Track per-IP burst calls in memory. Lightweight — restart wipes the
// counters. 10/min/IP is fine for a multi-tab signup; scanner floods
// get a 429.
const ipHits = new Map<string, { count: number; windowStart: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 10

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipHits.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    ipHits.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  if (entry.count > MAX_PER_WINDOW) return false
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!rateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429 })
  }

  let body: { address?: string } = {}
  try { body = await req.json() } catch { /* */ }
  const address = (body.address || '').trim()
  if (address.length < 8) {
    return NextResponse.json({ ok: false, error: 'address too short' }, { status: 400 })
  }
  if (address.length > 200) {
    return NextResponse.json({ ok: false, error: 'address too long' }, { status: 400 })
  }

  const result = await geocodeBusinessAddress(address)
  if (!result) {
    return NextResponse.json({ ok: false, error: 'could not geocode that address' }, { status: 422 })
  }
  return NextResponse.json({
    ok: true,
    formatted: result.formatted,
    lat: result.lat,
    lng: result.lng,
  })
}
