import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export const runtime = 'nodejs'
export const maxDuration = 90

/**
 * POST /api/admin/enrich-phone — fetch a contractor's PUBLIC business phone
 * from their Google Business listing (2026-06-12, CEO Nucleus). Body:
 * { email }. Looks up the outreach_leads row for business_name + city +
 * state, runs an Apify Google-Places search, takes the top match's phone,
 * stores it on outreach_leads.owner_phone, and returns it.
 *
 * Targeted spend only — called per queue row from the dashboard, for the
 * hot leads worth dialing. ~1-5¢ each. Apify is the same actor refill uses.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const APIFY_MAPS_ACTOR = 'compass~crawler-google-places'
const APIFY_TOKEN = process.env.APIFY_API_TOKEN

type MapsItem = { title?: string; phone?: string; phoneUnformatted?: string; website?: string }

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  if (!APIFY_TOKEN) return NextResponse.json({ ok: false, error: 'APIFY_API_TOKEN not set' }, { status: 503 })

  let body: { email?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const email = (body.email || '').toLowerCase().trim()
  if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 })

  const { data: ol } = await supabase
    .from('outreach_leads')
    .select('email, business_name, owner_phone, city, state')
    .eq('email', email)
    .maybeSingle()
  if (!ol) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 })
  if (ol.owner_phone) return NextResponse.json({ ok: true, phone: ol.owner_phone, cached: true })
  if (!ol.business_name) return NextResponse.json({ ok: false, error: 'no business name to search' }, { status: 422 })

  const query = [ol.business_name, ol.city, ol.state].filter(Boolean).join(', ')
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${APIFY_MAPS_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: 1,
        language: 'en', countryCode: 'us',
        skipClosedPlaces: false, onlyDataFromSearchPage: true, includeWebResults: false,
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ ok: false, error: `apify HTTP ${res.status}: ${txt.slice(0, 160)}` }, { status: 502 })
    }
    const items = (await res.json()) as MapsItem[]
    const phone = items?.[0]?.phoneUnformatted || items?.[0]?.phone || null
    const website = items?.[0]?.website || null
    if (!phone) return NextResponse.json({ ok: false, error: 'no phone on the Google listing' }, { status: 200 })

    await supabase.from('outreach_leads').update({
      owner_phone: phone,
      ...(website ? { website_domain: website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].slice(0, 120) } : {}),
    }).eq('email', email)

    return NextResponse.json({ ok: true, phone, website, cached: false })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
