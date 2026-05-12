import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Auto-resolve google_place_id + zip_code for a customer using Google Places.
 *
 * Called once at the end of onboarding (and again from /api/diagnostics if it
 * didn't fire). Reads the contractor's saved profile (business_name + owner_phone
 * + service_area) and queries Places text search for the best match.
 *
 * If found: writes google_place_id, zip_code, business_address to profiles.
 * If not found or no API key: silently returns ok with `resolved: false` so
 * onboarding never blocks.
 */
export async function POST() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return NextResponse.json({ ok: true, resolved: false, reason: 'no_api_key' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, owner_phone, service_area, business_address, google_place_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!profile?.business_name) {
    return NextResponse.json({ ok: true, resolved: false, reason: 'no_business_name' })
  }

  // Already resolved — don't pay the API again
  if (profile.google_place_id) {
    return NextResponse.json({ ok: true, resolved: true, cached: true })
  }

  // Build a precise search query — name + service_area beats name alone for
  // distinguishing the local Smith Plumbing from the 80 other Smith Plumbings.
  const query = [profile.business_name, profile.service_area]
    .filter(Boolean)
    .join(' ')

  try {
    const searchRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`,
      { next: { revalidate: 0 } },
    )
    const searchData = (await searchRes.json()) as {
      results?: { place_id: string; formatted_address?: string; name?: string }[]
    }
    const top = searchData.results?.[0]
    if (!top?.place_id) {
      return NextResponse.json({ ok: true, resolved: false, reason: 'no_match' })
    }

    // Pull details for the formatted address (zip parsing) + phone
    const detailsRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${top.place_id}&fields=name,formatted_address,address_components&key=${apiKey}`,
      { next: { revalidate: 0 } },
    )
    const detailsData = (await detailsRes.json()) as {
      result?: {
        formatted_address?: string
        address_components?: { long_name: string; short_name: string; types: string[] }[]
      }
    }
    const formatted = detailsData.result?.formatted_address || top.formatted_address || ''
    const zipComp = detailsData.result?.address_components?.find((c) =>
      c.types.includes('postal_code'),
    )
    const zip = zipComp?.short_name

    const update: Record<string, string> = { google_place_id: top.place_id }
    if (formatted) update.business_address = formatted
    if (zip) update.zip_code = zip

    await supabase.from('profiles').update(update).eq('user_id', userId)

    return NextResponse.json({
      ok: true,
      resolved: true,
      place_id: top.place_id,
      zip_code: zip,
      address: formatted,
    })
  } catch (e) {
    console.error('resolve-place failed:', e)
    return NextResponse.json({ ok: true, resolved: false, reason: 'lookup_error' })
  }
}
