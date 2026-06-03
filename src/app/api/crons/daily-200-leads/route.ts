import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * GET /api/crons/daily-200-leads
 *
 * Runs 4am CST daily. Picks the next Sun Belt metro in rotation, scrapes
 * Apify Google Maps for HVAC ≤50 reviews, hard-dedupes against every
 * existing outreach_leads row, inserts up to 200 with source tagged
 * `daily-200-{YYYY-MM-DD}`. SMS Peter when complete with link to xlsx.
 *
 * 14-day rotation = 2,800 fresh dial-ready leads while Instantly cold email
 * warmup runs. Each prospect gets a personalized sample-report URL Peter
 * can SMS during the call via /api/admin/send-report-sms.
 *
 * Auth: x-vercel-cron OR x-admin-secret header.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null

const APIFY_TOKEN = process.env.APIFY_API_TOKEN

// 14-day rotation. Index = (days since epoch) % 14.
// Same prospect base for 14 days then recycles — by which time accumulated
// outreach_leads has 2,800+ already-touched shops, so dedup keeps it clean.
const CITY_ROTATION: Array<{ city: string; state: string }[]> = [
  [{ city: 'Las Vegas', state: 'NV' }, { city: 'Henderson', state: 'NV' }],
  [{ city: 'Tampa', state: 'FL' }, { city: 'Orlando', state: 'FL' }],
  [{ city: 'Houston', state: 'TX' }, { city: 'Sugar Land', state: 'TX' }],
  [{ city: 'Dallas', state: 'TX' }, { city: 'Plano', state: 'TX' }],
  [{ city: 'Austin', state: 'TX' }],
  [{ city: 'San Antonio', state: 'TX' }],
  [{ city: 'Atlanta', state: 'GA' }, { city: 'Marietta', state: 'GA' }],
  [{ city: 'Jacksonville', state: 'FL' }, { city: 'St. Petersburg', state: 'FL' }],
  [{ city: 'Miami', state: 'FL' }, { city: 'Fort Lauderdale', state: 'FL' }],
  [{ city: 'Charlotte', state: 'NC' }, { city: 'Raleigh', state: 'NC' }],
  [{ city: 'Nashville', state: 'TN' }, { city: 'Knoxville', state: 'TN' }],
  [{ city: 'Birmingham', state: 'AL' }, { city: 'Mobile', state: 'AL' }],
  [{ city: 'Oklahoma City', state: 'OK' }, { city: 'Tulsa', state: 'OK' }],
  [{ city: 'Phoenix', state: 'AZ' }, { city: 'Mesa', state: 'AZ' }],
]

const MAX_REVIEWS = 50
const MIN_REVIEWS = 3
const PER_CITY_LIMIT = 120
const TARGET_INSERT = 200

async function runApify(query: string): Promise<unknown[]> {
  const start = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${APIFY_TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: PER_CITY_LIMIT,
        language: 'en',
        searchMatching: 'all',
      }),
    },
  )
  const startJson = await start.json()
  const runId = startJson?.data?.id
  if (!runId) throw new Error(`Apify start ${start.status}: ${JSON.stringify(startJson).slice(0, 150)}`)

  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const sr = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`)
    const sj = await sr.json()
    const st = sj?.data?.status
    if (st === 'SUCCEEDED') break
    if (st === 'FAILED' || st === 'ABORTED' || st === 'TIMED-OUT') throw new Error(`Apify ${st}`)
  }

  const ds = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${APIFY_TOKEN}&format=json&clean=1`,
  )
  return await ds.json()
}

async function loadDedupSets(): Promise<{ emails: Set<string>; bizCity: Set<string> }> {
  const emails = new Set<string>()
  const bizCity = new Set<string>()
  let offset = 0
  while (true) {
    const { data } = await supabase
      .from('outreach_leads')
      .select('email, business_name, city')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      if (r.email) emails.add(r.email.toLowerCase().trim())
      if (r.business_name && r.city) {
        bizCity.add(`${r.business_name.toLowerCase().trim()}|${r.city.toLowerCase().trim()}`)
      }
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return { emails, bizCity }
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  const adminSecret = req.headers.get('x-admin-secret')
  const expected = process.env.ADMIN_API_SECRET
  if (!isCron && (!expected || adminSecret !== expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!APIFY_TOKEN) return NextResponse.json({ error: 'APIFY_API_TOKEN missing' }, { status: 500 })

  const url = new URL(req.url)
  const dayOverride = url.searchParams.get('day')
  const cityIdxOverride = url.searchParams.get('cityIdx')

  // Day-based rotation. Override via ?cityIdx=N for manual runs.
  const epochDay = Math.floor(Date.now() / 86_400_000)
  const cityIdx = cityIdxOverride
    ? parseInt(cityIdxOverride, 10)
    : epochDay % CITY_ROTATION.length
  const cities = CITY_ROTATION[cityIdx]

  const todayStr = dayOverride || new Date().toISOString().slice(0, 10)
  const sourceTag = `daily-200-${todayStr}`

  const dedup = await loadDedupSets()

  type FreshLead = {
    email: string | null
    business_name: string
    owner_phone: string | null
    city: string
    state: string
    trade: string
    review_count: number
    website: string | null
  }
  const fresh: FreshLead[] = []
  const cityStats: Record<string, { raw: number; kept: number }> = {}

  for (const t of cities) {
    if (fresh.length >= TARGET_INSERT) break
    const query = `HVAC ${t.city} ${t.state}`
    let raw: unknown[] = []
    try {
      raw = await runApify(query)
    } catch (e) {
      cityStats[query] = { raw: 0, kept: 0 }
      console.warn(`[daily-200] ${query} failed: ${(e as Error).message}`)
      continue
    }
    cityStats[query] = { raw: raw.length, kept: 0 }

    for (const rUnknown of raw) {
      if (fresh.length >= TARGET_INSERT) break
      const r = rUnknown as Record<string, unknown> & {
        title?: string
        name?: string
        reviewsCount?: number
        reviews?: number
        email?: string
        emails?: string[]
        contactEmail?: string
        phone?: string
        phoneUnformatted?: string
        contactPhone?: string
        website?: string
        url?: string
        city?: string
      }
      const title = r.title || r.name || ''
      const reviewCount = Number(r.reviewsCount ?? r.reviews ?? 0)
      const email =
        r.email ||
        (Array.isArray(r.emails) && r.emails[0]) ||
        r.contactEmail ||
        null
      const phone = r.phone || r.phoneUnformatted || r.contactPhone || null
      const website = r.website || r.url || null
      const cityClean = (r.city || t.city).trim()

      if (reviewCount < MIN_REVIEWS || reviewCount > MAX_REVIEWS) continue
      if (!title) continue
      // require AT LEAST a phone to be useful for dialing
      if (!phone) continue

      const emailLower = email?.toLowerCase().trim()
      const bizKey = `${title.toLowerCase().trim()}|${cityClean.toLowerCase()}`

      if (emailLower && dedup.emails.has(emailLower)) continue
      if (dedup.bizCity.has(bizKey)) continue

      fresh.push({
        email: emailLower || null,
        business_name: title,
        owner_phone: phone,
        city: cityClean,
        state: t.state,
        trade: 'HVAC',
        review_count: reviewCount,
        website,
      })
      if (emailLower) dedup.emails.add(emailLower)
      dedup.bizCity.add(bizKey)
      cityStats[query].kept++
    }
  }

  // Insert
  let inserted = 0
  for (let i = 0; i < fresh.length; i += 100) {
    const batch = fresh.slice(i, i + 100).map((l) => ({
      ...l,
      status: 'queued',
      source: sourceTag,
    }))
    const { error } = await supabase.from('outreach_leads').insert(batch)
    if (!error) inserted += batch.length
  }

  // SMS Peter
  if (twilioClient && process.env.FALLBACK_OWNER_PHONE && process.env.TWILIO_PHONE_NUMBER) {
    const cityList = cities.map((c) => c.city).join(' + ')
    const xlsxUrl = `https://www.bellavego.com/api/admin/dial-list?date=${todayStr}&format=xlsx&secret=${encodeURIComponent(expected || '')}`
    try {
      await twilioClient.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,
        to: process.env.FALLBACK_OWNER_PHONE,
        body:
          `📞 Today's dial list ready\n` +
          `${inserted} fresh ICP leads · ${cityList}\n` +
          `≤50 reviews · all phone-having · zero repeats\n\n` +
          `xlsx: ${xlsxUrl}`,
      })
    } catch (e) {
      console.error('[daily-200] SMS failed:', (e as Error).message)
    }
  }

  return NextResponse.json({
    ok: true,
    date: todayStr,
    city_idx: cityIdx,
    cities: cities.map((c) => `${c.city}, ${c.state}`),
    raw_seen: Object.values(cityStats).reduce((s, c) => s + c.raw, 0),
    inserted,
    source: sourceTag,
    per_city: cityStats,
  })
}
